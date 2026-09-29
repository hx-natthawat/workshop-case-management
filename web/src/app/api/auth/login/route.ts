import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/server/db';
import { audit } from '@/server/lib/audit';
import { createSessionToken, HttpError, SESSION_COOKIE, sessionCookieOptions } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { defaultTenant } from '@/server/lib/tenant';

const body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export const POST = handle(async (req: Request) => {
  const { email, password } = body.parse(await req.json());
  const tenant = await defaultTenant();
  const [u] = await db.select().from(schema.user).where(and(eq(schema.user.tenantId, tenant.id), eq(schema.user.email, email)));
  const ok = u && u.isActive && (await bcrypt.compare(password, u.passwordHash));
  if (!ok) throw new HttpError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  await audit({ tenantId: tenant.id, actorId: u.id, action: 'auth.login', entity: 'user', entityId: u.id, ip: clientIp(req) });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(u), sessionCookieOptions);
  return res;
});
