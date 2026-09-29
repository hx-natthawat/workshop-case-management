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

/** Download image content right away: LINE deletes it after a while (research §8). */
export async function fetchContent(messageId: string): Promise<{ data: Buffer; mimeType: string }> {
  const res = await fetch(`${DATA_API}/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: `Bearer ${config.line.accessToken()}` },
  });
  if (!res.ok) throw new Error(`LINE content ${res.status}`);
  return { data: Buffer.from(await res.arrayBuffer()), mimeType: res.headers.get('content-type') ?? 'application/octet-stream' };
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
