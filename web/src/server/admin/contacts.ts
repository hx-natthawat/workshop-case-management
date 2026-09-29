/** Contacts (reporters). Phone is always masked in lists; full phone only via audited reveal (SPEC §8). */
import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/server/db';
import type { CaseStatus, Priority } from '@/server/db/schema';
import { canView } from '@/server/case/service';
import { audit } from '@/server/lib/audit';
import { HttpError, type SessionUser } from '@/server/lib/auth';
import { OPEN_STATUSES, maskPhone } from '@/server/lib/enums';
import { assertUuid } from './ids';

export const CONTACT_PAGE_SIZE = 50;
export type ContactStatus = 'active' | 'unfollowed' | 'blocked';

export interface ContactListRow {
  id: string;
  name: string;
  phoneMasked: string;
  customerRef: string | null;
  orgUnit: string | null;
  consentVersion: string | null;
  consentAt: Date | null;
  status: ContactStatus;
  isSimulated: boolean;
  totalCases: number;
  openCases: number;
}

const nameOf = (c: { fullName: string | null; displayName: string | null }) => c.fullName || c.displayName || 'ไม่ระบุชื่อ';

export async function listContacts(tenantId: string, f: { q?: string; page?: number }) {
  const page = Math.max(1, f.page ?? 1);
  const q = f.q?.trim();
  const like = q ? `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const where = and(
    eq(schema.contact.tenantId, tenantId),
    like ? or(ilike(schema.contact.fullName, like), ilike(schema.contact.displayName, like), ilike(schema.contact.customerRef, like)) : undefined,
  );
  const [{ n }] = await db.select({ n: count() }).from(schema.contact).where(where);
  const rows = await db
    .select()
    .from(schema.contact)
    .where(where)
    .orderBy(desc(schema.contact.createdAt))
    .limit(CONTACT_PAGE_SIZE)
    .offset((page - 1) * CONTACT_PAGE_SIZE);
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({
          contactId: schema.kase.contactId,
          total: count(),
          open: sql<number>`count(*) filter (where ${inArray(schema.kase.status, OPEN_STATUSES)})`.mapWith(Number),
        })
        .from(schema.kase)
        .where(and(eq(schema.kase.tenantId, tenantId), inArray(schema.kase.contactId, ids)))
        .groupBy(schema.kase.contactId)
    : [];
  const byId = new Map(counts.map((c) => [c.contactId, c]));
  const items: ContactListRow[] = rows.map((r) => ({
    id: r.id,
    name: nameOf(r),
    phoneMasked: maskPhone(r.phone),
    customerRef: r.customerRef,
    orgUnit: r.orgUnit,
    consentVersion: r.consentVersion,
    consentAt: r.consentAt,
    status: r.status,
    isSimulated: r.isSimulated,
    totalCases: byId.get(r.id)?.total ?? 0,
    openCases: byId.get(r.id)?.open ?? 0,
  }));
  return { items, total: n, page, pageSize: CONTACT_PAGE_SIZE };
}

async function getContact(tenantId: string, id: string) {
  assertUuid(id, 'ไม่พบผู้ติดต่อ');
  const [c] = await db.select().from(schema.contact).where(and(eq(schema.contact.id, id), eq(schema.contact.tenantId, tenantId)));
  if (!c) throw new HttpError(404, 'ไม่พบผู้ติดต่อ');
  return c;
}

export interface ContactCaseRow {
  id: string;
  caseNo: string;
  title: string;
  categoryName: string | null;
  priority: Priority;
  status: CaseStatus;
  assigneeName: string | null;
  createdAt: Date;
}

/** Contact detail. Case history is filtered with the same rule as the case pages (`canView`). */
export async function contactDetail(u: SessionUser, id: string) {
  const c = await getContact(u.tenantId, id);
  const rows = await db
    .select({ k: schema.kase, categoryName: schema.category.name, assigneeName: schema.user.name })
    .from(schema.kase)
    .leftJoin(schema.category, eq(schema.category.id, schema.kase.categoryId))
    .leftJoin(schema.user, eq(schema.user.id, schema.kase.assigneeId))
    .where(and(eq(schema.kase.tenantId, u.tenantId), eq(schema.kase.contactId, c.id)))
    .orderBy(desc(schema.kase.createdAt));
  const visible = rows.filter((r) => canView(u, r.k));
  const cases: ContactCaseRow[] = visible.map(({ k, categoryName, assigneeName }) => ({
    id: k.id, caseNo: k.caseNo, title: k.title, categoryName, priority: k.priority, status: k.status, assigneeName, createdAt: k.createdAt,
  }));
  return {
    contact: {
      id: c.id,
      name: nameOf(c),
      displayName: c.displayName,
      phoneMasked: maskPhone(c.phone),
      hasPhone: !!c.phone,
      customerRef: c.customerRef,
      orgUnit: c.orgUnit,
      consentVersion: c.consentVersion,
      consentAt: c.consentAt,
      status: c.status,
      isSimulated: c.isSimulated,
      createdAt: c.createdAt,
    },
    cases,
    hiddenCaseCount: rows.length - visible.length,
    canReveal: u.role !== 'agent' || visible.length > 0,
  };
}

export async function revealPhone(u: SessionUser, id: string, ip: string | null) {
  const d = await contactDetail(u, id);
  if (!d.canReveal) throw new HttpError(403, 'ไม่มีสิทธิ์ดูข้อมูลนี้');
  const c = await getContact(u.tenantId, id);
  await audit({ tenantId: u.tenantId, actorId: u.id, action: 'contact.phone_revealed', entity: 'contact', entityId: c.id, diff: { via: 'contact_page' }, ip });
  return { phone: c.phone };
}

export const contactPatch = z.object({ status: z.enum(['active', 'blocked']) });

export async function setContactStatus(u: SessionUser, id: string, status: 'active' | 'blocked', ip: string | null) {
  const c = await getContact(u.tenantId, id);
  if (c.status === status) return { status };
  await db.update(schema.contact).set({ status }).where(and(eq(schema.contact.id, c.id), eq(schema.contact.tenantId, u.tenantId)));
  await audit({
    tenantId: u.tenantId, actorId: u.id, action: status === 'blocked' ? 'contact.blocked' : 'contact.unblocked',
    entity: 'contact', entityId: c.id, diff: { status: { from: c.status, to: status } }, ip,
  });
  return { status };
}
