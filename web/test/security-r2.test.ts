/** Regression tests for the wave A security review (#22 → #23). */
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/server/db';
import { anonymise } from '@/server/admin/anonymise';
import { setContactStatus } from '@/server/admin/contacts';
import { handleEvents } from '@/server/bot/handler';
import type { LineEvent } from '@/server/bot/line-types';
import { createSessionToken, readSessionToken, sessionAllowed, type SessionUser } from '@/server/lib/auth';
import { confirmEnrolment, resetMfa, startEnrolment, verifyLoginCode } from '@/server/lib/mfa';
import { putObject } from '@/server/lib/storage';
import { defaultTenant } from '@/server/lib/tenant';
import { base32Decode, totpAt } from '@/server/lib/totp';
import { retentionSweep, sweepOrphanAttachments } from '@/server/worker/retention-sweep';

let tenant: typeof schema.tenant.$inferSelect;
let sup: SessionUser;
let admin: SessionUser;
const asSession = (u: typeof schema.user.$inferSelect): SessionUser => ({ id: u.id, tenantId: u.tenantId, role: u.role, name: u.name, email: u.email, teamId: u.teamId, mfaEnabled: !!u.mfaEnabledAt });

beforeAll(async () => {
  tenant = await defaultTenant();
  sup = asSession((await db.select().from(schema.user).where(eq(schema.user.email, 'thanapol@example.com')))[0]);
  admin = asSession((await db.select().from(schema.user).where(eq(schema.user.email, 'admin@example.com')))[0]);
});

async function contact(registered: boolean, createdAt = new Date()) {
  const [c] = await db.insert(schema.contact).values({
    tenantId: tenant.id, lineUserId: `Usimr2${randomUUID().slice(0, 8)}`, isSimulated: true, createdAt,
    ...(registered ? { consentAt: new Date(), consentVersion: 'v3', fullName: 'ทดสอบ รอบสอง', phone: '0811111111' } : {}),
  }).returning();
  return c;
}

describe('#22 regressions', () => {
  it('1: a password-only session is refused once the user has MFA', async () => {
    const pw = await readSessionToken(await createSessionToken({ id: sup.id, tenantId: sup.tenantId }));
    const mfa = await readSessionToken(await createSessionToken({ id: sup.id, tenantId: sup.tenantId }, true));
    expect(pw?.mfa).toBe(false);
    expect(mfa?.mfa).toBe(true);
    expect(sessionAllowed({ mfaEnabledAt: new Date() }, pw!)).toBe(false);
    expect(sessionAllowed({ mfaEnabledAt: new Date() }, mfa!)).toBe(true);
    expect(sessionAllowed({ mfaEnabledAt: null }, pw!)).toBe(true);
  });

  it('2: media from an unregistered user is not downloaded', async () => {
    const c = await contact(false);
    const before = (await db.select().from(schema.attachment)).length;
    const ev = { type: 'message', webhookEventId: randomUUID(), timestamp: Date.now(), replyToken: 'sim', source: { type: 'user', userId: c.lineUserId }, message: { type: 'image', id: 'line-msg-1' } } as LineEvent;
    await handleEvents(tenant, [ev]);
    expect((await db.select().from(schema.attachment)).length).toBe(before);
    const out = JSON.stringify((await db.select().from(schema.simMessage).where(eq(schema.simMessage.lineUserId, c.lineUserId))).map((m) => m.payload));
    expect(out).toContain('ลงทะเบียน');
  });

  it('2: erase deletes files the contact sent that never reached a case; old orphans are swept', async () => {
    const c = await contact(true);
    const obj = await putObject(Buffer.from('x'), 'image/png');
    await db.insert(schema.attachment).values({ tenantId: tenant.id, contactId: c.id, storageKey: obj.key, mimeType: 'image/png', size: 1, checksum: obj.checksum });
    const r = await anonymise({ tenantId: tenant.id, caseIds: [], contactId: c.id, actor: { type: 'system' }, reason: 'dsr_erase' });
    expect(r.files).toBe(1);
    const o2 = await putObject(Buffer.from('y'), 'image/png');
    const [orphan] = await db.insert(schema.attachment).values({ tenantId: tenant.id, storageKey: o2.key, mimeType: 'image/png', size: 1, checksum: o2.checksum, createdAt: new Date(Date.now() - 2 * 86_400_000) }).returning();
    expect(await sweepOrphanAttachments()).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(schema.attachment).where(eq(schema.attachment.id, orphan.id))).toHaveLength(0);
  });

  it('3: an erased contact cannot be re-activated and is no longer registered', async () => {
    const c = await contact(true);
    await anonymise({ tenantId: tenant.id, caseIds: [], contactId: c.id, actor: { type: 'system' }, reason: 'dsr_erase' });
    const [after] = await db.select().from(schema.contact).where(eq(schema.contact.id, c.id));
    expect(after.consentAt).toBeNull();
    await expect(setContactStatus(sup, c.id, 'active', null)).rejects.toMatchObject({ status: 409 });
  });

  it('4: status and priority reasons are not copied into the audit log', async () => {
    const rows = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'case.status_changed')).limit(50);
    for (const r of rows) expect(JSON.stringify(r.diff)).not.toMatch(/"reason":/);
  });

  it('5: retention anonymises contacts that never had a case', async () => {
    await db.update(schema.tenant).set({ retentionDays: 30 }).where(eq(schema.tenant.id, tenant.id));
    const old = await contact(true, new Date(Date.now() - 60 * 86_400_000));
    const fresh = await contact(true);
    await retentionSweep();
    const [o] = await db.select().from(schema.contact).where(eq(schema.contact.id, old.id));
    const [f] = await db.select().from(schema.contact).where(eq(schema.contact.id, fresh.id));
    expect(o.anonymisedAt).toBeInstanceOf(Date);
    expect(f.anonymisedAt).toBeNull();
    await db.update(schema.tenant).set({ retentionDays: null }).where(eq(schema.tenant.id, tenant.id));
  });

  it('6: parallel replays of one TOTP code or recovery code succeed only once', async () => {
    const [u] = await db.select().from(schema.user).where(eq(schema.user.email, 'wanchai@example.com'));
    const me = asSession(u);
    await resetMfa(admin, me.id, null).catch(() => undefined);
    const setup = await startEnrolment(me);
    const secret = base32Decode(setup.secret);
    const { recoveryCodes } = await confirmEnrolment(me, totpAt(secret, Date.now() - 30_000), null);
    const row = async () => (await db.select().from(schema.user).where(and(eq(schema.user.id, me.id))))[0];
    const code = totpAt(secret, Date.now());
    const r1 = await Promise.all(Array.from({ length: 6 }, async () => verifyLoginCode(await row(), code)));
    expect(r1.filter(Boolean)).toHaveLength(1);
    const r2 = await Promise.all(Array.from({ length: 6 }, async () => verifyLoginCode(await row(), recoveryCodes[1])));
    expect(r2.filter(Boolean)).toHaveLength(1);
    await resetMfa(admin, me.id, null);
  });

  it('8: malformed ids give 404', async () => {
    await expect(resetMfa(admin, 'not-a-uuid', null)).rejects.toMatchObject({ status: 404 });
  });
});
