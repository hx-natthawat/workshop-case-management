/**
 * Outage announcement to every registered, still-following reporter (G6, #21).
 * Real LINE users: multicast in chunks of 500 (research r1 Q10). Simulator users: outbox.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import { text } from '@/server/bot/messages';
import { audit } from '@/server/lib/audit';
import { HttpError, type SessionUser } from '@/server/lib/auth';
import { config, isSimUser } from '@/server/lib/config';
import { push } from '@/server/messaging/gateway';

const CHUNK = 500;
export const MAX_BROADCAST_CHARS = 1000;

async function recipients(tenantId: string) {
  const rows = await db.select({ lineUserId: schema.contact.lineUserId }).from(schema.contact)
    .where(and(eq(schema.contact.tenantId, tenantId), eq(schema.contact.status, 'active'), isNotNull(schema.contact.consentAt)));
  return rows.map((r) => r.lineUserId);
}

/** How many messages a broadcast would use (every recipient counts toward the plan quota). */
export async function previewBroadcast(u: SessionUser) {
  const ids = await recipients(u.tenantId);
  return { recipients: ids.length, realLine: ids.filter((i) => !isSimUser(i)).length, simulated: ids.filter(isSimUser).length };
}

export async function sendBroadcast(u: SessionUser, body: string, ip: string | null) {
  const clean = body.trim();
  if (!clean) throw new HttpError(400, 'กรุณาพิมพ์ข้อความประกาศ');
  if (clean.length > MAX_BROADCAST_CHARS) throw new HttpError(400, `ข้อความยาวเกิน ${MAX_BROADCAST_CHARS} ตัวอักษร`);
  const [tenant] = await db.select().from(schema.tenant).where(eq(schema.tenant.id, u.tenantId));
  const msg = text(`ประกาศจาก${tenant.oaName}\n${clean}`);
  const ids = await recipients(u.tenantId);
  const real = ids.filter((i) => !isSimUser(i));
  let failed = 0;

  for (const id of ids.filter(isSimUser)) await push(u.tenantId, id, [msg]);
  for (let i = 0; i < real.length; i += CHUNK) {
    const chunk = real.slice(i, i + CHUNK);
    const res = await fetch('https://api.line.me/v2/bot/message/multicast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.line.accessToken()}`, 'X-Line-Retry-Key': randomUUID() },
      body: JSON.stringify({ to: chunk, messages: [msg] }),
    }).catch(() => null);
    if (!res?.ok) failed += chunk.length;
  }

  const [row] = await db.insert(schema.broadcast).values({ tenantId: u.tenantId, text: clean, recipientCount: ids.length, failedCount: failed, sentBy: u.id }).returning();
  await audit({ tenantId: u.tenantId, actorId: u.id, action: 'broadcast.sent', entity: 'broadcast', entityId: row.id, diff: { recipients: ids.length, failed }, ip });
  return { id: row.id, recipients: ids.length, failed };
}

export async function broadcastHistory(tenantId: string) {
  return db.select({ id: schema.broadcast.id, text: schema.broadcast.text, recipientCount: schema.broadcast.recipientCount, failedCount: schema.broadcast.failedCount, createdAt: schema.broadcast.createdAt, sentBy: schema.user.name })
    .from(schema.broadcast).leftJoin(schema.user, eq(schema.user.id, schema.broadcast.sentBy))
    .where(eq(schema.broadcast.tenantId, tenantId)).orderBy(desc(schema.broadcast.createdAt)).limit(20);
}
