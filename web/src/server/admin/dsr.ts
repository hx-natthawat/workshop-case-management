/**
 * PDPA data-subject requests on the Contacts page (#19, SPEC §8, PDPA s.30–36).
 * Supervisor and admin only (enforced by the route handlers). Every action is audit-logged;
 * audit diffs name the changed fields but never copy personal data into the insert-only log.
 */
import { and, asc, desc, eq, inArray, notInArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/server/db';
import type { CaseStatus, DsrStatus, DsrType } from '@/server/db/schema';
import { audit } from '@/server/lib/audit';
import { HttpError, type SessionUser } from '@/server/lib/auth';
import { anonymise } from './anonymise';
import { assertUuid } from './ids';

/** PDPA s.30: act on a request within 30 days of receipt. */
export const DSR_DUE_DAYS = 30;
const DAY = 86_400_000;
const FINISHED: CaseStatus[] = ['closed', 'cancelled'];

async function getContact(tenantId: string, id: string) {
  assertUuid(id, 'ไม่พบผู้ติดต่อ');
  const [c] = await db.select().from(schema.contact).where(and(eq(schema.contact.tenantId, tenantId), eq(schema.contact.id, id)));
  if (!c) throw new HttpError(404, 'ไม่พบผู้ติดต่อ');
  return c;
}

function assertNotAnonymised(c: { anonymisedAt: Date | null }) {
  if (c.anonymisedAt) throw new HttpError(409, 'ข้อมูลของผู้ติดต่อนี้ถูกลบแล้ว');
}

// ---------- request log ----------

export interface DsrRow {
  id: string;
  type: DsrType;
  receivedAt: Date;
  dueAt: Date;
  status: DsrStatus;
  overdue: boolean;
  note: string | null;
  createdByName: string | null;
  handledByName: string | null;
  handledAt: Date | null;
}

export async function listDsr(tenantId: string, contactId: string, now = new Date()): Promise<DsrRow[]> {
  assertUuid(contactId, 'ไม่พบผู้ติดต่อ');
  const rows = await db.select().from(schema.dsrRequest)
    .where(and(eq(schema.dsrRequest.tenantId, tenantId), eq(schema.dsrRequest.contactId, contactId)))
    .orderBy(desc(schema.dsrRequest.receivedAt));
  const userIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.handledBy]).filter((x): x is string => !!x))];
  const users = userIds.length
    ? await db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user)
        .where(and(eq(schema.user.tenantId, tenantId), inArray(schema.user.id, userIds)))
    : [];
  const name = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id, type: r.type, receivedAt: r.receivedAt, dueAt: r.dueAt, status: r.status,
    overdue: r.status === 'open' && r.dueAt < now,
    note: r.note,
    createdByName: r.createdBy ? name.get(r.createdBy) ?? null : null,
    handledByName: r.handledBy ? name.get(r.handledBy) ?? null : null,
    handledAt: r.handledAt,
  }));
}

export const dsrCreate = z.object({
  type: z.enum(['access', 'rectify', 'erase', 'restrict', 'object', 'portability']),
  /** ISO date or date-time the request reached the organisation; defaults to now. */
  receivedAt: z.string().optional(),
  note: z.string().trim().max(1000).optional(),
});

export async function createDsr(u: SessionUser, contactId: string, input: z.infer<typeof dsrCreate>, ip: string | null, now = new Date()) {
  const c = await getContact(u.tenantId, contactId);
  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : now;
  if (Number.isNaN(receivedAt.getTime())) throw new HttpError(400, 'วันที่รับคำขอไม่ถูกต้อง');
  if (receivedAt.getTime() > now.getTime() + DAY) throw new HttpError(400, 'วันที่รับคำขอต้องไม่อยู่ในอนาคต');
  const dueAt = new Date(receivedAt.getTime() + DSR_DUE_DAYS * DAY);
  const [row] = await db.transaction(async (tx) => {
    const r = await tx.insert(schema.dsrRequest).values({
      tenantId: u.tenantId, contactId: c.id, type: input.type, receivedAt, dueAt, createdBy: u.id, note: input.note || null,
    }).returning();
    await audit({ tenantId: u.tenantId, actorId: u.id, action: 'dsr.created', entity: 'dsr_request', entityId: r[0].id, diff: { contactId: c.id, type: input.type, dueAt }, ip }, tx);
    return r;
  });
  return { id: row.id, dueAt: row.dueAt };
}

export const dsrUpdate = z.object({
  status: z.enum(['open', 'completed', 'rejected']),
  note: z.string().trim().max(1000).optional(),
});

