import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/server/db';
import { audit } from '@/server/lib/audit';
import { createSessionToken, HttpError, MFA_PENDING_COOKIE, readMfaPendingToken, SESSION_COOKIE, sessionCookieOptions } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { verifyLoginCode } from '@/server/lib/mfa';
import { mfaThrottle } from '@/server/lib/throttle';


/** Second login step: exchange the MFA-pending cookie + a code for a session. */
export const POST = handle(async (req: Request) => {
  const { code } = z.object({ code: z.string().trim().min(6).max(20) }).parse(await req.json());
  const jar = await cookies();
  const pending = await readMfaPendingToken(jar.get(MFA_PENDING_COOKIE)?.value);
  if (!pending) throw new HttpError(401, 'หมดเวลายืนยันตัวตน กรุณาเข้าสู่ระบบใหม่');
  if (mfaThrottle.blocked(pending.userId)) throw new HttpError(429, 'กรอกรหัสผิดหลายครั้งเกินไป กรุณารอ 15 นาที');
  const [u] = await db.select().from(schema.user).where(and(eq(schema.user.id, pending.userId), eq(schema.user.tenantId, pending.tenantId), eq(schema.user.isActive, true)));
  if (!u || !(await verifyLoginCode(u, code))) {
    mfaThrottle.fail(pending.userId);
    throw new HttpError(401, 'รหัสยืนยันไม่ถูกต้อง');
  }
  mfaThrottle.clear(pending.userId);
  await audit({ tenantId: u.tenantId, actorId: u.id, action: 'auth.login', entity: 'user', entityId: u.id, diff: { mfa: true }, ip: clientIp(req) });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(MFA_PENDING_COOKIE);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(u, true), sessionCookieOptions);
  return res;
});
