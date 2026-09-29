/** ADR 0006: staff MFA end to end at service level. */
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/server/db';
import { createMfaPendingToken, readMfaPendingToken, readSessionToken, createSessionToken, mustEnrolMfa, type SessionUser } from '@/server/lib/auth';
import { confirmEnrolment, disableOwnMfa, resetMfa, startEnrolment, verifyLoginCode } from '@/server/lib/mfa';
import { base32Decode, totpAt } from '@/server/lib/totp';

let admin: SessionUser;
let agent: SessionUser;
const asSession = (u: typeof schema.user.$inferSelect): SessionUser =>
  ({ id: u.id, tenantId: u.tenantId, role: u.role, name: u.name, email: u.email, teamId: u.teamId, mfaEnabled: !!u.mfaEnabledAt });
const row = async (id: string) => (await db.select().from(schema.user).where(eq(schema.user.id, id)))[0];

beforeAll(async () => {
  admin = asSession((await db.select().from(schema.user).where(eq(schema.user.email, 'admin@example.com')))[0]);
  agent = asSession((await db.select().from(schema.user).where(eq(schema.user.email, 'wanchai@example.com')))[0]);
});

describe('MFA (ADR 0006)', () => {
  it('forces an admin without MFA to enrol', () => {
    expect(mustEnrolMfa(admin)).toBe(true);
    expect(mustEnrolMfa(agent)).toBe(false);
  });

  it('enrols with a valid code, stores the secret encrypted and returns 8 recovery codes', async () => {
    const setup = await startEnrolment(agent);
    expect(setup.qr).toMatch(/^data:image\/png;base64,/);
    await expect(confirmEnrolment(agent, '000000', null)).rejects.toThrow(/ไม่ถูกต้อง/);
    const secret = base32Decode(setup.secret);
    const r = await confirmEnrolment(agent, totpAt(secret, Date.now() - 30_000), null);
    expect(r.recoveryCodes).toHaveLength(8);
    const u = await row(agent.id);
    expect(u.mfaEnabledAt).toBeInstanceOf(Date);
    expect(u.mfaSecretEnc).not.toContain(setup.secret);
    expect(u.mfaPendingEnc).toBeNull();

    // Login code: valid once, replay of the same step refused
    const code = totpAt(secret, Date.now());
    expect(await verifyLoginCode(await row(agent.id), code)).toBe(true);
    expect(await verifyLoginCode(await row(agent.id), code)).toBe(false);

    // Recovery code: works once
    expect(await verifyLoginCode(await row(agent.id), r.recoveryCodes[0])).toBe(true);
    expect(await verifyLoginCode(await row(agent.id), r.recoveryCodes[0])).toBe(false);
    expect((await row(agent.id)).mfaRecoveryHashes).toHaveLength(7);
  });

  it('never accepts an MFA-pending token as a session', async () => {
    const pending = await createMfaPendingToken(agent.id, agent.tenantId);
    expect(await readSessionToken(pending)).toBeNull();
    expect(await readMfaPendingToken(pending)).toEqual({ userId: agent.id, tenantId: agent.tenantId });
    const session = await createSessionToken({ id: agent.id, tenantId: agent.tenantId });
    expect(await readMfaPendingToken(session)).toBeNull();
  });

  it('lets only another admin reset MFA, and admins cannot switch it off', async () => {
    await expect(resetMfa(admin, admin.id, null)).rejects.toThrow();
    await expect(resetMfa(agent, admin.id, null)).rejects.toThrow();
    await resetMfa(admin, agent.id, null);
    expect((await row(agent.id)).mfaEnabledAt).toBeNull();
    const audits = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'user.mfa_reset'));
    expect(audits.some((a) => a.entityId === agent.id)).toBe(true);
    await expect(disableOwnMfa(admin, '123456', null)).rejects.toThrow(/ต้องใช้ MFA/);
  });
});
