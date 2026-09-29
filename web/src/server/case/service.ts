/**
 * Case Service: the only module that creates cases or changes case.status (design 04 §1, invariant 2).
 */
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db, schema, type DbOrTx } from '@/server/db';
import type { CaseStatus, MessageContent, Priority } from '@/server/db/schema';
import type { CaseDraft, DraftAnswer } from '@/server/bot/dialog';
import type { LineMessage } from '@/server/bot/line-types';
import { agentReply, resolvedCard, text } from '@/server/bot/messages';
import { push } from '@/server/messaging/gateway';
import { audit } from '@/server/lib/audit';
import { HttpError, type Role, type SessionUser } from '@/server/lib/auth';
import { STATUS } from '@/server/lib/enums';
import type { BusinessHours } from './business-time';
import { computeDues, formatMinutesTh, raisePriority, resumeDue, type SlaPolicyLike } from './sla';

type CaseRow = typeof schema.kase.$inferSelect;
type ContactRow = typeof schema.contact.$inferSelect;

export type Actor =
  | { type: 'user'; user: SessionUser }
  | { type: 'contact'; contactId: string }
  | { type: 'system' };

type ActorKind = Role | 'contact' | 'system';
const STAFF: ActorKind[] = ['agent', 'supervisor', 'admin'];

/** Design 04 §4. Mirrors the table exactly. */
export const TRANSITIONS: Record<CaseStatus, Partial<Record<CaseStatus, ActorKind[]>>> = {
  new: { assigned: [...STAFF, 'system'], cancelled: STAFF },
  assigned: { in_progress: STAFF, cancelled: STAFF },
  in_progress: { pending_customer: STAFF, resolved: STAFF },
  pending_customer: { in_progress: [...STAFF, 'contact'], closed: ['system'] },
  resolved: { closed: ['contact', 'system', 'supervisor', 'admin'], reopened: ['contact'] },
  reopened: { in_progress: STAFF },
  closed: {},
  cancelled: {},
};

export const REOPEN_WINDOW_DAYS = 7;

const actorKind = (a: Actor): ActorKind => (a.type === 'user' ? a.user.role : a.type);
const actorId = (a: Actor) => (a.type === 'user' ? a.user.id : a.type === 'contact' ? a.contactId : null);
const actorType = (a: Actor) => (a.type === 'user' ? 'user' : a.type) as 'user' | 'contact' | 'system';

export function allowedTransitions(c: Pick<CaseRow, 'status' | 'assigneeId'>, actor: Actor): CaseStatus[] {
  const kind = actorKind(actor);
  return (Object.entries(TRANSITIONS[c.status]) as [CaseStatus, ActorKind[]][])
    .filter(([, who]) => who.includes(kind))
    .filter(() => !(actor.type === 'user' && actor.user.role === 'agent' && c.assigneeId !== actor.user.id))
    .map(([to]) => to);
}

// ── Lookups ───────────────────────────────────────────────────

export async function hoursOf(tenantId: string, tx: DbOrTx = db): Promise<BusinessHours> {
  const [t] = await tx.select().from(schema.tenant).where(eq(schema.tenant.id, tenantId));
  return { startMin: t.bizStartMin, endMin: t.bizEndMin };
}

export async function policyOf(tenantId: string, priority: Priority, tx: DbOrTx = db): Promise<SlaPolicyLike> {
  const [p] = await tx.select().from(schema.slaPolicy).where(and(eq(schema.slaPolicy.tenantId, tenantId), eq(schema.slaPolicy.priority, priority)));
  if (!p) throw new Error(`No SLA policy for ${priority}`);
  return p;
}

export async function policies(tenantId: string, tx: DbOrTx = db): Promise<Record<Priority, SlaPolicyLike>> {
  const rows = await tx.select().from(schema.slaPolicy).where(eq(schema.slaPolicy.tenantId, tenantId));
  return Object.fromEntries(rows.map((r) => [r.priority, r])) as unknown as Record<Priority, SlaPolicyLike>;
}

export async function getCase(tenantId: string, caseId: string, tx: DbOrTx = db): Promise<CaseRow> {
  const [c] = await tx.select().from(schema.kase).where(and(eq(schema.kase.id, caseId), eq(schema.kase.tenantId, tenantId)));
  if (!c) throw new HttpError(404, 'ไม่พบเคส');
  return c;
}