export async function updateDsr(u: SessionUser, contactId: string, requestId: string, input: z.infer<typeof dsrUpdate>, ip: string | null, now = new Date()) {
  assertUuid(requestId, 'ไม่พบคำขอ');
  const c = await getContact(u.tenantId, contactId);
  const [r] = await db.select().from(schema.dsrRequest).where(and(
    eq(schema.dsrRequest.tenantId, u.tenantId), eq(schema.dsrRequest.id, requestId), eq(schema.dsrRequest.contactId, c.id),
  ));
  if (!r) throw new HttpError(404, 'ไม่พบคำขอ');
  if (input.status === 'rejected' && !input.note && !r.note) throw new HttpError(400, 'กรุณาระบุเหตุผลที่ปฏิเสธคำขอ');
  const done = input.status !== 'open';
  await db.transaction(async (tx) => {
    await tx.update(schema.dsrRequest).set({
      status: input.status,
      handledBy: done ? u.id : null,
      handledAt: done ? now : null,
      ...(input.note !== undefined ? { note: input.note || null } : {}),
    }).where(and(eq(schema.dsrRequest.tenantId, u.tenantId), eq(schema.dsrRequest.id, r.id)));
    await audit({ tenantId: u.tenantId, actorId: u.id, action: 'dsr.updated', entity: 'dsr_request', entityId: r.id, diff: { status: { from: r.status, to: input.status } }, ip }, tx);
  });
  return { status: input.status };
}

// ---------- actions ----------

/** Export everything held about a contact as JSON (s.30 access, s.31 portability). */
export async function exportContact(u: SessionUser, contactId: string, ip: string | null, now = new Date()) {
  const c = await getContact(u.tenantId, contactId);
  const t = u.tenantId;
  const cases = await db.select({ k: schema.kase, categoryName: schema.category.name })
    .from(schema.kase)
    .leftJoin(schema.category, eq(schema.category.id, schema.kase.categoryId))
    .where(and(eq(schema.kase.tenantId, t), eq(schema.kase.contactId, c.id)))
    .orderBy(asc(schema.kase.createdAt));
  const ids = cases.map((r) => r.k.id);
  const [answers, messages] = ids.length
    ? await Promise.all([
        db.select().from(schema.caseAnswer).where(and(eq(schema.caseAnswer.tenantId, t), inArray(schema.caseAnswer.caseId, ids))).orderBy(asc(schema.caseAnswer.order)),
        db.select().from(schema.caseMessage).where(and(eq(schema.caseMessage.tenantId, t), inArray(schema.caseMessage.caseId, ids))).orderBy(asc(schema.caseMessage.createdAt)),
      ])
    : [[], []];
  const caseOfMessage = new Map(messages.map((m) => [m.id, m.caseId]));
  const attachments = ids.length
    ? await db.select().from(schema.attachment).where(and(
        eq(schema.attachment.tenantId, t),
        or(inArray(schema.attachment.caseId, ids), messages.length ? inArray(schema.attachment.messageId, [...caseOfMessage.keys()]) : undefined),
      )).orderBy(asc(schema.attachment.createdAt))
    : [];
  const caseOfFile = (a: { caseId: string | null; messageId: string | null }) => a.caseId ?? (a.messageId ? caseOfMessage.get(a.messageId) : undefined);
  const requests = await listDsr(t, c.id, now);

  await audit({ tenantId: t, actorId: u.id, action: 'contact.exported', entity: 'contact', entityId: c.id, diff: { cases: ids.length }, ip });

  return {
    exportedAt: now.toISOString(),
    format: 'case-management/pdpa-export@1',
    contact: {
      id: c.id,
      lineUserId: c.lineUserId,
      displayName: c.displayName,
      fullName: c.fullName,
      phone: c.phone,
      customerRef: c.customerRef,
      orgUnit: c.orgUnit,
      privacyNoticeVersion: c.consentVersion,
      privacyNoticeAcknowledgedAt: c.consentAt,
      status: c.status,
      processingRestrictedAt: c.restrictedAt,
      anonymisedAt: c.anonymisedAt,
      registeredAt: c.createdAt,
    },
    cases: cases.map(({ k, categoryName }) => ({
      caseNo: k.caseNo,
      title: k.title,
      category: categoryName,
      priority: k.priority,
      status: k.status,
      createdAt: k.createdAt,
      resolvedAt: k.resolvedAt,
      closedAt: k.closedAt,
      csatScore: k.csatScore,
      anonymisedAt: k.anonymisedAt,
      answers: answers.filter((a) => a.caseId === k.id).map((a) => ({ question: a.labelSnapshot, value: a.value })),
      // Internal staff notes are not reporter data, so only messages to and from the reporter are exported.
      messages: messages.filter((m) => m.caseId === k.id && m.direction !== 'internal').map((m) => ({
        direction: m.direction, sender: m.senderType, content: m.content, createdAt: m.createdAt,
      })),
      attachments: attachments.filter((a) => caseOfFile(a) === k.id).map((a) => ({
        id: a.id, mimeType: a.mimeType, size: a.size, sha256: a.checksum, createdAt: a.createdAt,
      })),
    })),
    requests: requests.map((r) => ({ type: r.type, receivedAt: r.receivedAt, dueAt: r.dueAt, status: r.status, handledAt: r.handledAt })),
  };
}

