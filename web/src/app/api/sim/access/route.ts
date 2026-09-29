import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError } from '@/server/lib/auth';
import { config } from '@/server/lib/config';
import { handle } from '@/server/lib/http';
import { accessCookieValue, checkAccessCode, SIM_COOKIE } from '@/server/lib/sim-access';

/** Testers enter SIMULATOR_ACCESS_CODE once; a signed cookie grants simulator access for 12 hours. */
export const POST = handle(async (req: Request) => {
  if (!config.simulatorEnabled()) throw new HttpError(404, 'Not found');
  const { code } = z.object({ code: z.string().min(1).max(100) }).parse(await req.json());
  if (!checkAccessCode(code)) throw new HttpError(401, 'รหัสผู้ทดสอบไม่ถูกต้อง');
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SIM_COOKIE, accessCookieValue(), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 12 * 3600 });
  return res;
});
