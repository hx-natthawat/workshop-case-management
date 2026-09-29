/** Canned replies (analysis D2). Read: all staff. Write: supervisor/admin. */
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/server/db';
import { audit } from '@/server/lib/audit';
import { HttpError, type SessionUser } from '@/server/lib/auth';
import { assertUuid } from './ids';

export const cannedInput = z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(2000) });
export const cannedPatch = cannedInput.partial();

export async function listCanned(tenantId: string) {
  return db
    .select({ id: schema.cannedReply.id, title: schema.cannedReply.title, body: schema.cannedReply.body, createdAt: schema.cannedReply.createdAt })
    .from(schema.cannedReply)
    .where(eq(schema.cannedReply.tenantId, tenantId))
    .orderBy(asc(schema.cannedReply.createdAt), asc(schema.cannedReply.title));
}

export async function createCanned(actor: SessionUser, input: z.infer<typeof cannedInput>, ip: string | null) {
  const [row] = await db.insert(schema.cannedReply).values({ tenantId: actor.tenantId, ...input }).returning();
  await audit({ tenantId: actor.tenantId, actorId: actor.id, action: 'canned_reply.created', entity: 'canned_reply', entityId: row.id, diff: input, ip });
  return row;
}

async function get(tenantId: string, id: string) {
  assertUuid(id, 'ไม่พบข้อความสำเร็จรูป');
  const [row] = await db.select().from(schema.cannedReply).where(and(eq(schema.cannedReply.id, id), eq(schema.cannedReply.tenantId, tenantId)));
  if (!row) throw new HttpError(404, 'ไม่พบข้อความสำเร็จรูป');
  return row;
}

export async function updateCanned(actor: SessionUser, id: string, input: z.infer<typeof cannedPatch>, ip: string | null) {
  const cur = await get(actor.tenantId, id);
  const diff: Record<string, { from: string; to: string }> = {};
  if (input.title !== undefined && input.title !== cur.title) diff.title = { from: cur.title, to: input.title };
  if (input.body !== undefined && input.body !== cur.body) diff.body = { from: cur.body, to: input.body };
  if (!Object.keys(diff).length) return cur;
  const [row] = await db.update(schema.cannedReply).set(input).where(and(eq(schema.cannedReply.id, id), eq(schema.cannedReply.tenantId, actor.tenantId))).returning();
  await audit({ tenantId: actor.tenantId, actorId: actor.id, action: 'canned_reply.updated', entity: 'canned_reply', entityId: id, diff, ip });
  return row;
}

export async function deleteCanned(actor: SessionUser, id: string, ip: string | null) {
  const cur = await get(actor.tenantId, id);
  await db.delete(schema.cannedReply).where(and(eq(schema.cannedReply.id, id), eq(schema.cannedReply.tenantId, actor.tenantId)));
  await audit({ tenantId: actor.tenantId, actorId: actor.id, action: 'canned_reply.deleted', entity: 'canned_reply', entityId: id, diff: { title: cur.title, body: cur.body }, ip });
}
