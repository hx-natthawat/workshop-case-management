import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hotp, totpAt, verifyTotp } from './totp';

// RFC 6238 Appendix B, SHA-1 key "12345678901234567890" (8-digit values; we use the last 6 digits)
const KEY = Buffer.from('12345678901234567890');
const VECTORS: [number, string][] = [
  [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
  [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130'],
];

describe('TOTP (RFC 6238)', () => {
  it.each(VECTORS)('matches the RFC vector at T=%i', (t, code8) => {
    expect(totpAt(KEY, t * 1000, 8)).toBe(code8);
    expect(totpAt(KEY, t * 1000)).toBe(code8.slice(-6));
  });
  it('matches the RFC 4226 HOTP vectors', () => {
    expect(hotp(KEY, 0, 6)).toBe('755224');
    expect(hotp(KEY, 9, 6)).toBe('520489');
  });
  it('accepts the previous and next step, rejects further drift', () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(KEY, totpAt(KEY, now - 30_000), now)).not.toBeNull();
    expect(verifyTotp(KEY, totpAt(KEY, now + 30_000), now)).not.toBeNull();
    expect(verifyTotp(KEY, totpAt(KEY, now - 90_000), now)).toBeNull();
    expect(verifyTotp(KEY, '12345', now)).toBeNull();
  });
  it('returns the matched time step so the caller can block replays', () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(KEY, totpAt(KEY, now), now)).toBe(Math.floor(now / 30_000));
  });
});

describe('base32 and secret encryption', () => {
  it('round-trips base32 (RFC 4648)', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    expect(base32Decode('mzxw 6ytb oi').toString()).toBe('foobar');
  });
  it('encrypts secrets so the stored value is not the secret', () => {
    const enc = encryptSecret(KEY);
    expect(enc).not.toContain(KEY.toString('base64'));
    expect(decryptSecret(enc).equals(KEY)).toBe(true);
    expect(() => decryptSecret(enc.slice(0, -4) + 'AAAA')).toThrow();
  });
});
