/**
 * Bot Service: turns LINE webhook events into dialog steps and Case Service calls.
 * It never writes case status itself (design 04 §1).
 */
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import type { MessageContent } from '@/server/db/schema';
import * as caseSvc from '@/server/case/service';
import { fetchContent, getProfile, reply, showLoading } from '@/server/messaging/gateway';
import { isSimUser, registerUrl } from '@/server/lib/config';
import { PRIORITY, STATUS } from '@/server/lib/enums';
import { putObject } from '@/server/lib/storage';
import { answerText, formatThaiDateTime, step, type DialogCategory, type DialogCtx, type DialogForm, type DialogInput, type DialogResult } from './dialog';
import type { LineEvent, LineMessage } from './line-types';
import * as M from './messages';
import { loadSession, saveSession, type BotSession } from './session-store';

type Tenant = typeof schema.tenant.$inferSelect;
type Contact = typeof schema.contact.$inferSelect;

const CASE_NO_RE = /^CS-\d{4}-\d{5}$/i;

// ── Entry point ───────────────────────────────────────────────

/** Process a webhook body. Each event runs once, keyed by webhookEventId (research §2). */
export async function handleEvents(tenant: Tenant, events: LineEvent[]) {
  for (const ev of events) {
    const [fresh] = await db.insert(schema.processedEvent)
      .values({ webhookEventId: ev.webhookEventId, tenantId: tenant.id })
      .onConflictDoNothing()
      .returning();
    if (!fresh) continue; // duplicate / redelivery already handled
    try {
      await handleEvent(tenant, ev);
    } catch (e) {
      console.error('[bot] event failed', ev.webhookEventId, e);
      if (ev.source.userId && ev.replyToken) {
        await reply(tenant.id, ev.replyToken, ev.source.userId, [M.text('ขออภัยครับ ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งครับ', M.menuActions())]).catch(() => undefined);
      }
    }
  }
}

// ── Rate limit (SPEC §8: per LINE userId) ─────────────────────

const WINDOW_MS = 10_000;
const MAX_EVENTS = Number(process.env.BOT_RATE_LIMIT ?? 20);
const hits = new Map<string, number[]>();
function rateLimited(userId: string, now = Date.now()): boolean {
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(userId, arr);
  return arr.length > MAX_EVENTS;
}

// ── Contacts ──────────────────────────────────────────────────