/** SPEC §5 permissions: agents see their own cases and unassigned cases of their team. */
export function canView(u: SessionUser, c: Pick<CaseRow, 'assigneeId' | 'teamId'>): boolean {
  if (u.role !== 'agent') return true;
  return c.assigneeId === u.id || (c.assigneeId === null && (c.teamId === u.teamId || c.teamId === null));
}

async function contactOf(c: CaseRow, tx: DbOrTx = db): Promise<ContactRow> {
  const [ct] = await tx.select().from(schema.contact).where(eq(schema.contact.id, c.contactId));
  return ct;
}

// ── Notifications ─────────────────────────────────────────────

export async function notify(tenantId: string, userIds: (string | null | undefined)[], type: string, caseId: string | null, msg: string, tx: DbOrTx = db) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  await tx.insert(schema.notification).values(ids.map((userId) => ({ tenantId, userId, type, caseId, text: msg })));
}

export async function supervisorsOf(tenantId: string, teamId: string | null, tx: DbOrTx = db): Promise<string[]> {
  const rows = await tx
    .select({ id: schema.user.id, teamId: schema.user.teamId })
    .from(schema.user)
    .where(and(eq(schema.user.tenantId, tenantId), eq(schema.user.role, 'supervisor'), eq(schema.user.isActive, true)));
  const inTeam = rows.filter((r) => r.teamId === teamId);
  return (inTeam.length ? inTeam : rows).map((r) => r.id);
}

// ── Creation ──────────────────────────────────────────────────