const optText = (max: number) => z.string().trim().max(max).nullable().optional();
export const rectifyInput = z.object({
  fullName: optText(120),
  phone: z.string().trim().regex(/^[0-9+\-\s]{0,20}$/, 'เบอร์โทรไม่ถูกต้อง').nullable().optional(),
  customerRef: optText(60),
  orgUnit: optText(120),
});

/** s.35–36: correct the contact's details. The audit diff lists changed fields only. */
export async function rectifyContact(u: SessionUser, contactId: string, input: z.infer<typeof rectifyInput>, ip: string | null) {
  const c = await getContact(u.tenantId, contactId);
  assertNotAnonymised(c);
  const patch: Partial<typeof schema.contact.$inferInsert> = {};
  for (const k of ['fullName', 'phone', 'customerRef', 'orgUnit'] as const) {
    const v = input[k];
    if (v === undefined) continue;
    const next = v === null || v === '' ? null : v;
    if (next !== c[k]) patch[k] = next;
  }
  if (patch.fullName === null) throw new HttpError(400, 'กรุณาระบุชื่อ-นามสกุล');
  const fields = Object.keys(patch);
  if (!fields.length) return { changed: [] };
  await db.transaction(async (tx) => {
    await tx.update(schema.contact).set(patch).where(and(eq(schema.contact.tenantId, u.tenantId), eq(schema.contact.id, c.id)));
    await audit({ tenantId: u.tenantId, actorId: u.id, action: 'contact.rectified', entity: 'contact', entityId: c.id, diff: { fields }, ip }, tx);
  });
  return { changed: fields };
}

/** s.34: restrict processing = contact blocked + flag; lifting the restriction re-activates the contact. */
export async function setRestricted(u: SessionUser, contactId: string, restricted: boolean, ip: string | null, now = new Date()) {
  const c = await getContact(u.tenantId, contactId);
  assertNotAnonymised(c);
  if (restricted === !!c.restrictedAt) return { restricted };
  const patch = restricted ? { status: 'blocked' as const, restrictedAt: now } : { status: 'active' as const, restrictedAt: null };
  await db.transaction(async (tx) => {
    await tx.update(schema.contact).set(patch).where(and(eq(schema.contact.tenantId, u.tenantId), eq(schema.contact.id, c.id)));
    await audit({
      tenantId: u.tenantId, actorId: u.id, action: restricted ? 'contact.restricted' : 'contact.restriction_lifted',
      entity: 'contact', entityId: c.id, diff: { status: { from: c.status, to: patch.status } }, ip,
    }, tx);
  });
  return { restricted };
}

/** s.33: erase = anonymise the contact and all their cases. Refused while any case is still open. */
export async function eraseContact(u: SessionUser, contactId: string, ip: string | null, now = new Date()) {
  const c = await getContact(u.tenantId, contactId);
  assertNotAnonymised(c);
  const [open] = await db.select({ caseNo: schema.kase.caseNo }).from(schema.kase).where(and(
    eq(schema.kase.tenantId, u.tenantId), eq(schema.kase.contactId, c.id), notInArray(schema.kase.status, FINISHED),
  )).limit(1);
  if (open) throw new HttpError(409, `ยังลบข้อมูลไม่ได้ เนื่องจากมีเคสที่ยังไม่ปิด (${open.caseNo}) กรุณาปิดหรือยกเลิกเคสก่อน`);
  const caseIds = (await db.select({ id: schema.kase.id }).from(schema.kase)
    .where(and(eq(schema.kase.tenantId, u.tenantId), eq(schema.kase.contactId, c.id)))).map((k) => k.id);
  const r = await anonymise({ tenantId: u.tenantId, caseIds, contactId: c.id, actor: { type: 'user', id: u.id, ip }, reason: 'dsr_erase', now });
  await audit({ tenantId: u.tenantId, actorId: u.id, action: 'contact.erased', entity: 'contact', entityId: c.id, diff: { cases: r.cases, files: r.files }, ip });
  return r;
}

/** Case summary used by the page to explain why erase is unavailable. */
export async function openCaseCount(tenantId: string, contactId: string) {
  const rows = await db.select({ id: schema.kase.id }).from(schema.kase).where(and(
    eq(schema.kase.tenantId, tenantId), eq(schema.kase.contactId, contactId), notInArray(schema.kase.status, FINISHED),
  ));
  return rows.length;
}
