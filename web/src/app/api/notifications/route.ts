import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/server/db';
import { HttpError, requireApiUser } from '@/server/lib/auth';
import { handle } from '@/server/lib/http';

/** GET: the current user's notifications, newest first. */
export const GET = handle(async () => {
  const user = await requireApiUser();
  const items = await db.select().from(schema.notification)
    .where(and(eq(schema.notification.tenantId, user.tenantId), eq(schema.notification.userId, user.id)))
    .orderBy(desc(schema.notification.createdAt))
    .limit(200);
  return { items, unread: items.filter((n) => !n.readAt).length };
});

const body = z.object({ ids: z.array(z.string().uuid()).max(500).optional(), all: z.literal(true).optional() });

/** POST {ids} or {all: true}: mark as read. Only ever touches the caller's own notifications. */
export const POST = handle(async (req: Request) => {
  const user = await requireApiUser();
  const { ids, all } = body.parse(await req.json());
  if (!all && !ids?.length) throw new HttpError(400, 'กรุณาระบุรายการที่ต้องการทำเครื่องหมาย');
  const updated = await db.update(schema.notification)
    .set({ readAt: new Date() })
    .where(and(
      eq(schema.notification.tenantId, user.tenantId),
      eq(schema.notification.userId, user.id),
      isNull(schema.notification.readAt),
      all ? undefined : inArray(schema.notification.id, ids!),
    ))
    .returning({ id: schema.notification.id });
  return { ok: true, marked: updated.length };
});