/** CS-<C.E. yy><mm>-<5 digits>, sequence per tenant per month (analysis A7). */
async function nextCaseNo(tx: DbOrTx, tenantId: string, now: Date): Promise<string> {
  const local = new Date(now.getTime() + 7 * 3600_000);
  const period = `${String(local.getUTCFullYear() % 100).padStart(2, '0')}${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
  const [row] = await tx
    .insert(schema.caseCounter)
    .values({ tenantId, period, seq: 1 })
    .onConflictDoUpdate({ target: [schema.caseCounter.tenantId, schema.caseCounter.period], set: { seq: sql`${schema.caseCounter.seq} + 1` } })
    .returning({ seq: schema.caseCounter.seq });
  return `CS-${period}-${String(row.seq).padStart(5, '0')}`;
}

function titleFrom(answers: DraftAnswer[], categoryName: string, note?: string): string {
  const clip = (s: string) => (s.length > 80 ? `${s.slice(0, 77)}…` : s);
  if (note) return clip(note);
  const long = answers.find((a) => a.value.kind === 'text' && a.value.text.length >= 8);
  if (long && long.value.kind === 'text') return clip(`${categoryName}: ${long.value.text}`);
  const first = answers.find((a) => a.value.kind === 'choice' || a.value.kind === 'text');
  const v = first?.value.kind === 'choice' ? first.value.value : first?.value.kind === 'text' ? first.value.text : '';
  return clip(v ? `${categoryName} · ${v}` : categoryName);
}

async function pickRoundRobin(tx: DbOrTx, tenantId: string, teamId: string | null): Promise<string | null> {
  if (!teamId) return null;
  const [t] = await tx.select().from(schema.team).where(eq(schema.team.id, teamId));
  if (!t?.autoAssign) return null;
  const [u] = await tx
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(and(eq(schema.user.tenantId, tenantId), eq(schema.user.teamId, teamId), eq(schema.user.isActive, true), inArray(schema.user.role, ['agent', 'supervisor'])))
    .orderBy(sql`${schema.user.lastAssignedAt} asc nulls first`, asc(schema.user.createdAt))
    .limit(1);
  return u?.id ?? null;
}

export interface CreateCaseInput {
  tenantId: string;
  contact: ContactRow;
  draft: CaseDraft & { note?: string };
  now?: Date;
}

export async function createCase({ tenantId, contact, draft, now = new Date() }: CreateCaseInput) {
  if (!contact.consentAt) throw new HttpError(409, 'ผู้แจ้งยังไม่ได้ให้ความยินยอม'); // invariant 5

  return db.transaction(async (tx) => {
    const [category] = await tx.select().from(schema.category).where(and(eq(schema.category.id, draft.categoryId), eq(schema.category.tenantId, tenantId)));
    if (!category) throw new HttpError(400, 'ไม่พบหมวดหมู่');
    const priority = raisePriority(category.defaultPriority, draft.requestedPriority);
    const policy = await policyOf(tenantId, priority, tx);
    const hours = await hoursOf(tenantId, tx);
    const dues = computeDues(now, policy, hours);
    const caseNo = await nextCaseNo(tx, tenantId, now);
    const assigneeId = await pickRoundRobin(tx, tenantId, category.defaultTeamId);

    const [c] = await tx.insert(schema.kase).values({
      tenantId,
      caseNo,
      title: titleFrom(draft.answers, category.name, draft.note),
      contactId: contact.id,
      categoryId: category.id,
      formVersionId: draft.formVersionId,
      priority,
      status: assigneeId ? 'assigned' : 'new',
      assigneeId,
      teamId: category.defaultTeamId,
      slaResponseDue: dues.responseDue,
      slaResolveDue: dues.resolveDue,
      lastInboundAt: now,
      createdAt: now,
      updatedAt: now,
    }).returning();

    if (draft.answers.length) {
      await tx.insert(schema.caseAnswer).values(draft.answers.map((a) => ({
        tenantId, caseId: c.id, questionKey: a.key, labelSnapshot: a.label, order: a.order, value: a.value,
      })));
    }
    const attachmentIds = draft.answers.flatMap((a) => (a.value.kind === 'files' ? a.value.attachmentIds : []));
    if (attachmentIds.length) {
      await tx.update(schema.attachment).set({ caseId: c.id })
        .where(and(eq(schema.attachment.tenantId, tenantId), inArray(schema.attachment.id, attachmentIds), isNull(schema.attachment.caseId)));
    }

    const content: MessageContent = draft.note
      ? { type: 'text', text: draft.note }
      : { type: 'form_submitted', answerCount: draft.answers.length, attachmentCount: attachmentIds.length };
    await tx.insert(schema.caseMessage).values({ tenantId, caseId: c.id, direction: 'in', senderType: 'contact', senderId: contact.id, content, createdAt: now });

    const events: (typeof schema.caseEvent.$inferInsert)[] = [
      { tenantId, caseId: c.id, eventType: 'created', toValue: 'new', actorType: 'contact', actorId: contact.id, note: draft.requestedPriority && priority !== category.defaultPriority ? `priority ${category.defaultPriority} → ${priority} จากคำตอบระดับผลกระทบ` : null, createdAt: now },
    ];
    if (assigneeId) {
      events.push({ tenantId, caseId: c.id, eventType: 'assigned', fromValue: 'new', toValue: assigneeId, actorType: 'system', note: 'round-robin', createdAt: now });
      await tx.update(schema.user).set({ lastAssignedAt: now }).where(eq(schema.user.id, assigneeId));
      await notify(tenantId, [assigneeId], 'case_assigned', c.id, `เคสใหม่ ${caseNo} มอบหมายให้คุณ`, tx);
    } else {
      await notify(tenantId, await supervisorsOf(tenantId, category.defaultTeamId, tx), 'case_unassigned', c.id, `เคสใหม่ ${caseNo} ยังไม่มีผู้รับผิดชอบ`, tx);
    }
    await tx.insert(schema.caseEvent).values(events);

    const [assignee] = assigneeId ? await tx.select().from(schema.user).where(eq(schema.user.id, assigneeId)) : [];
    return { case: c, assignee: assignee ?? null, policy, hours };
  });
}

// ── Transitions ───────────────────────────────────────────────

interface TransitionOpts {
  reason?: string;
  now?: Date;
  /** Return reporter messages instead of pushing them (caller combines pushes). */
  deferPush?: boolean;
  /** An agent message accompanies this change, so skip the generic "we need more info" push. */
  withAgentMessage?: boolean;
}

export async function transition(tenantId: string, caseId: string, to: CaseStatus, actor: Actor, opts: TransitionOpts = {}) {
  const now = opts.now ?? new Date();
  const result = await db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.kase).where(and(eq(schema.kase.id, caseId), eq(schema.kase.tenantId, tenantId))).for('update');
    if (!c) throw new HttpError(404, 'ไม่พบเคส');
    if (actor.type === 'user' && !canView(actor.user, c)) throw new HttpError(403, 'ไม่มีสิทธิ์ในเคสนี้');
    if (!allowedTransitions(c, actor).includes(to)) {
      throw new HttpError(409, `เปลี่ยนสถานะจาก "${STATUS[c.status].label}" เป็น "${STATUS[to].label}" ไม่ได้`);
    }
    if (to === 'cancelled' && !opts.reason?.trim()) throw new HttpError(400, 'กรุณาระบุเหตุผลการยกเลิก');

    const policy = await policyOf(tenantId, c.priority, tx);
    const hours = await hoursOf(tenantId, tx);
    const patch: Partial<CaseRow> = { status: to, updatedAt: now };

    const resumeFrom = c.slaPausedAt;
    if (to === 'pending_customer') Object.assign(patch, { slaPausedAt: now, pendingSince: now, pendingRemindedAt: null });
    if ((c.status === 'pending_customer' || c.status === 'resolved') && (to === 'in_progress' || to === 'reopened') && resumeFrom) {
      Object.assign(patch, {
        slaPausedAt: null,
        pendingSince: null,
        slaResolveDue: c.slaResolveDue ? resumeDue(resumeFrom, c.slaResolveDue, now, policy, hours) : null,
        slaResponseDue: !c.firstResponseAt && c.slaResponseDue ? resumeDue(resumeFrom, c.slaResponseDue, now, policy, hours) : c.slaResponseDue,
      });
    }
    if (to === 'resolved') Object.assign(patch, { resolvedAt: now, slaPausedAt: now });
    if (to === 'reopened') Object.assign(patch, { reopenCount: c.reopenCount + 1, resolvedAt: null, unreadByAgent: true });
    if (to === 'closed' || to === 'cancelled') Object.assign(patch, { closedAt: now });

    const [updated] = await tx.update(schema.kase).set(patch).where(eq(schema.kase.id, c.id)).returning();
    await tx.insert(schema.caseEvent).values({
      tenantId, caseId: c.id, eventType: 'status_changed', fromValue: c.status, toValue: to,
      actorType: actorType(actor), actorId: actorId(actor), note: opts.reason ?? null, createdAt: now,
    });
    await audit({ tenantId, actorId: actorId(actor), actorType: actorType(actor), action: 'case.status_changed', entity: 'case', entityId: c.id, diff: { status: [c.status, to], reason: opts.reason } }, tx);

    if (to === 'reopened' || (to === 'in_progress' && actor.type === 'contact')) {
      await notify(tenantId, [c.assigneeId], to === 'reopened' ? 'case_reopened' : 'customer_replied', c.id, `${c.caseNo}: ${to === 'reopened' ? 'ผู้แจ้งแจ้งว่ายังไม่เรียบร้อย เปิดเคสใหม่' : 'ผู้แจ้งตอบกลับแล้ว'}`, tx);
    }
    return { before: c, after: updated };
  });

  const messages = reporterMessagesFor(result.before, result.after, actor, opts);
  if (!opts.deferPush && messages.length) await sendToReporter(tenantId, result.after, messages);
  return { ...result, messages };
}

/** SPEC §8 notification table: Push to the reporter on status changes they care about. */
function reporterMessagesFor(before: CaseRow, after: CaseRow, actor: Actor, opts: TransitionOpts): LineMessage[] {
  const no = after.caseNo;
  switch (after.status) {
    case 'in_progress':
      return before.status === 'assigned' || before.status === 'reopened' ? [text(`เจ้าหน้าที่เริ่มดำเนินการเคส ${no} แล้วครับ`)] : [];
    case 'pending_customer':
      return opts.withAgentMessage ? [] : [text(`เจ้าหน้าที่ขอข้อมูลเพิ่มเติมสำหรับเคส ${no} ครับ พิมพ์หรือส่งรูปตอบในแชทนี้ได้เลยครับ`)];
    case 'resolved':
      return [resolvedCard(after.id, no)];
    case 'closed':
      if (actor.type === 'contact') return [];
      return actor.type === 'system'
        ? [text(`เคส ${no} ปิดอัตโนมัติแล้วครับ หากยังพบปัญหา แจ้งเคสใหม่ได้ที่เมนู "แจ้งปัญหาใหม่"`)]
        : [text(`เคส ${no} ปิดเรียบร้อยแล้วครับ ขอบคุณที่ใช้บริการ`)];
    case 'cancelled':
      return [text(`เคส ${no} ถูกยกเลิกครับ${opts.reason ? `\nเหตุผล: ${opts.reason}` : ''}`)];
    default:
      return [];
  }
}

export async function sendToReporter(tenantId: string, c: CaseRow, messages: LineMessage[]) {
  const ct = await contactOf(c);
  if (!ct || ct.status !== 'active') {
    await db.insert(schema.caseEvent).values({ tenantId, caseId: c.id, eventType: 'delivery_skipped', actorType: 'system', note: 'ผู้แจ้งบล็อกหรือเลิกติดตาม OA ส่งข้อความไม่ได้' });
    return { ok: false };
  }
  const r = await push(tenantId, ct.lineUserId, messages);
  if (!r.ok) {
    await db.insert(schema.caseEvent).values({ tenantId, caseId: c.id, eventType: 'delivery_failed', actorType: 'system', note: r.error?.slice(0, 300) });
  }
  return r;
}

// ── Assignment and priority ───────────────────────────────────

export async function assign(tenantId: string, caseId: string, assigneeId: string, actor: Extract<Actor, { type: 'user' }>, now = new Date()) {
  const u = actor.user;
  const c = await getCase(tenantId, caseId);
  if (!canView(u, c)) throw new HttpError(403, 'ไม่มีสิทธิ์ในเคสนี้');
  if (u.role === 'agent' && assigneeId !== u.id) throw new HttpError(403, 'Agent รับเคสได้เฉพาะให้ตนเอง');
  if (c.status === 'closed' || c.status === 'cancelled') throw new HttpError(409, 'เคสปิดแล้ว มอบหมายไม่ได้');
  const [target] = await db.select().from(schema.user).where(and(eq(schema.user.id, assigneeId), eq(schema.user.tenantId, tenantId), eq(schema.user.isActive, true)));
  if (!target) throw new HttpError(400, 'ไม่พบผู้ใช้');

  await db.transaction(async (tx) => {
    await tx.update(schema.kase).set({ assigneeId, teamId: target.teamId ?? c.teamId, updatedAt: now }).where(eq(schema.kase.id, c.id));
    await tx.insert(schema.caseEvent).values({ tenantId, caseId: c.id, eventType: 'assigned', fromValue: c.assigneeId, toValue: assigneeId, actorType: 'user', actorId: u.id, createdAt: now });
    await audit({ tenantId, actorId: u.id, action: 'case.assigned', entity: 'case', entityId: c.id, diff: { assigneeId: [c.assigneeId, assigneeId] } }, tx);
    if (assigneeId !== u.id) await notify(tenantId, [assigneeId], 'case_assigned', c.id, `${c.caseNo} มอบหมายให้คุณโดย ${u.name}`, tx);
  });
  // The case row now has the new assignee, so an agent self-assigning passes the ownership check.
  if (c.status === 'new') await transition(tenantId, c.id, 'assigned', actor, { now });
}

export async function changePriority(tenantId: string, caseId: string, priority: Priority, reason: string, actor: Extract<Actor, { type: 'user' }>, now = new Date()) {
  if (!reason?.trim()) throw new HttpError(400, 'กรุณาระบุเหตุผลการเปลี่ยน priority');
  const c = await getCase(tenantId, caseId);
  if (!canView(actor.user, c)) throw new HttpError(403, 'ไม่มีสิทธิ์ในเคสนี้');
  if (c.priority === priority) return;
  const policy = await policyOf(tenantId, priority);
  const hours = await hoursOf(tenantId);
  // Recompute from creation time with the new policy (pauses are not re-applied; acceptable for MVP).
  const dues = computeDues(c.createdAt, policy, hours);
  await db.transaction(async (tx) => {
    await tx.update(schema.kase).set({
      priority, slaResponseDue: dues.responseDue, slaResolveDue: dues.resolveDue,
      slaWarnedResponse: false, slaWarnedResolve: false, slaBreachedResponse: false, slaBreachedResolve: false, updatedAt: now,
    }).where(eq(schema.kase.id, c.id));
    await tx.insert(schema.caseEvent).values({ tenantId, caseId: c.id, eventType: 'priority_changed', fromValue: c.priority, toValue: priority, actorType: 'user', actorId: actor.user.id, note: reason, createdAt: now });
    await audit({ tenantId, actorId: actor.user.id, action: 'case.priority_changed', entity: 'case', entityId: c.id, diff: { priority: [c.priority, priority], reason } }, tx);
  });
}

// ── Messages ──────────────────────────────────────────────────

export async function postAgentMessage(
  tenantId: string, caseId: string, actor: Extract<Actor, { type: 'user' }>,
  input: { mode: 'line' | 'internal'; text: string; afterStatus?: CaseStatus | null }, now = new Date(),
) {
  const body = input.text.trim();
  if (!body) throw new HttpError(400, 'กรุณาพิมพ์ข้อความ');
  const c = await getCase(tenantId, caseId);
  if (!canView(actor.user, c)) throw new HttpError(403, 'ไม่มีสิทธิ์ในเคสนี้');
  if (input.mode === 'line' && (c.status === 'closed' || c.status === 'cancelled')) throw new HttpError(409, 'เคสปิดแล้ว ส่งข้อความถึงผู้แจ้งไม่ได้');
  if (input.afterStatus && input.afterStatus !== c.status && !allowedTransitions(c, actor).includes(input.afterStatus)) {
    throw new HttpError(409, `เปลี่ยนเป็น "${STATUS[input.afterStatus].label}" ไม่ได้จากสถานะปัจจุบัน`);
  }

  const [msg] = await db.insert(schema.caseMessage).values({
    tenantId, caseId: c.id, direction: input.mode === 'line' ? 'out' : 'internal', senderType: 'agent', senderId: actor.user.id,
    content: { type: 'text', text: body }, createdAt: now,
  }).returning();

  if (input.mode === 'line' && !c.firstResponseAt) {
    await db.update(schema.kase).set({ firstResponseAt: now }).where(eq(schema.kase.id, c.id));
    const within = c.slaResponseDue ? now <= c.slaResponseDue : true;
    const took = formatMinutesTh(Math.max(1, Math.round((now.getTime() - c.createdAt.getTime()) / 60_000)));
    // Prototype copy: "ตอบรับครั้งแรกภายใน 8 นาที (SLA ตอบรับผ่าน)"
    await db.insert(schema.caseEvent).values({ tenantId, caseId: c.id, eventType: 'first_response', actorType: 'user', actorId: actor.user.id, note: `ตอบรับครั้งแรกภายใน ${took} (SLA ตอบรับ${within ? 'ผ่าน' : 'ไม่ผ่าน'})`, createdAt: now });
  }
  await db.update(schema.kase).set({ updatedAt: now, unreadByAgent: false }).where(eq(schema.kase.id, c.id));

  let statusMessages: LineMessage[] = [];
  if (input.afterStatus && input.afterStatus !== c.status) {
    const r = await transition(tenantId, c.id, input.afterStatus, actor, { now, deferPush: true, withAgentMessage: input.mode === 'line' });
    statusMessages = r.messages;
  }

  if (input.mode === 'line' || statusMessages.length) {
    const agentMsg: LineMessage[] = input.mode === 'line' ? [agentReply(body, actor.user.name)] : [];
    const r = await sendToReporter(tenantId, c, [...agentMsg, ...statusMessages]);
    if (!r.ok && input.mode === 'line') {
      await db.update(schema.caseMessage).set({ deliveryError: 'error' in r && r.error ? r.error : 'ส่งไม่สำเร็จ' }).where(eq(schema.caseMessage.id, msg.id));
    }
  }
  return msg;
}

/** Reporter message bound to a case (SPEC §3 "ติดตามและโต้ตอบหลังเปิดเคส"). */
export async function addInbound(tenantId: string, c: CaseRow, contact: ContactRow, content: MessageContent, lineMessageId: string | null, now = new Date()) {
  await db.insert(schema.caseMessage).values({ tenantId, caseId: c.id, direction: 'in', senderType: 'contact', senderId: contact.id, content, lineMessageId, createdAt: now });
  await db.update(schema.kase).set({ lastInboundAt: now, unreadByAgent: true, updatedAt: now }).where(eq(schema.kase.id, c.id));
  if (c.status === 'pending_customer') {
    await transition(tenantId, c.id, 'in_progress', { type: 'contact', contactId: contact.id }, { now });
  } else {
    await notify(tenantId, [c.assigneeId], 'customer_replied', c.id, `${c.caseNo}: ผู้แจ้งส่งข้อความใหม่`);
  }
}

export async function openCasesOf(tenantId: string, contactId: string) {
  return db.select().from(schema.kase)
    .where(and(eq(schema.kase.tenantId, tenantId), eq(schema.kase.contactId, contactId), ne(schema.kase.status, 'closed'), ne(schema.kase.status, 'cancelled')))
    .orderBy(desc(schema.kase.updatedAt));
}

export async function setCsat(tenantId: string, caseId: string, contactId: string, score: number) {
  const c = await getCase(tenantId, caseId);
  if (c.contactId !== contactId) throw new HttpError(403, 'not your case');
  if (score < 1 || score > 5) throw new HttpError(400, 'score');
  if (c.csatScore != null) return { already: true, case: c };
  await db.update(schema.kase).set({ csatScore: score }).where(eq(schema.kase.id, c.id));
  await db.insert(schema.caseEvent).values({ tenantId, caseId: c.id, eventType: 'csat_submitted', toValue: String(score), actorType: 'contact', actorId: contactId });
  return { already: false, case: c };
}
