/** Staff session: signed HTTP-only cookie (ADR 0003). */
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import { config } from './config';

export const SESSION_COOKIE = 'cm_session';
const TTL_SEC = 12 * 60 * 60;

export type Role = 'agent' | 'supervisor' | 'admin';
export interface SessionUser {
  id: string;
  tenantId: string;
  role: Role;
  name: string;
  email: string;
  teamId: string | null;
  mfaEnabled: boolean;
}

const key = () => new TextEncoder().encode(config.appSecret());

/** `mfa` = the session was created after a verified second factor (#22 finding 1). */
export async function createSessionToken(u: { id: string; tenantId: string }, mfa = false) {
  return new SignJWT({ tid: u.tenantId, purpose: 'session', mfa })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(u.id)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SEC}s`)
    .sign(key());
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: TTL_SEC,
};

export async function readSessionToken(token: string | undefined): Promise<{ userId: string; tenantId: string; mfa: boolean } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    // Only real session tokens: an MFA-pending token must never work as a session (ADR 0006)
    if (payload.purpose !== 'session' || !payload.sub || typeof payload.tid !== 'string') return null;
    return { userId: payload.sub, tenantId: payload.tid, mfa: payload.mfa === true };
  } catch {
    return null;
  }
}

/** A password-only session stops working once the user has MFA: they must log in again with a code (#22 finding 1). */
export const sessionAllowed = (u: { mfaEnabledAt: Date | null }, s: { mfa: boolean }) => !u.mfaEnabledAt || s.mfa;

/** Current staff user, re-read from DB so deactivation and role changes apply immediately. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const s = await readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const [u] = await db
    .select()
    .from(schema.user)
    .where(and(eq(schema.user.id, s.userId), eq(schema.user.tenantId, s.tenantId), eq(schema.user.isActive, true)));
  if (!u) return null;
  if (!sessionAllowed(u, s)) return null;
  return { id: u.id, tenantId: u.tenantId, role: u.role, name: u.name, email: u.email, teamId: u.teamId, mfaEnabled: !!u.mfaEnabledAt };
}

/** ADR 0006: an admin without MFA may only reach the enrolment page and APIs. */
export const mustEnrolMfa = (u: SessionUser) => u.role === 'admin' && !u.mfaEnabled;
export const MFA_ENROL_PATH = '/account/security';

/** For server components: redirect to /login when signed out. */
export async function requirePageUser(roles?: Role[], opts: { allowWithoutMfa?: boolean } = {}): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect('/login');
  if (!opts.allowWithoutMfa && mustEnrolMfa(u)) redirect(`${MFA_ENROL_PATH}?required=1`);
  if (roles && !roles.includes(u.role)) redirect('/dashboard?denied=1');
  return u;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** For route handlers. */
export async function requireApiUser(roles?: Role[], opts: { allowWithoutMfa?: boolean } = {}): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
  if (!opts.allowWithoutMfa && mustEnrolMfa(u)) throw new HttpError(403, 'ผู้ดูแลระบบต้องตั้งค่า MFA ก่อนใช้งาน');
  if (roles && !roles.includes(u.role)) throw new HttpError(403, 'ไม่มีสิทธิ์ทำรายการนี้');
  return u;
}

// ── Second login step (ADR 0006) ──────────────────────────────

export const MFA_PENDING_COOKIE = 'cm_mfa';
const MFA_PENDING_TTL = 5 * 60;

export async function createMfaPendingToken(userId: string, tenantId: string) {
  return new SignJWT({ tid: tenantId, purpose: 'mfa' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MFA_PENDING_TTL}s`)
    .sign(key());
}

export const mfaPendingCookieOptions = { ...sessionCookieOptions, maxAge: MFA_PENDING_TTL };

export async function readMfaPendingToken(token: string | undefined): Promise<{ userId: string; tenantId: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (payload.purpose !== 'mfa' || !payload.sub || typeof payload.tid !== 'string') return null;
    return { userId: payload.sub, tenantId: payload.tid };
  } catch {
    return null;
  }
}
