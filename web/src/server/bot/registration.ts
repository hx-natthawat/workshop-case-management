/** Reporter registration with PDPA consent (SPEC §3, §8; story R1). */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/server/db';
import { audit } from '@/server/lib/audit';
import { HttpError } from '@/server/lib/auth';
import { config, isSimUser } from '@/server/lib/config';
import { push } from '@/server/messaging/gateway';
import { registered } from './messages';

type Tenant = typeof schema.tenant.$inferSelect;

export const registrationSchema = z.object({
  fullName: z.string().trim().min(2, 'กรุณากรอกชื่อ-นามสกุล').max(100),
  phone: z.string().trim().transform((s) => s.replace(/[\s-]/g, '')).pipe(z.string().regex(/^0\d{8,9}$/, 'เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0')),
  customerRef: z.string().trim().max(50).optional().default(''),
  orgUnit: z.string().trim().max(100).optional().default(''),
  // D-014: acknowledgement of the privacy notice, not consent as a condition of service (PDPA s.19 para 4; basis s.24)
  consent: z.literal(true, { error: 'กรุณายืนยันว่าได้อ่านประกาศความเป็นส่วนตัวแล้ว' }),
  consentVersion: z.string(),
});
export type RegistrationInput = z.input<typeof registrationSchema>;

/**
 * Verify a LIFF ID token with LINE (research §11) and return the LINE userId.
 * Never trust a userId sent by the browser.
 */
export async function verifyLiffIdToken(idToken: string): Promise<string> {
  const clientId = config.line.loginChannelId();
  if (!clientId) {
    console.error('[liff] LINE_LOGIN_CHANNEL_ID is not set');
    throw new HttpError(503, 'ระบบลงทะเบียนยังไม่พร้อมใช้งาน กรุณาติดต่อเจ้าหน้าที่'); // don't leak config names (#14 L5)
  }
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
  });
  if (!res.ok) throw new HttpError(401, 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ กรุณาเปิดหน้านี้จาก LINE อีกครั้ง');
  const body = (await res.json()) as { sub?: string };
  if (!body.sub) throw new HttpError(401, 'ID token ไม่ถูกต้อง');
  return body.sub;
}

export async function registerContact(tenant: Tenant, lineUserId: string, input: RegistrationInput, ip?: string | null) {
  const data = registrationSchema.parse(input);
  if (data.consentVersion !== tenant.pdpaVersion) throw new HttpError(409, 'ประกาศความเป็นส่วนตัวมีการปรับปรุง กรุณาโหลดหน้าใหม่');
  const now = new Date();
  const values = {
    fullName: data.fullName, phone: data.phone, customerRef: data.customerRef || null, orgUnit: data.orgUnit || null,
    consentVersion: tenant.pdpaVersion, consentAt: now, status: 'active' as const,
  };
  const [existing] = await db.select().from(schema.contact).where(and(eq(schema.contact.tenantId, tenant.id), eq(schema.contact.lineUserId, lineUserId)));
  // Re-registering must not lift a staff block (#14 M2).
  if (existing?.status === 'blocked') throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อเจ้าหน้าที่');
  const [contact] = existing
    ? await db.update(schema.contact).set(values).where(eq(schema.contact.id, existing.id)).returning()
    : await db.insert(schema.contact).values({ tenantId: tenant.id, lineUserId, isSimulated: isSimUser(lineUserId), ...values }).returning();
  await audit({
    tenantId: tenant.id, actorType: 'contact', actorId: contact.id, action: 'contact.consented', entity: 'contact', entityId: contact.id,
    diff: { consentVersion: tenant.pdpaVersion, fields: ['fullName', 'phone', 'customerRef', 'orgUnit'] }, ip,
  });
  await push(tenant.id, lineUserId, registered(data.fullName.split(' ')[0]));
  return contact;
}
