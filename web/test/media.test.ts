/**
 * Integration (D-015 / #18): video, audio and file messages replayed through the real
 * webhook handler with the LINE content API mocked, including 202 "still transcoding".
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, schema } from '@/server/db';
import { handleEvents } from '@/server/bot/handler';
import type { LineEvent, LineMessage } from '@/server/bot/line-types';
import { registerContact } from '@/server/bot/registration';
import * as caseSvc from '@/server/case/service';
import type { SessionUser } from '@/server/lib/auth';
import { defaultTenant } from '@/server/lib/tenant';
import { transcodingBackoff } from '@/server/messaging/gateway';
import { caseDetail } from '@/server/queries/cases';

type Tenant = typeof schema.tenant.$inferSelect;
let tenant: Tenant;
let supervisor: SessionUser;
const USER = `Usim${randomUUID().slice(0, 8)}`;
let lastSimId = 0;

function ev(partial: Partial<LineEvent>): LineEvent {
  return { type: 'message', webhookEventId: randomUUID(), timestamp: Date.now(), replyToken: 'sim', source: { type: 'user', userId: USER }, ...partial } as LineEvent;
}
const tap = (data: string) => ev({ type: 'postback', postback: { data } });
const video = (id: string) => ev({ message: { type: 'video', id, duration: 4000, contentProvider: { type: 'line' } } });
const audio = (id: string) => ev({ message: { type: 'audio', id, duration: 3000, contentProvider: { type: 'line' } } });
const file = (id: string, fileName: string, fileSize: number) => ev({ message: { type: 'file', id, fileName, fileSize } });
const send = (...events: LineEvent[]) => handleEvents(tenant, events);

async function botSaid(): Promise<string> {
  const rows = await db.select().from(schema.simMessage)
    .where(and(eq(schema.simMessage.lineUserId, USER), eq(schema.simMessage.direction, 'bot'), gt(schema.simMessage.id, lastSimId)))
    .orderBy(asc(schema.simMessage.id));
  if (rows.length) lastSimId = rows[rows.length - 1].id;
  return JSON.stringify(rows.map((r) => r.payload as LineMessage));
}

// ── Fake LINE content API ─────────────────────────────────────
type Fake = { status: 'ready' | 'transcoding' | 'stuck'; body: Buffer; type: string; checks?: number };
const content = new Map<string, Fake>();
const calls: string[] = [];
const realFetch = globalThis.fetch;

function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  const m = url.match(/^https:\/\/api-data\.line\.me\/v2\/bot\/message\/([^/]+)\/content(\/transcoding)?$/);
  if (!m) return realFetch(input);
  calls.push(url);
  const f = content.get(decodeURIComponent(m[1]));
  if (!f) return Promise.resolve(new Response('not found', { status: 404 }));
  if (m[2]) {
    // Transcoding check: "processing" twice, then "succeeded" (or forever "processing" when stuck).
    f.checks = (f.checks ?? 0) + 1;
    const done = f.status === 'transcoding' && f.checks >= 2;
    if (done) f.status = 'ready';
    return Promise.resolve(Response.json({ status: done ? 'succeeded' : 'processing' }));
  }
  if (f.status !== 'ready') return Promise.resolve(new Response(null, { status: 202 }));
  return Promise.resolve(new Response(new Uint8Array(f.body), { status: 200, headers: { 'Content-Type': f.type, 'Content-Length': String(f.body.length) } }));
}

const savedBackoff = transcodingBackoff.delaysMs;
beforeAll(async () => {
  tenant = await defaultTenant();
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, 'thanapol@example.com'));
  supervisor = { id: u.id, tenantId: u.tenantId, role: u.role, name: u.name, email: u.email, teamId: u.teamId, mfaEnabled: false };
  transcodingBackoff.delaysMs = [5, 5, 5, 5];
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  await send(ev({ type: 'follow' }));
  await registerContact(tenant, USER, { fullName: 'สื่อ ทดสอบ', phone: '0899999999', consent: true, consentVersion: tenant.pdpaVersion });
  await botSaid();
});
afterAll(() => {
  transcodingBackoff.delaysMs = savedBackoff;
  vi.unstubAllGlobals();
});

async function latestCase() {
  const [contact] = await db.select().from(schema.contact).where(eq(schema.contact.lineUserId, USER));
  return (await caseSvc.openCasesOf(tenant.id, contact.id))[0];
}

describe('media answers (D-015)', () => {
  it('waits out a 202 for video, stores a file message and summarises "1 วิดีโอ · 1 ไฟล์"', async () => {
    content.set('lv1', { status: 'transcoding', body: Buffer.from('fake-mp4-bytes'), type: 'video/mp4' });
    content.set('lf1', { status: 'ready', body: Buffer.from('%PDF-1.4 fake'), type: 'application/octet-stream' });

    const cats = await db.select().from(schema.category).where(eq(schema.category.tenantId, tenant.id));
    const it_ = cats.find((c) => c.name === 'ระบบ IT')!;
    const login = cats.find((c) => c.name === 'เข้าระบบไม่ได้')!;
    await send(tap('menu:start'), tap(`cat:${it_.id}`), tap(`cat:${login.id}`));
    await send(tap('ans:0'), tap('cmd:skip'), tap('ans:0'), tap('cmd:now'));
    await botSaid();

    await send(video('lv1'));
    expect(await botSaid()).toContain('ได้รับวิดีโอแล้วครับ');
    // 202 → two transcoding checks → content again
    expect(calls.filter((u) => u.includes('/lv1/'))).toEqual([
      'https://api-data.line.me/v2/bot/message/lv1/content',
      'https://api-data.line.me/v2/bot/message/lv1/content/transcoding',
      'https://api-data.line.me/v2/bot/message/lv1/content/transcoding',
      'https://api-data.line.me/v2/bot/message/lv1/content',
    ]);

    await send(file('lf1', 'รายงาน error.pdf', 13));
    expect(await botSaid()).toContain('ได้รับไฟล์แล้วครับ');

    await send(tap('cmd:done'));
    expect(await botSaid()).toContain('1 วิดีโอ · 1 ไฟล์');
    await send(tap('sum:confirm'));
    expect(await botSaid()).toMatch(/เลขเคส CS-\d{4}-\d{5}/);

    const c = await latestCase();
    const [shot] = await db.select().from(schema.caseAnswer).where(and(eq(schema.caseAnswer.caseId, c.id), eq(schema.caseAnswer.questionKey, 'screenshot')));
    expect(shot.value).toMatchObject({ kind: 'files', kinds: ['video', 'file'] });
    const atts = await db.select().from(schema.attachment).where(eq(schema.attachment.caseId, c.id));
    expect(atts.map((a) => a.mimeType).sort()).toEqual(['application/pdf', 'video/mp4']);
    expect(atts.find((a) => a.mimeType === 'application/pdf')?.fileName).toBe('รายงาน error.pdf');
  });
});

describe('media follow-ups (D-015)', () => {
  it('binds an audio follow-up to the open case', async () => {
    content.set('la1', { status: 'ready', body: Buffer.from('fake-m4a'), type: 'audio/x-m4a' });
    await send(audio('la1'));
    expect(await botSaid()).toContain('ส่งข้อความถึงเจ้าหน้าที่ของเคส');
    const c = await latestCase();
    const msgs = await db.select().from(schema.caseMessage).where(and(eq(schema.caseMessage.caseId, c.id), eq(schema.caseMessage.direction, 'in')));
    const m = msgs.find((x) => x.content.type === 'audio');
    expect(m).toBeTruthy();
    const [att] = await db.select().from(schema.attachment).where(eq(schema.attachment.messageId, m!.id));
    expect(att.caseId).toBe(c.id);
  });

  it('gives up on a video still transcoding after the backoff and notes it on the timeline', async () => {
    content.set('lv2', { status: 'stuck', body: Buffer.alloc(0), type: 'video/mp4' });
    await send(video('lv2'));
    const out = await botSaid();
    expect(out).toContain('ขออภัยครับ ระบบรับวิดีโอไม่สำเร็จ');
    expect(out).toContain('กรุณาส่งใหม่อีกครั้งครับ');
    const c = await latestCase();
    const events = await db.select().from(schema.caseEvent).where(and(eq(schema.caseEvent.caseId, c.id), eq(schema.caseEvent.eventType, 'media_failed')));
    expect(events).toHaveLength(1);
    expect(events[0].note).toContain('LINE ยังเตรียมไฟล์ไม่เสร็จ');
    expect(calls.filter((u) => u.endsWith('/lv2/content/transcoding'))).toHaveLength(transcodingBackoff.delaysMs.length);
  });

  it('rejects an oversized file without downloading it', async () => {
    await send(file('lf-big', 'big.zip', 60 * 1024 * 1024));
    expect(await botSaid()).toContain('ไฟล์ใหญ่เกิน 50 MB');
    expect(calls.some((u) => u.includes('lf-big'))).toBe(false);
  });

  it('rejects a file type outside the allow-list', async () => {
    content.set('lf-exe', { status: 'ready', body: Buffer.from('MZ'), type: 'application/octet-stream' });
    await send(file('lf-exe', 'setup.exe', 2));
    expect(await botSaid()).toContain('ไม่รองรับไฟล์ชนิดนี้');
  });

  it('shows players and download metadata on Case Detail', async () => {
    const c = await latestCase();
    const d = await caseDetail(supervisor, c.id);
    const shot = d.answers.find((a) => a.key === 'screenshot')!;
    expect(shot.files.map((f) => f.kind)).toEqual(['video', 'file']);
    expect(shot.files[1]).toMatchObject({ fileName: 'รายงาน error.pdf', size: 13 });
    const audioMsg = d.timeline.find((t) => t.kind === 'message' && t.content.type === 'audio');
    expect(audioMsg && audioMsg.kind === 'message' && audioMsg.media?.url).toMatch(/^\/api\/files\//);
    expect(d.timeline.some((t) => t.kind === 'event' && t.eventType === 'media_failed')).toBe(true);
  });
});
