/**
 * TOTP (RFC 6238, SHA-1, 30 s, 6 digits) and secret encryption for staff MFA (ADR 0006).
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config';

const STEP_MS = 30_000;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('invalid base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226) with dynamic truncation. */
export function hotp(key: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const totpAt = (key: Buffer, ms: number, digits = 6) => hotp(key, Math.floor(ms / STEP_MS), digits);

/** Returns the matched time step (for replay protection) or null. Window: ±1 step. */
export function verifyTotp(key: Buffer, code: string, now = Date.now()): number | null {
  const c = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const step = Math.floor(now / STEP_MS);
  for (const s of [step, step - 1, step + 1]) {
    const expected = Buffer.from(hotp(key, s));
    if (timingSafeEqual(expected, Buffer.from(c))) return s;
  }
  return null;
}

export const newSecret = () => randomBytes(20);

export function otpauthUri(secret: Buffer, account: string, issuer = 'Tools Management'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${base32Encode(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ── Secret encryption at rest (AES-256-GCM, key derived from APP_SECRET) ──

const encKey = () => createHash('sha256').update(`${config.appSecret()}:mfa-secret`).digest();

export function encryptSecret(secret: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([c.update(secret), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(stored: string): Buffer {
  const [iv, tag, ct] = stored.split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

// ── Recovery codes ──

export const hashRecovery = (code: string) => createHash('sha256').update(code.replace(/[\s-]/g, '').toUpperCase()).digest('hex');

export function newRecoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () => {
    const s = base32Encode(randomBytes(6)).slice(0, 10);
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}
