import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/server/db';
import { OPEN_STATUSES } from '@/server/lib/enums';
import { handle } from '@/server/lib/http';
import { defaultTenant } from '@/server/lib/tenant';
import { dispatch, recordUserAction, requireSimulator } from '../sim-lib';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireSimulator();
  const tenant = await defaultTenant();
  const c = schema.contact;
  const openCases = db
    .select({ contactId: schema.kase.contactId, n: sql<number>`count(*)::int`.as('n') })
    .from(schema.kase)
    .where(and(eq(schema.kase.tenantId, tenant.id), inArray(schema.kase.status, OPEN_STATUSES)))
    .groupBy(schema.kase.contactId)
    .as('oc');
  const rows = await db
    .select({ id: c.id, lineUserId: c.lineUserId, fullName: c.fullName, displayName: c.displayName, consentAt: c.consentAt, status: c.status, openCases: openCases.n })
    .from(c)
    .leftJoin(openCases, eq(openCases.contactId, c.id))
    .where(and(eq(c.tenantId, tenant.id), eq(c.isSimulated, true)))
    .orderBy(desc(c.createdAt));
  return {
    personas: rows.map((r) => ({
      id: r.id,
      lineUserId: r.lineUserId,
      name: r.fullName ?? r.displayName ?? r.lineUserId,
      registered: r.consentAt != null,
      status: r.status,
      openCases: r.openCases ?? 0,
    })),
  };
});

const createSchema = z.object({ displayName: z.string().trim().min(1, 'กรุณากรอกชื่อที่แสดง').max(40) });

export const POST = handle(async (req: Request) => {
  await requireSimulator();
  const { displayName } = createSchema.parse(await req.json());
  const lineUserId = `Usim${randomBytes(5).toString('hex')}`;
  const tenant = await defaultTenant();
  // Set displayName before the welcome text is built so the bot greets by name.
  await db.insert(schema.contact).values({ tenantId: tenant.id, lineUserId, displayName, isSimulated: true }).onConflictDoNothing();
  await recordUserAction(tenant.id, lineUserId, { type: 'follow' });
  await dispatch(lineUserId, { type: 'follow' });
  await db.update(schema.contact).set({ displayName })
    .where(and(eq(schema.contact.tenantId, tenant.id), eq(schema.contact.lineUserId, lineUserId)));
  return { lineUserId, name: displayName };
});
