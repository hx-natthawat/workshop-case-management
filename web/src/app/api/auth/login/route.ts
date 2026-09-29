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

// Throttle (#14 L2): at most 10 failed attempts per email and per IP in 15 minutes. In memory: one process (ADR 0001).
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 10;
const fails = new Map<string, number[]>();
const recent = (k: string, now: number) => (fails.get(k) ?? []).filter((t) => now - t < WINDOW_MS);
// Compare against a dummy hash for unknown emails so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export const POST = handle(async (req: Request) => {
  const { email, password } = body.parse(await req.json());
  const now = Date.now();
  // Per-IP only when the IP is known; otherwise every local user would share one bucket.
  const ip = clientIp(req);
  const keys = [`e:${email}`, ...(ip ? [`ip:${ip}`] : [])];
  if (keys.some((k) => recent(k, now).length >= MAX_FAILS)) throw new HttpError(429, 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่');
  const tenant = await defaultTenant();
  const [u] = await db.select().from(schema.user).where(and(eq(schema.user.tenantId, tenant.id), eq(schema.user.email, email)));
  const match = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
  const ok = !!u && u.isActive && match;
  if (!ok) {
    for (const k of keys) fails.set(k, [...recent(k, now), now]);
    throw new HttpError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  }
  fails.delete(keys[0]);
  await audit({ tenantId: tenant.id, actorId: u.id, action: 'auth.login', entity: 'user', entityId: u.id, ip: clientIp(req) });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(u), sessionCookieOptions);
  return res;
});
