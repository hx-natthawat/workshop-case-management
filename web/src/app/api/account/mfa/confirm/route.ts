import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSessionToken, requireApiUser, SESSION_COOKIE, sessionCookieOptions } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { confirmEnrolment } from '@/server/lib/mfa';

export const POST = handle(async (req: Request) => {
  const u = await requireApiUser(undefined, { allowWithoutMfa: true });
  const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'กรอกรหัส 6 หลัก') }).parse(await req.json());
  const r = await confirmEnrolment(u, code, clientIp(req));
  // The old password-only session is no longer valid (#22 finding 1): replace it with an MFA session.
  const res = NextResponse.json(r);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(u, true), sessionCookieOptions);
  return res;
});
