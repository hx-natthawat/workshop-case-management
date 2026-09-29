import { z } from 'zod';
import { registerContact, verifyLiffIdToken, type RegistrationInput } from '@/server/bot/registration';
import { HttpError } from '@/server/lib/auth';
import { config, isSimUser } from '@/server/lib/config';
import { clientIp, handle } from '@/server/lib/http';
import { defaultTenant } from '@/server/lib/tenant';

const identitySchema = z.object({ simUserId: z.string().max(64).optional(), idToken: z.string().max(4096).optional() });

/**
 * Registration from the LIFF page. The LINE userId is never taken from the browser:
 * real mode verifies the LIFF ID token with LINE; sim mode only works while the simulator is enabled.
 */
export const POST = handle(async (req: Request) => {
  const body = (await req.json()) as Record<string, unknown>;
  const { simUserId, idToken } = identitySchema.parse(body);
  let lineUserId: string;
  if (simUserId) {
    if (!config.simulatorEnabled() || !isSimUser(simUserId)) throw new HttpError(403, 'ไม่อนุญาตให้ลงทะเบียนในโหมดจำลอง');
    lineUserId = simUserId;
  } else if (idToken) {
    lineUserId = await verifyLiffIdToken(idToken);
  } else {
    throw new HttpError(401, 'กรุณาเปิดหน้านี้จาก LINE');
  }
  const tenant = await defaultTenant();
  const input: RegistrationInput = {
    fullName: String(body.fullName ?? ''),
    phone: String(body.phone ?? ''),
    customerRef: typeof body.customerRef === 'string' ? body.customerRef : '',
    orgUnit: typeof body.orgUnit === 'string' ? body.orgUnit : '',
    consent: body.consent as true,
    consentVersion: String(body.consentVersion ?? ''),
  };
  await registerContact(tenant, lineUserId, input, clientIp(req));
  return { ok: true };
});
