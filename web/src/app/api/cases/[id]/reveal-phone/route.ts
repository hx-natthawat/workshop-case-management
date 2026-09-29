import { eq } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import { canView, getCase } from '@/server/case/service';
import { audit } from '@/server/lib/audit';
import { HttpError, requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';

/** Full phone on demand, audit-logged (SPEC §8 PDPA). */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireApiUser();
  const c = await getCase(u.tenantId, (await params).id);
  if (!canView(u, c)) throw new HttpError(403, 'ไม่มีสิทธิ์ดูข้อมูลนี้');
  const [contact] = await db.select().from(schema.contact).where(eq(schema.contact.id, c.contactId));
  await audit({ tenantId: u.tenantId, actorId: u.id, action: 'contact.phone_revealed', entity: 'contact', entityId: contact.id, diff: { caseId: c.id }, ip: clientIp(req) });
  return { phone: contact.phone };
});
