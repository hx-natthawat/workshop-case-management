/** Dialog session in Postgres with an expiry column (ADR 0002). */
import { and, eq, gt, lt } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import type { MessageContent } from '@/server/db/schema';
import { DRAFT_TTL_MIN, type DialogState } from './dialog';

export interface BotSession {
  dialog?: DialogState | null;
  /** A reporter message waiting for them to pick which case it belongs to. */
  forward?: { content: MessageContent; lineMessageId: string | null } | null;
}

export async function loadSession(tenantId: string, lineUserId: string, now = new Date()): Promise<BotSession> {
  const [row] = await db.select().from(schema.dialogSession).where(and(
    eq(schema.dialogSession.tenantId, tenantId),
    eq(schema.dialogSession.lineUserId, lineUserId),
    gt(schema.dialogSession.expiresAt, now),
  ));
  return (row?.state as BotSession) ?? {};
}

export async function saveSession(tenantId: string, lineUserId: string, s: BotSession, now = new Date()) {
  if (!s.dialog && !s.forward) {
    await db.delete(schema.dialogSession).where(and(eq(schema.dialogSession.tenantId, tenantId), eq(schema.dialogSession.lineUserId, lineUserId)));
    return;
  }
  const expiresAt = new Date(now.getTime() + DRAFT_TTL_MIN * 60_000);
  await db.insert(schema.dialogSession).values({ tenantId, lineUserId, state: s, expiresAt, updatedAt: now })
    .onConflictDoUpdate({ target: [schema.dialogSession.tenantId, schema.dialogSession.lineUserId], set: { state: s, expiresAt, updatedAt: now } });
}

export async function purgeExpiredSessions(now = new Date()) {
  await db.delete(schema.dialogSession).where(lt(schema.dialogSession.expiresAt, now));
}
