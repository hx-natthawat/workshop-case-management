/** Staff MFA service (ADR 0006). */
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { assertUuid } from '@/server/admin/ids';
import { mfaThrottle } from './throttle';
import QRCode from 'qrcode';
import { db, schema } from '@/server/db';
import { audit } from './audit';
import { HttpError, type SessionUser } from './auth';
import {
  base32Encode, decryptSecret, encryptSecret, hashRecovery, newRecoveryCodes, newSecret, otpauthUri, verifyTotp,
} from './totp';

type UserRow = typeof schema.user.$inferSelect;

async function userRow(tenantId: string, id: string): Promise<UserRow> {
  assertUuid(id, 'ไม่พบผู้ใช้'); // #22 finding 8
  const [u] = await db.select().from(schema.user).where(and(eq(schema.user.id, id), eq(schema.user.tenantId, tenantId)));
  if (!u) throw new HttpError(404, 'ไม่พบผู้ใช้');
  return u;
}

/** Step 1: a new pending secret + QR code. Replaces any earlier pending secret. */
export async function startEnrolment(u: SessionUser) {
  const row = await userRow(u.tenantId, u.id);
  if (row.mfaEnabledAt) throw new HttpError(409, 'เปิดใช้ MFA อยู่แล้ว');
  const secret = newSecret();
  await db.update(schema.user).set({ mfaPendingEnc: encryptSecret(secret) }).where(eq(schema.user.id, u.id));
  const uri = otpauthUri(secret, u.email);
  return { secret: base32Encode(secret), uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

/** Step 2: confirm with a code from the app; returns recovery codes (shown once). */
export async function confirmEnrolment(u: SessionUser, code: string, ip: string | null) {
  const row = await userRow(u.tenantId, u.id);
  if (row.mfaEnabledAt) throw new HttpError(409, 'เปิดใช้ MFA อยู่แล้ว');
  if (!row.mfaPendingEnc) throw new HttpError(400, 'กรุณาเริ่มตั้งค่าใหม่');
  const secret = decryptSecret(row.mfaPendingEnc);
  const step = verifyTotp(secret, code);
  if (step == null) throw new HttpError(400, 'รหัสไม่ถูกต้อง ตรวจสอบเวลาในโทรศัพท์แล้วลองใหม่');
  const codes = newRecoveryCodes();
  await db.update(schema.user).set({
    mfaSecretEnc: row.mfaPendingEnc, mfaPendingEnc: null, mfaEnabledAt: new Date(), mfaRecoveryHashes: codes.map(hashRecovery), mfaLastStep: step,
  }).where(eq(schema.user.id, u.id));
  await audit({ tenantId: u.tenantId, actorId: u.id, action: 'user.mfa_enabled', entity: 'user', entityId: u.id, ip });
  // D-022: other admins see every enrolment, so someone enrolling with a stolen password is noticed
  const admins = await db.select({ id: schema.user.id }).from(schema.user)
    .where(and(eq(schema.user.tenantId, u.tenantId), eq(schema.user.role, 'admin'), eq(schema.user.isActive, true)));
  const others = admins.filter((a) => a.id !== u.id);
  if (others.length) {
    await db.insert(schema.notification).values(others.map((a) => ({ tenantId: u.tenantId, userId: a.id, type: 'mfa_enabled', caseId: null, text: `${u.name} เปิดใช้ MFA แล้ว หากไม่ใช่เจ้าของบัญชี ให้รีเซ็ต MFA และเปลี่ยนรหัสผ่านทันที` })));
  }
  return { recoveryCodes: codes };
}

/**
 * Second login step. Accepts a TOTP code (never the same time step twice) or a single-use recovery code.
 * Returns true when valid.
 */
export async function verifyLoginCode(row: UserRow, code: string, now = Date.now()): Promise<boolean> {
  if (!row.mfaSecretEnc) return false;
  const step = verifyTotp(decryptSecret(row.mfaSecretEnc), code, now);
  if (step != null) {
    // Atomic: only one request can move the step forward, so parallel replays fail (#22 finding 6)
    const won = await db.update(schema.user).set({ mfaLastStep: step })
      .where(and(eq(schema.user.id, row.id), or(isNull(schema.user.mfaLastStep), lt(schema.user.mfaLastStep, step))))
      .returning({ id: schema.user.id });
    return won.length === 1;
  }
  const h = hashRecovery(code);
  // Atomic single use: remove the hash only if it is still there
  const used = await db.update(schema.user)
    .set({ mfaRecoveryHashes: sql`${schema.user.mfaRecoveryHashes} - ${h}::text` })
    .where(and(eq(schema.user.id, row.id), sql`${schema.user.mfaRecoveryHashes} ? ${h}`))
    .returning({ hashes: schema.user.mfaRecoveryHashes });
  if (used.length !== 1) return false;
  await audit({ tenantId: row.tenantId, actorId: row.id, action: 'user.mfa_recovery_used', entity: 'user', entityId: row.id, diff: { remaining: used[0].hashes?.length ?? 0 } });
  return true;
}

/** Non-admins may turn MFA off with a valid code; admins must keep it (ADR 0006). */
export async function disableOwnMfa(u: SessionUser, code: string, ip: string | null) {
  if (u.role === 'admin') throw new HttpError(403, 'ผู้ดูแลระบบต้องใช้ MFA เสมอ');
  if (mfaThrottle.blocked(u.id)) throw new HttpError(429, 'กรอกรหัสผิดหลายครั้งเกินไป กรุณารอ 15 นาที'); // #22 finding 7
  const row = await userRow(u.tenantId, u.id);
  if (!(await verifyLoginCode(row, code))) {
    mfaThrottle.fail(u.id);
    throw new HttpError(400, 'รหัสไม่ถูกต้อง');
  }
  mfaThrottle.clear(u.id);
  await clear(row.id);
  await audit({ tenantId: u.tenantId, actorId: u.id, action: 'user.mfa_disabled', entity: 'user', entityId: u.id, ip });
}

/** Admin resets another user's MFA (lost phone). The user must enrol again on next login. */
export async function resetMfa(admin: SessionUser, targetId: string, ip: string | null) {
  if (admin.role !== 'admin') throw new HttpError(403, 'ไม่มีสิทธิ์');
  if (admin.id === targetId) throw new HttpError(400, 'รีเซ็ต MFA ของตนเองไม่ได้ ให้ผู้ดูแลระบบคนอื่นดำเนินการ');
  const row = await userRow(admin.tenantId, targetId);
  await clear(row.id);
  await audit({ tenantId: admin.tenantId, actorId: admin.id, action: 'user.mfa_reset', entity: 'user', entityId: row.id, ip });
}

const clear = (id: string) => db.update(schema.user).set({ mfaSecretEnc: null, mfaPendingEnc: null, mfaEnabledAt: null, mfaRecoveryHashes: null, mfaLastStep: null }).where(eq(schema.user.id, id));
