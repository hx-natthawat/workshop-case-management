/** Read models for the web app. Writes go through Case Service. */
import { and, asc, desc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import type { CaseStatus, Priority } from '@/server/db/schema';
import { hoursOf, policies, canView, allowedTransitions } from '@/server/case/service';
import { slaView, type SlaView } from '@/server/case/sla';
import type { SessionUser } from '@/server/lib/auth';
import { OPEN_STATUSES, maskPhone } from '@/server/lib/enums';
import { signedFileUrl } from '@/server/lib/storage';
import { HttpError } from '@/server/lib/auth';

export type InboxTab = 'mine' | 'team' | 'unassigned' | 'all';
export interface InboxFilters {
  tab?: InboxTab;
  status?: string; // 'open' (default) | 'all' | CaseStatus
  priority?: string;
  categoryId?: string;
  assigneeId?: string;
  sla?: string; // 'risk'
  q?: string;
  sort?: string; // 'sla' (default) | 'updated'
  page?: number;
}

export interface InboxRow {
  id: string;
  caseNo: string;
  title: string;
  categoryPath: string;
  reporter: string;
  phoneMasked: string;
  priority: Priority;
  status: CaseStatus;
  assigneeName: string | null;
  sla: SlaView;
  updatedAt: Date;
  unread: boolean;
}

export const PAGE_SIZE = 20;

export function tabsFor(u: SessionUser): InboxTab[] {
  return u.role === 'agent' ? ['mine', 'unassigned'] : ['mine', 'team', 'unassigned', 'all'];
}

/** Role-based visibility (SPEC §5): agents see their own + unassigned cases of their team. */
function visibility(u: SessionUser): SQL | undefined {
  if (u.role !== 'agent') return undefined;
  return or(
    eq(schema.kase.assigneeId, u.id),
    and(isNull(schema.kase.assigneeId), u.teamId ? or(eq(schema.kase.teamId, u.teamId), isNull(schema.kase.teamId)) : undefined),
  );
}

function tabCondition(u: SessionUser, tab: InboxTab): SQL | undefined {
  switch (tab) {
    case 'mine': return eq(schema.kase.assigneeId, u.id);
    case 'team': return u.teamId ? eq(schema.kase.teamId, u.teamId) : undefined;
    case 'unassigned': return isNull(schema.kase.assigneeId);
    default: return undefined;
  }
}

async function lookups(tenantId: string) {
  const [cats, users, pol, hours] = await Promise.all([
    db.select().from(schema.category).where(eq(schema.category.tenantId, tenantId)),
    db.select({ id: schema.user.id, name: schema.user.name, role: schema.user.role, teamId: schema.user.teamId, isActive: schema.user.isActive, teamName: schema.team.name })
      .from(schema.user).leftJoin(schema.team, eq(schema.team.id, schema.user.teamId)).where(eq(schema.user.tenantId, tenantId)),
    policies(tenantId),
    hoursOf(tenantId),
  ]);
  const catPath = (id: string) => {
    const c = cats.find((x) => x.id === id);
    const p = c?.parentId ? cats.find((x) => x.id === c.parentId) : undefined;
    return [p?.name, c?.name].filter(Boolean).join(' › ');
  };
  return { cats, users, pol, hours, catPath };
}

export async function listCases(u: SessionUser, f: InboxFilters, now = new Date()) {
  const tab = f.tab && tabsFor(u).includes(f.tab) ? f.tab : 'mine';
  const L = await lookups(u.tenantId);
  const conds: (SQL | undefined)[] = [eq(schema.kase.tenantId, u.tenantId), visibility(u), tabCondition(u, tab)];
  const status = f.status ?? 'open';
  if (status === 'open') conds.push(inArray(schema.kase.status, [...OPEN_STATUSES, 'resolved']));
  else if (status !== 'all') conds.push(eq(schema.kase.status, status as CaseStatus));
  if (f.priority) conds.push(eq(schema.kase.priority, f.priority as Priority));
  if (f.categoryId) {
    const childIds = L.cats.filter((c) => c.id === f.categoryId || c.parentId === f.categoryId).map((c) => c.id);
    conds.push(inArray(schema.kase.categoryId, childIds));
  }
  if (f.assigneeId) conds.push(eq(schema.kase.assigneeId, f.assigneeId));

  const rows = await db
    .select({ c: schema.kase, contactName: schema.contact.fullName, displayName: schema.contact.displayName, phone: schema.contact.phone })
    .from(schema.kase)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.kase.contactId))
    .where(and(...conds))
    .orderBy(desc(schema.kase.updatedAt));

  const q = f.q?.trim().toLowerCase();
  let items: InboxRow[] = rows.map(({ c, contactName, displayName, phone }) => ({
    id: c.id,
    caseNo: c.caseNo,
    title: c.title,
    categoryPath: L.catPath(c.categoryId),
    reporter: contactName ?? displayName ?? '-',
    phoneMasked: maskPhone(phone),
    priority: c.priority,
    status: c.status,
    assigneeName: L.users.find((x) => x.id === c.assigneeId)?.name ?? null,
    sla: slaView(c, L.pol[c.priority], L.hours, now),
    updatedAt: c.updatedAt,
    unread: c.unreadByAgent,
  }));
  if (q) items = items.filter((r) => r.caseNo.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || r.reporter.toLowerCase().includes(q));
  if (f.sla === 'risk') items = items.filter((r) => r.sla.state === 'over' || r.sla.state === 'warn');
  if ((f.sort ?? 'sla') === 'sla') {
    const rank = (r: InboxRow) => (r.sla.remaining == null || r.sla.state === 'pause' ? Number.POSITIVE_INFINITY : r.sla.remaining);
    items.sort((a, b) => rank(a) - rank(b));
  }

  const total = items.length;
  const page = Math.max(1, f.page ?? 1);
  return {
    tab,
    total,
    page,
    pageSize: PAGE_SIZE,
    items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    categories: L.cats.filter((c) => !c.parentId),
    assignees: L.users.filter((x) => x.isActive),
  };
}