async function upsertContact(tenant: Tenant, lineUserId: string): Promise<Contact> {
  const [existing] = await db.select().from(schema.contact).where(and(eq(schema.contact.tenantId, tenant.id), eq(schema.contact.lineUserId, lineUserId)));
  if (existing) return existing;
  const profile = await getProfile(lineUserId).catch(() => null);
  const [created] = await db.insert(schema.contact).values({
    tenantId: tenant.id, lineUserId, displayName: profile?.displayName ?? null, isSimulated: isSimUser(lineUserId),
  }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(schema.contact).where(and(eq(schema.contact.tenantId, tenant.id), eq(schema.contact.lineUserId, lineUserId)));
  return again;
}

const isRegistered = (c: Contact) => !!c.consentAt && !!c.phone;
const nameOf = (c: Contact) => c.fullName?.split(' ')[0] ?? c.displayName ?? null;

// ── Event handling ────────────────────────────────────────────

async function handleEvent(tenant: Tenant, ev: LineEvent) {
  const userId = ev.source.userId;
  if (!userId || ev.source.type !== 'user') return; // group/room events are out of MVP scope
  if (ev.mode === 'standby') return;

  if (ev.type === 'unfollow') {
    // A blocked contact stays blocked: unfollow/follow must not clear a staff block (#14 M1).
    await db.update(schema.contact).set({ status: 'unfollowed' })
      .where(and(eq(schema.contact.tenantId, tenant.id), eq(schema.contact.lineUserId, userId), ne(schema.contact.status, 'blocked')));
    return;
  }

  let contact = await upsertContact(tenant, userId);
  if (contact.status === 'blocked') return;

  if (ev.type === 'follow') {
    if (contact.status !== 'active') {
      await db.update(schema.contact).set({ status: 'active' }).where(eq(schema.contact.id, contact.id));
      contact = { ...contact, status: 'active' };
    }
    const msgs = isRegistered(contact)
      ? [M.text(`ยินดีต้อนรับกลับครับ คุณ${nameOf(contact)}`, M.menuActions())]
      : M.welcome(tenant.oaName, registerUrl(userId), contact.displayName);
    await reply(tenant.id, ev.replyToken, userId, msgs);
    return;
  }

  if (ev.type !== 'message' && ev.type !== 'postback') return;
  if (rateLimited(userId)) return;
  void showLoading(userId);

  const out = await route(tenant, contact, ev);
  await reply(tenant.id, ev.replyToken, userId, out);
}

async function toInput(tenant: Tenant, ev: LineEvent): Promise<DialogInput | { kind: 'unsupported' }> {
  if (ev.type === 'postback' && ev.postback) return { kind: 'postback', data: ev.postback.data, params: ev.postback.params };
  const m = ev.message;
  if (!m) return { kind: 'unsupported' };
  if (m.type === 'text' && 'text' in m) return { kind: 'text', text: m.text };
  if (m.type === 'location' && 'latitude' in m) return { kind: 'location', title: m.title, address: m.address, latitude: m.latitude, longitude: m.longitude };
  if (m.type === 'image') {
    const attachmentId = await storeImage(tenant, m.id);
    return { kind: 'image', attachmentId };
  }
  return { kind: 'unsupported' };
}

/** Download now; LINE deletes content later (research §8). Simulator images are already stored. */
async function storeImage(tenant: Tenant, messageId: string): Promise<string> {
  if (messageId.startsWith('simatt:')) return messageId.slice(7);
  const { data, mimeType } = await fetchContent(messageId);
  const obj = await putObject(data, mimeType);
  const [a] = await db.insert(schema.attachment).values({ tenantId: tenant.id, storageKey: obj.key, mimeType, size: obj.size, checksum: obj.checksum }).returning();
  return a.id;
}

function toContent(input: DialogInput): MessageContent | null {
  if (input.kind === 'text') return { type: 'text', text: input.text };
  if (input.kind === 'image') return { type: 'image', attachmentId: input.attachmentId };
  if (input.kind === 'location') return { type: 'location', title: input.title, address: input.address, latitude: input.latitude, longitude: input.longitude };
  return null;
}

async function route(tenant: Tenant, contact: Contact, ev: LineEvent): Promise<LineMessage[]> {
  const input = await toInput(tenant, ev);
  if (input.kind === 'unsupported') {
    return [M.text('ขออภัยครับ ตอนนี้รองรับเฉพาะข้อความ รูปภาพ และตำแหน่งครับ')];
  }
  const now = new Date();
  const data = input.kind === 'postback' ? input.data : null;
  const txt = input.kind === 'text' ? input.text.trim() : null;
  const registered = isRegistered(contact);

  // Rich menu and menu quick replies
  const menu = data?.startsWith('menu:') ? data.slice(5)
    : txt === M.MENU_TEXT.start ? 'start'
    : txt === M.MENU_TEXT.myCases ? 'my_cases'
    : txt === M.MENU_TEXT.track ? 'track'
    : txt === M.MENU_TEXT.handoff ? 'handoff'
    : null;
  if (menu) {
    if (!registered) return M.registerFirst(registerUrl(contact.lineUserId));
    if (menu === 'my_cases' || menu === 'track') {
      const msgs = await myCasesMessages(tenant, contact);
      if (menu === 'track') msgs.push(M.text('พิมพ์เลขเคส เช่น CS-2609-00123 เพื่อดูรายละเอียดได้ครับ'));
      return msgs;
    }
    return runDialog(tenant, contact, menu === 'handoff' ? { kind: 'start_handoff' } : { kind: 'start' }, now);
  }

  if (!registered) return M.registerFirst(registerUrl(contact.lineUserId));

  if (data?.startsWith('csat:')) return csat(tenant, contact, data, now);
  if (data?.startsWith('score:')) {
    // Tapping a score on the resolved card also confirms the fix (LineTrack.png has both on one card).
    const [, caseId, n] = data.split(':');
    const r = await caseSvc.setCsat(tenant.id, caseId, contact.id, Number(n));
    if (r.already) return [M.text('ได้รับคะแนนของเคสนี้แล้วครับ ขอบคุณครับ', M.menuActions())];
    if (r.case.status === 'resolved') {
      await caseSvc.transition(tenant.id, caseId, 'closed', { type: 'contact', contactId: contact.id }, { now, reason: 'ผู้แจ้งยืนยันพร้อมให้คะแนน' });
      return [M.text(`ขอบคุณสำหรับคะแนน ${n} ครับ ปิดเคส ${r.case.caseNo} เรียบร้อยแล้ว`, M.menuActions())];
    }
    return [M.text(`ขอบคุณสำหรับคะแนน ${n} ครับ`, M.menuActions())];
  }
  if (data?.startsWith('case:') || (txt && CASE_NO_RE.test(txt))) {
    return caseDetailMessages(tenant, contact, (data ? data.slice(5) : txt!).toUpperCase());
  }
  if (data?.startsWith('fwd:') || data?.startsWith('pend:')) return forwardPicked(tenant, contact, data, now);

  const session = await loadSession(tenant.id, contact.lineUserId, now);
  if (session.dialog) return runDialog(tenant, contact, input, now, session);

  // No active draft: bind the message to a case (SPEC §3 "ติดตามและโต้ตอบหลังเปิดเคส", analysis A5)
  const content = toContent(input);
  if (!content) return [M.text('รายการนี้หมดอายุแล้วครับ เลือกเมนูเพื่อเริ่มใหม่ได้เลยครับ', M.menuActions())];
  return bindToCase(tenant, contact, content, ev.message?.id ?? null, now);
}

// ── Dialog ────────────────────────────────────────────────────

export async function loadDialogCtx(tenantId: string, contactName: string | null, now: Date, extraFormVersionId?: string | null): Promise<DialogCtx> {
  const cats = await db.select().from(schema.category).where(and(eq(schema.category.tenantId, tenantId), eq(schema.category.isActive, true)));
  const published = await db.select().from(schema.formVersion).where(and(eq(schema.formVersion.tenantId, tenantId), eq(schema.formVersion.status, 'published')));
  const versionIds = new Set(published.map((v) => v.id));
  if (extraFormVersionId) versionIds.add(extraFormVersionId);
  const allVersions = versionIds.size
    ? await db.select().from(schema.formVersion).where(inArray(schema.formVersion.id, [...versionIds]))
    : [];
  const forms = versionIds.size ? await db.select().from(schema.form).where(inArray(schema.form.id, allVersions.map((v) => v.formId))) : [];
  const questions = versionIds.size ? await db.select().from(schema.question).where(inArray(schema.question.formVersionId, [...versionIds])) : [];

  const formMap: Record<string, DialogForm> = {};
  for (const v of allVersions) {
    formMap[v.id] = {
      formVersionId: v.id,
      name: forms.find((f) => f.id === v.formId)?.name ?? '',
      version: v.version,
      questions: questions.filter((q) => q.formVersionId === v.id),
    };
  }
  const publishedByForm = new Map(published.map((v) => [v.formId, v.id]));
  const categories: DialogCategory[] = cats.map((c) => ({
    id: c.id, parentId: c.parentId, name: c.name, hint: c.hint, icon: c.icon, sortOrder: c.sortOrder,
    formVersionId: c.formId ? publishedByForm.get(c.formId) ?? null : null,
  }));
  return { categories, forms: formMap, now, contactName };
}

async function runDialog(tenant: Tenant, contact: Contact, input: DialogInput, now: Date, session?: BotSession): Promise<LineMessage[]> {
  const s = session ?? (await loadSession(tenant.id, contact.lineUserId, now));
  const ctx = await loadDialogCtx(tenant.id, nameOf(contact), now, s.dialog?.formVersionId ?? s.dialog?.saved?.formVersionId);
  const result: DialogResult = step(s.dialog ?? null, input, ctx);
  await saveSession(tenant.id, contact.lineUserId, { ...s, dialog: result.state }, now);
  if (!result.effect) return result.messages;

  if (result.effect.type === 'create_case') {
    const r = await caseSvc.createCase({ tenantId: tenant.id, contact, draft: result.effect.draft, now });
    const [team] = r.case.teamId ? await db.select().from(schema.team).where(eq(schema.team.id, r.case.teamId)) : [];
    return [...result.messages, M.caseCreated({
      caseNo: r.case.caseNo,
      priorityLabel: `${r.case.priority} ${PRIORITY[r.case.priority].label}`,
      priorityTone: PRIORITY[r.case.priority].tone,
      etaText: `${clockText(r.case.slaResponseDue!, now)} (${durationTh(r.policy.responseMinutes, r.policy.businessHoursOnly)})`,
      teamName: team?.name ?? null,
    })];
  }

  // Hand-off: a tracked case so it gets an SLA (analysis A4)
  const categoryId = result.effect.categoryId ?? tenant.handoffCategoryId;
  if (!categoryId) return [M.text('ขออภัยครับ ยังไม่ได้ตั้งค่าหมวดสำหรับติดต่อเจ้าหน้าที่', M.menuActions())];
  const catName = ctx.categories.find((c) => c.id === categoryId)?.name ?? '';
  const r = await caseSvc.createCase({
    tenantId: tenant.id, contact, now,
    draft: {
      categoryId, formVersionId: result.effect.formVersionId ?? null, answers: result.effect.answers,
      note: result.effect.note ?? `ขอคุยกับเจ้าหน้าที่ระหว่างแจ้งเรื่อง${catName ? ` "${catName}"` : ''}`,
    },
  });
  return [M.text(`ส่งเรื่องถึงเจ้าหน้าที่แล้วครับ เลขเคส ${r.case.caseNo}\nเจ้าหน้าที่จะตอบกลับในแชทนี้ครับ`, [M.pb(M.MENU_TEXT.myCases, 'menu:my_cases')])];
}

// ── Case binding ──────────────────────────────────────────────

async function bindToCase(tenant: Tenant, contact: Contact, content: MessageContent, lineMessageId: string | null, now: Date): Promise<LineMessage[]> {
  const open = await caseSvc.openCasesOf(tenant.id, contact.id);
  const pending = open.filter((c) => c.status === 'pending_customer');

  if (pending.length === 1) {
    await caseSvc.addInbound(tenant.id, pending[0], contact, content, lineMessageId, now);
    return [M.text(`ได้รับข้อมูลแล้วครับ ส่งต่อให้เจ้าหน้าที่ของเคส ${pending[0].caseNo} แล้ว`)];
  }
  const candidates = pending.length > 1 ? pending : open.filter((c) => c.status !== 'resolved');
  if (!candidates.length) {
    return [M.text('สวัสดีครับ ต้องการแจ้งปัญหาใหม่ หรือดูเคสของคุณครับ', M.menuActions())];
  }
  await saveSession(tenant.id, contact.lineUserId, { forward: { content, lineMessageId } }, now);
  const prefix = pending.length > 1 ? 'pend' : 'fwd';
  const actions = candidates.slice(0, pending.length > 1 ? 11 : 3).map((c) => M.pb(`${c.caseNo.slice(-5)} ${c.title}`.slice(0, 20), `${prefix}:${c.id}`, c.caseNo));
  const q = pending.length > 1 ? 'มีหลายเคสที่รอข้อมูลจากคุณ ข้อความนี้เป็นของเคสใดครับ' : 'ต้องการส่งข้อความนี้ถึงเจ้าหน้าที่ของเคสใดครับ';
  return [M.text(q, [...actions, M.pb(M.MENU_TEXT.start, 'menu:start'), M.pb('ไม่ต้องส่ง', 'fwd:none')])];
}

async function forwardPicked(tenant: Tenant, contact: Contact, data: string, now: Date): Promise<LineMessage[]> {
  const session = await loadSession(tenant.id, contact.lineUserId, now);
  const caseId = data.split(':')[1];
  if (caseId === 'none') {
    await saveSession(tenant.id, contact.lineUserId, { ...session, forward: null }, now);
    return [M.text('รับทราบครับ', M.menuActions())];
  }
  if (!session.forward) return [M.text('รายการนี้หมดอายุแล้วครับ กรุณาส่งข้อความอีกครั้งครับ')];
  const open = await caseSvc.openCasesOf(tenant.id, contact.id);
  const c = open.find((x) => x.id === caseId);
  if (!c) return [M.text('ไม่พบเคสนี้ หรือเคสปิดไปแล้วครับ', M.menuActions())];
  await caseSvc.addInbound(tenant.id, c, contact, session.forward.content, session.forward.lineMessageId, now);
  await saveSession(tenant.id, contact.lineUserId, { ...session, forward: null }, now);
  return [M.text(`ส่งข้อความถึงเจ้าหน้าที่ของเคส ${c.caseNo} แล้วครับ`)];
}

// ── CSAT / reopen (SPEC §3, §4) ───────────────────────────────

async function csat(tenant: Tenant, contact: Contact, data: string, now: Date): Promise<LineMessage[]> {
  const [, verdict, caseId] = data.split(':');
  const c = await caseSvc.getCase(tenant.id, caseId).catch(() => null);
  if (!c || c.contactId !== contact.id) return [M.text('ไม่พบเคสนี้ครับ')];
  const actor = { type: 'contact' as const, contactId: contact.id };

  if (verdict === 'ok') {
    if (c.status === 'resolved') await caseSvc.transition(tenant.id, c.id, 'closed', actor, { now, reason: 'ผู้แจ้งยืนยันว่าเรียบร้อย' });
    else if (c.status !== 'closed') return [M.text(`เคส ${c.caseNo} อยู่ในสถานะ "${STATUS[c.status].label}" ครับ`)];
    if (c.csatScore != null) return [M.text('ได้รับการยืนยันแล้วครับ ขอบคุณครับ')];
    return [M.askScore(c.id)];
  }

  // "ยังไม่เรียบร้อย"
  if (c.status !== 'resolved') return [M.text(`เคส ${c.caseNo} อยู่ในสถานะ "${STATUS[c.status].label}" แล้วครับ`, M.menuActions())];
  const withinWindow = c.resolvedAt && now.getTime() - c.resolvedAt.getTime() <= caseSvc.REOPEN_WINDOW_DAYS * 86_400_000;
  if (!withinWindow) return [M.text(`เคสนี้แก้ไขไปเกิน ${caseSvc.REOPEN_WINDOW_DAYS} วันแล้ว กรุณาแจ้งเคสใหม่ครับ`, M.menuActions())];
  await caseSvc.transition(tenant.id, c.id, 'reopened', actor, { now, reason: 'ผู้แจ้งแจ้งว่ายังไม่เรียบร้อย' });
  return [M.text(`เปิดเคส ${c.caseNo} อีกครั้งแล้วครับ เจ้าหน้าที่จะติดต่อกลับโดยเร็ว พิมพ์รายละเอียดเพิ่มเติมในแชทนี้ได้เลยครับ`)];
}

// ── My cases / detail ─────────────────────────────────────────

const shortDate = (d: Date) => formatThaiDateTime(d);

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** "10:58 น." today, otherwise "30 ก.ย. · 09:00 น." (Bangkok). */
export function clockText(d: Date, now: Date): string {
  const l = new Date(d.getTime() + 7 * 3600_000);
  const n = new Date(now.getTime() + 7 * 3600_000);
  const hm = `${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')} น.`;
  return l.toISOString().slice(0, 10) === n.toISOString().slice(0, 10) ? hm : `${l.getUTCDate()} ${TH_MONTHS[l.getUTCMonth()]} · ${hm}`;
}

/** "1 ชั่วโมง", "15 นาที", "4 ชั่วโมงทำการ". */
export function durationTh(min: number, businessOnly: boolean): string {
  const base = min < 60 ? `${min} นาที` : min % 60 === 0 ? `${min / 60} ชั่วโมง` : `${Math.floor(min / 60)} ชั่วโมง ${min % 60} นาที`;
  return businessOnly && min >= 60 ? `${base}ทำการ` : base;
}

async function myCasesMessages(tenant: Tenant, contact: Contact): Promise<LineMessage[]> {
  const open = await caseSvc.openCasesOf(tenant.id, contact.id);
  const users = await db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).where(eq(schema.user.tenantId, tenant.id));
  return M.myCases(open.map((c) => ({
    id: c.id, caseNo: c.caseNo, title: c.title, statusLabel: STATUS[c.status].label, statusTone: STATUS[c.status].tone,
    assigneeName: users.find((u) => u.id === c.assigneeId)?.name ?? null, updatedText: clockText(c.updatedAt, new Date()),
  })));
}

