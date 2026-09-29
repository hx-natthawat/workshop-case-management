import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256 of the raw body with the channel secret, Base64 (research §1). */
export function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(body).digest('base64'));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64');
