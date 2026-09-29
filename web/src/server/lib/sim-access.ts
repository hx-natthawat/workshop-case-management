/**
 * Who may use the LINE simulator (security review #14, M3).
 * Staff who are logged in, or testers who entered SIMULATOR_ACCESS_CODE (kept in a signed cookie).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { currentUser } from './auth';
import { config } from './config';

export const SIM_COOKIE = 'cm_sim';
const token = () => createHmac('sha256', config.appSecret()).update('simulator-access').digest('base64url');

export const accessCodeConfigured = () => !!process.env.SIMULATOR_ACCESS_CODE;

export function checkAccessCode(code: string): boolean {
  const expected = process.env.SIMULATOR_ACCESS_CODE;
  if (!expected) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function accessCookieValue() {
  return token();
}

export async function hasSimulatorAccess(): Promise<boolean> {
  if (!config.simulatorEnabled()) return false;
  const jar = await cookies();
  const v = jar.get(SIM_COOKIE)?.value;
  if (v) {
    const a = Buffer.from(v);
    const b = Buffer.from(token());
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return !!(await currentUser());
}
