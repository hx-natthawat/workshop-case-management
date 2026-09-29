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
}

const key = () => new TextEncoder().encode(config.appSecret());

export async function createSessionToken(u: { id: string; tenantId: string }) {
  return new SignJWT({ tid: u.tenantId })
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

export async function readSessionToken(token: string | undefined): Promise<{ userId: string; tenantId: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (!payload.sub || typeof payload.tid !== 'string') return null;
    return { userId: payload.sub, tenantId: payload.tid };
  } catch {
    return null;
  }
}

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
  return { id: u.id, tenantId: u.tenantId, role: u.role, name: u.name, email: u.email, teamId: u.teamId };
}

/** For server components: redirect to /login when signed out. */
export async function requirePageUser(roles?: Role[]): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect('/login');
  if (roles && !roles.includes(u.role)) redirect('/dashboard?denied=1');
  return u;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** For route handlers. */
export async function requireApiUser(roles?: Role[]): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
  if (roles && !roles.includes(u.role)) throw new HttpError(403, 'ไม่มีสิทธิ์ทำรายการนี้');
  return u;
}