async function caseDetailMessages(tenant: Tenant, contact: Contact, caseNo: string): Promise<LineMessage[]> {
  const [c] = await db.select().from(schema.kase).where(and(eq(schema.kase.tenantId, tenant.id), eq(schema.kase.caseNo, caseNo), eq(schema.kase.contactId, contact.id)));
  if (!c) return [M.text(`ไม่พบเคส ${caseNo} ในรายการของคุณครับ`, M.menuActions())];
  const answers = await db.select().from(schema.caseAnswer).where(eq(schema.caseAnswer.caseId, c.id)).orderBy(schema.caseAnswer.order);
  const [cat] = await db.select().from(schema.category).where(eq(schema.category.id, c.categoryId));
  const [parent] = cat?.parentId ? await db.select().from(schema.category).where(eq(schema.category.id, cat.parentId)) : [];
  const [assignee] = c.assigneeId ? await db.select().from(schema.user).where(eq(schema.user.id, c.assigneeId)) : [];
  return [M.caseDetail({
    id: c.id, caseNo: c.caseNo, title: c.title, statusLabel: STATUS[c.status].label, statusTone: STATUS[c.status].tone, assigneeName: assignee?.name ?? null,
    updatedText: shortDate(c.updatedAt), createdText: shortDate(c.createdAt),
    categoryPath: [parent?.name, cat?.name].filter(Boolean).join(' › '),
    answers: answers.map((a) => ({ label: a.labelSnapshot, value: answerText(a.value) })),
  })];
}