export async function tabCounts(u: SessionUser) {
  const result: Partial<Record<InboxTab, number>> = {};
  for (const tab of tabsFor(u)) {
    const rows = await db.select({ id: schema.kase.id }).from(schema.kase)
      .where(and(eq(schema.kase.tenantId, u.tenantId), visibility(u), tabCondition(u, tab), inArray(schema.kase.status, [...OPEN_STATUSES, 'resolved'])));
    result[tab] = rows.length;
  }
  return result;
}

export async function inboxUnreadCount(u: SessionUser) {
  const rows = await db.select({ id: schema.kase.id }).from(schema.kase).where(and(
    eq(schema.kase.tenantId, u.tenantId), visibility(u), eq(schema.kase.unreadByAgent, true), inArray(schema.kase.status, OPEN_STATUSES),
    u.role === 'agent' ? undefined : or(eq(schema.kase.assigneeId, u.id), isNull(schema.kase.assigneeId)),
  ));
  return rows.length;
}

// ── Case detail ───────────────────────────────────────────────

export async function caseDetail(u: SessionUser, id: string, now = new Date()) {
  const [c] = await db.select().from(schema.kase).where(and(eq(schema.kase.id, id), eq(schema.kase.tenantId, u.tenantId)));
  if (!c) throw new HttpError(404, 'ไม่พบเคส');
  if (!canView(u, c)) throw new HttpError(403, 'ไม่มีสิทธิ์ดูเคสนี้');
  const L = await lookups(u.tenantId);

  const [contact] = await db.select().from(schema.contact).where(eq(schema.contact.id, c.contactId));
  const [answers, messages, events, attachments, fv, contactCases] = await Promise.all([
    db.select().from(schema.caseAnswer).where(eq(schema.caseAnswer.caseId, c.id)).orderBy(asc(schema.caseAnswer.order)),
    db.select().from(schema.caseMessage).where(eq(schema.caseMessage.caseId, c.id)).orderBy(asc(schema.caseMessage.createdAt)),
    db.select().from(schema.caseEvent).where(eq(schema.caseEvent.caseId, c.id)).orderBy(asc(schema.caseEvent.createdAt)),
    db.select().from(schema.attachment).where(eq(schema.attachment.caseId, c.id)),
    c.formVersionId ? db.select({ version: schema.formVersion.version, name: schema.form.name }).from(schema.formVersion).innerJoin(schema.form, eq(schema.form.id, schema.formVersion.formId)).where(eq(schema.formVersion.id, c.formVersionId)) : Promise.resolve([]),
    db.select({ id: schema.kase.id, caseNo: schema.kase.caseNo, title: schema.kase.title, status: schema.kase.status }).from(schema.kase).where(eq(schema.kase.contactId, c.contactId)).orderBy(desc(schema.kase.createdAt)),
  ]);
  const policy = L.pol[c.priority];
  // "(ปรับ P3 → P2)" next to the answer whose priority rule raised the case (prototype CaseDetail.png)
  const createdNote = events.find((e) => e.eventType === 'created')?.note ?? '';
  const pm = createdNote.match(/priority (P\d) → (P\d)/);
  const priorityNote = pm ? `ปรับ ${pm[1]} → ${pm[2]}` : null;
  const ruleQs = c.formVersionId && priorityNote
    ? await db.select({ key: schema.question.key, rules: schema.question.priorityRules }).from(schema.question).where(eq(schema.question.formVersionId, c.formVersionId))
    : [];
  const priorityRuleKeys = new Set(ruleQs.filter((q) => q.rules && Object.keys(q.rules).length).map((q) => q.key));
  const rrEvent = events.find((e) => e.eventType === 'assigned' && e.note === 'round-robin');
  const parentName = L.catPath(c.categoryId).split(' › ')[0];
  const userName = (uid: string | null) => L.users.find((x) => x.id === uid)?.name ?? null;
  const fileUrl = (aid: string) => signedFileUrl(aid);

  // Mark as read by the agent who owns it
  if (c.unreadByAgent && (c.assigneeId === u.id || !c.assigneeId)) {
    await db.update(schema.kase).set({ unreadByAgent: false }).where(eq(schema.kase.id, c.id));
  }

  const viewer = { type: 'user' as const, user: u };
  return {
    case: c,
    categoryPath: L.catPath(c.categoryId),
    form: fv[0] ?? null,
    assigneeName: userName(c.assigneeId),
    contact: {
      id: contact.id,
      name: contact.fullName ?? contact.displayName ?? '-',
      orgUnit: contact.orgUnit,
      customerRef: contact.customerRef,
      phoneMasked: maskPhone(contact.phone),
      consentVersion: contact.consentVersion,
      status: contact.status,
      totalCases: contactCases.length,
      openCases: contactCases.filter((x) => OPEN_STATUSES.includes(x.status)).length,
    },
    related: contactCases.filter((x) => x.id !== c.id).slice(0, 5),
    answers: answers.map((a) => ({
      key: a.questionKey, label: a.labelSnapshot, value: a.value,
      priorityNote: priorityRuleKeys.has(a.questionKey) ? priorityNote : null,
      files: a.value.kind === 'files' ? a.value.attachmentIds.map((aid) => ({ id: aid, url: fileUrl(aid) })) : [],
    })),
    timeline: [
      ...messages.map((m) => ({
        kind: 'message' as const, id: m.id, at: m.createdAt, direction: m.direction, senderType: m.senderType,
        senderName: m.senderType === 'contact' ? (contact.fullName ?? contact.displayName ?? 'ผู้แจ้ง') : m.senderType === 'agent' ? userName(m.senderId) : 'Bot',
        content: m.content, imageUrl: m.content.type === 'image' ? fileUrl(m.content.attachmentId) : null, deliveryError: m.deliveryError,
      })),
      ...events.filter((e) => e !== rrEvent).map((e) => ({ kind: 'event' as const, id: e.id, at: e.createdAt, eventType: e.eventType, from: e.fromValue, to: e.toValue, note: e.note, actorName: e.actorType === 'user' ? userName(e.actorId) : e.actorType === 'system' ? 'ระบบ' : 'ผู้แจ้ง', toName: e.eventType === 'assigned' ? userName(e.toValue) : e.eventType === 'created' && rrEvent ? userName(rrEvent.toValue) : null, ...(e.eventType === 'created' ? { from: parentName } : {}) })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime()),
    attachments: attachments.map((a) => ({ id: a.id, url: fileUrl(a.id), mimeType: a.mimeType })),
    sla: {
      now: slaView(c, policy, L.hours, now),
      policy,
      hours: L.hours,
      response: c.slaResponseDue,
      resolve: c.slaResolveDue,
    },
    allowed: allowedTransitions(c, viewer),
    assignees: L.users.filter((x) => x.isActive),
  };
}
