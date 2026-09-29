/**
 * One place that sends messages to reporters (ADR 0005).
 * - Simulator users (Usim…) → sim_message outbox.
 * - Real users → LINE Reply API, falling back to Push when the token is unusable.
 */
import { db, schema } from '@/server/db';
import type { LineMessage } from '@/server/bot/line-types';
import { config, isSimUser } from '@/server/lib/config';

const API = 'https://api.line.me/v2/bot';
const DATA_API = 'https://api-data.line.me/v2/bot';
const MAX_PER_CALL = 5; // LINE limit per reply/push request

export interface SendResult {
  ok: boolean;
  via: 'reply' | 'push' | 'sim';
  error?: string;
}

async function simDeliver(tenantId: string, lineUserId: string, messages: LineMessage[]): Promise<SendResult> {
  if (messages.length) {
    await db.insert(schema.simMessage).values(messages.map((m) => ({ tenantId, lineUserId, direction: 'bot' as const, payload: m })));
  }
  return { ok: true, via: 'sim' };
}

async function lineCall(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const token = config.line.accessToken();
  if (!token) return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN is not set' };
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const text = await res.text().catch(() => '');
  return { ok: false, error: `LINE ${path} ${res.status}: ${text.slice(0, 300)}` };
}

export async function push(tenantId: string, lineUserId: string, messages: LineMessage[]): Promise<SendResult> {
  if (!messages.length) return { ok: true, via: 'push' };
  if (isSimUser(lineUserId)) return simDeliver(tenantId, lineUserId, messages);
  for (let i = 0; i < messages.length; i += MAX_PER_CALL) {
    const r = await lineCall('/message/push', { to: lineUserId, messages: messages.slice(i, i + MAX_PER_CALL) });
    if (!r.ok) {
      console.error('[line] push failed', r.error);
      return { ok: false, via: 'push', error: r.error };
    }
  }
  return { ok: true, via: 'push' };
}

/** Reply (free) first; any overflow beyond 5 messages or an expired token goes through Push. */
export async function reply(tenantId: string, replyToken: string | undefined, lineUserId: string, messages: LineMessage[]): Promise<SendResult> {
  if (!messages.length) return { ok: true, via: 'reply' };
  if (isSimUser(lineUserId)) return simDeliver(tenantId, lineUserId, messages);
  if (replyToken) {
    const r = await lineCall('/message/reply', { replyToken, messages: messages.slice(0, MAX_PER_CALL) });
    if (r.ok) {
      const rest = messages.slice(MAX_PER_CALL);
      return rest.length ? push(tenantId, lineUserId, rest) : { ok: true, via: 'reply' };
    }
    console.warn('[line] reply failed, falling back to push', r.error);
  }
  return push(tenantId, lineUserId, messages);
}

export type ContentErrorCode = 'fetch' | 'size' | 'transcoding' | 'transcoding_failed';
export class ContentError extends Error {
  constructor(public code: ContentErrorCode, message: string) { super(message); }
}

/** Waits between transcoding checks; total ≈ 30 s (D-015). Tests shrink it. */
export const transcodingBackoff = { delaysMs: [1000, 2000, 3000, 4000, 5000, 5000, 5000, 5000] };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Read a body, giving up once it passes `maxBytes`. */
async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new ContentError('size', `content-length ${declared} > ${maxBytes}`);
  }
  if (!res.body) return Buffer.from(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ContentError('size', `content > ${maxBytes}`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Download user-sent content right away: LINE deletes it after a while (research §8).
 * Video/audio may answer 202 while LINE prepares it; then poll `/content/transcoding`
 * with a short backoff and fetch again once it reports `succeeded` (research r1 Q6).
 */
export async function fetchContent(messageId: string, opts: { maxBytes?: number } = {}): Promise<{ data: Buffer; mimeType: string }> {
  const maxBytes = opts.maxBytes ?? Number.MAX_SAFE_INTEGER;
  const base = `${DATA_API}/message/${encodeURIComponent(messageId)}/content`;
  const headers = { Authorization: `Bearer ${config.line.accessToken()}` };
  const get = () => fetch(base, { headers }).catch((e: unknown) => { throw new ContentError('fetch', String(e)); });

  let res = await get();
  if (res.status === 202) {
    await res.body?.cancel().catch(() => undefined);
    let ready = false;
    for (const wait of transcodingBackoff.delaysMs) {
      await sleep(wait);
      const t = await fetch(`${base}/transcoding`, { headers }).catch(() => null);
      const status = t?.ok ? ((await t.json().catch(() => ({}))) as { status?: string }).status : undefined;
      if (status === 'failed') throw new ContentError('transcoding_failed', 'LINE transcoding failed');
      if (status === 'succeeded') { ready = true; break; }
    }
    if (!ready) throw new ContentError('transcoding', 'LINE content still transcoding');
    res = await get();
  }
  if (res.status === 202) throw new ContentError('transcoding', 'LINE content still transcoding');
  if (!res.ok) throw new ContentError('fetch', `LINE content ${res.status}`);
  return { data: await readCapped(res, maxBytes), mimeType: res.headers.get('content-type') ?? 'application/octet-stream' };
}

export async function getProfile(lineUserId: string): Promise<{ displayName?: string } | null> {
  if (isSimUser(lineUserId) || !config.line.accessToken()) return null;
  const res = await fetch(`${API}/profile/${encodeURIComponent(lineUserId)}`, {
    headers: { Authorization: `Bearer ${config.line.accessToken()}` },
  });
  return res.ok ? res.json() : null;
}

/** Loading animation while we work (research: "ideas worth considering"). Best effort. */
export async function showLoading(lineUserId: string) {
  if (isSimUser(lineUserId) || !config.line.accessToken()) return;
  await lineCall('/chat/loading/start', { chatId: lineUserId, loadingSeconds: 5 }).catch(() => undefined);
}
