/** G6: outage broadcast reaches only registered, still-following reporters and is audited. */
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/server/db';
import { previewBroadcast, sendBroadcast } from '@/server/case/broadcast';
import type { SessionUser } from '@/server/lib/auth';
import { defaultTenant } from '@/server/lib/tenant';

let sup: SessionUser;
beforeAll(async () => {
  await defaultTenant();
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, 'thanapol@example.com'));
  sup = { id: u.id, tenantId: u.tenantId, role: u.role, name: u.name, email: u.email, teamId: u.teamId, mfaEnabled: false };
});

describe('outage broadcast', () => {
  it('counts and messages only registered active reporters, and records the broadcast', async () => {
    const mk = (status: 'active' | 'blocked' | 'unfollowed', registered: boolean) => db.insert(schema.contact).values({
      tenantId: sup.tenantId, lineUserId: `Usimbc${randomUUID().slice(0, 8)}`, status, isSimulated: true,
      ...(registered ? { consentAt: new Date(), consentVersion: 'v3', fullName: 'ผู้รับ ทดสอบ', phone: '0800000000' } : {}),
    }).returning();
    const [ok] = await mk('active', true);
    const [blocked] = await mk('blocked', true);
    const [unreg] = await mk('active', false);
    const before = (await previewBroadcast(sup)).recipients;
    const r = await sendBroadcast(sup, 'ระบบ ERP ขัดข้องชั่วคราว', null);
    expect(r.recipients).toBe(before);
    expect(r.failed).toBe(0);
    const got = async (lineUserId: string) => (await db.select().from(schema.simMessage).where(and(eq(schema.simMessage.lineUserId, lineUserId), eq(schema.simMessage.direction, 'bot')))).length;
    expect(await got(ok.lineUserId)).toBe(1);
    expect(await got(blocked.lineUserId)).toBe(0);
    expect(await got(unreg.lineUserId)).toBe(0);
    const audits = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.action, 'broadcast.sent'), eq(schema.auditLog.entityId, r.id)));
    expect(audits).toHaveLength(1);
  });

  it('rejects empty or too long text', async () => {
    await expect(sendBroadcast(sup, '   ', null)).rejects.toThrow();
    await expect(sendBroadcast(sup, 'ก'.repeat(1001), null)).rejects.toThrow();
  });
});
