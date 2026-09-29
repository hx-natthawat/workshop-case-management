/**
 * Stage 8 verification: edge cases from docs/po/03-analysis.md §3 that the main flow test does not cover.
 * Each test uses its own simulated reporter so they stay independent.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/server/db';
import { handleEvents } from '@/server/bot/handler';
import type { LineEvent, LineMessage } from '@/server/bot/line-types';
import { registerContact } from '@/server/bot/registration';
import * as caseSvc from '@/server/case/service';
import type { SessionUser } from '@/server/lib/auth';
import { defaultTenant } from '@/server/lib/tenant';
import { caseDetail, listCases } from '@/server/queries/cases';

type Tenant = typeof schema.tenant.$inferSelect;
type Contact = typeof schema.contact.$inferSelect;
let tenant: Tenant;
let sup: SessionUser;

const ev = (userId: string, partial: Partial<LineEvent>): LineEvent =>
  ({ type: 'message', webhookEventId: randomUUID(), timestamp: Date.now(), replyToken: 'sim', source: { type: 'user', userId }, ...partial }) as LineEvent;
const say = (userId: string, text: string) => ev(userId, { message: { type: 'text', id: randomUUID(), text } });
const tap = (userId: string, data: string) => ev(userId, { type: 'postback', postback: { data } });
const send = (...e: LineEvent[]) => handleEvents(tenant, e);
const actor = () => ({ type: 'user' as const, user: sup });

const cursors = new Map<string, number>();
async function botSaid(userId: string): Promise<string> {
  const rows = await db.select().from(schema.simMessage)
    .where(and(eq(schema.simMessage.lineUserId, userId), eq(schema.simMessage.direction, 'bot'), gt(schema.simMessage.id, cursors.get(userId) ?? 0)))
    .orderBy(asc(schema.simMessage.id));
  if (rows.length) cursors.set(userId, rows[rows.length - 1].id);
  return JSON.stringify(rows.map((r) => r.payload as LineMessage));
}

async function reporter(): Promise<{ id: string; contact: Contact }> {
  const id = `Usim${randomUUID().slice(0, 10)}`;
  const contact = await registerContact(tenant, id, { fullName: 'ทดสอบ ขอบเขต', phone: '0811111111', consent: true, consentVersion: tenant.pdpaVersion });
  await botSaid(id);
  return { id, contact };
}

async function caseFor(contact: Contact, note: string) {
  const [cat] = await db.select().from(schema.category).where(eq(schema.category.name, 'ซอฟต์แวร์'));
  const r = await caseSvc.createCase({ tenantId: tenant.id, contact, draft: { categoryId: cat.id, formVersionId: null, answers: [], note } });
  await caseSvc.assign(tenant.id, r.case.id, sup.id, actor());
  await caseSvc.transition(tenant.id, r.case.id, 'in_progress', actor());
  return r.case;
}

beforeAll(async () => {
  tenant = await defaultTenant();
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, 'thanapol@example.com'));
  sup = { id: u.id, tenantId: u.tenantId, role: u.role, name: u.name, email: u.email, teamId: u.teamId, mfaEnabled: false };
});

describe('edge cases (analysis §3)', () => {
  it('an expired draft (30 min) is not resumed', async () => {
    const r = await reporter();
    await send(tap(r.id, 'menu:start'));
    await db.update(schema.dialogSession).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.dialogSession.lineUserId, r.id));
    await botSaid(r.id);
    await send(tap(r.id, 'menu:start'));
    const out = await botSaid(r.id);
    expect(out).not.toContain('เรื่องที่แจ้งค้างไว้');
    expect(out).toContain('เลือกหัวข้อที่ต้องการแจ้ง');
  });

  it('asks which case when several are waiting for the reporter', async () => {
    const r = await reporter();
    const a = await caseFor(r.contact, 'เคส A');
    const b = await caseFor(r.contact, 'เคส B');
    await caseSvc.transition(tenant.id, a.id, 'pending_customer', actor());
    await caseSvc.transition(tenant.id, b.id, 'pending_customer', actor());
    await botSaid(r.id);
    await send(say(r.id, 'ส่งข้อมูลเพิ่มครับ'));
    expect(await botSaid(r.id)).toContain('มีหลายเคสที่รอข้อมูลจากคุณ');
    await send(tap(r.id, `pend:${b.id}`));
    expect(await botSaid(r.id)).toContain(b.caseNo);
    expect((await caseSvc.getCase(tenant.id, b.id)).status).toBe('in_progress');
    expect((await caseSvc.getCase(tenant.id, a.id)).status).toBe('pending_customer');
  });

  it('asks which case when several cases are open, and labels agent replies with the case number (D-016, D-017)', async () => {
    const r = await reporter();
    const a = await caseFor(r.contact, 'เคสแรก');
    const b = await caseFor(r.contact, 'เคสที่สอง');
    await botSaid(r.id);
    await send(say(r.id, 'สอบถามความคืบหน้าครับ'));
    expect(await botSaid(r.id)).toContain('ต้องการส่งข้อความนี้ถึงเจ้าหน้าที่ของเคสใด');
    await send(tap(r.id, `fwd:${a.id}`));
    expect(await botSaid(r.id)).toContain(`ส่งข้อความถึงเจ้าหน้าที่ของเคส ${a.caseNo} แล้ว`);
    await caseSvc.postAgentMessage(tenant.id, b.id, actor(), { mode: 'line', text: 'กำลังตรวจสอบครับ' });
    expect(await botSaid(r.id)).toContain(`เคส ${b.caseNo}\\nกำลังตรวจสอบครับ`);
  });

  it('skips Push and logs it when the reporter has unfollowed the OA', async () => {
    const r = await reporter();
    const c = await caseFor(r.contact, 'เคสผู้ใช้เลิกติดตาม');
    await send(ev(r.id, { type: 'unfollow' }));
    await botSaid(r.id);
    await caseSvc.postAgentMessage(tenant.id, c.id, actor(), { mode: 'line', text: 'ติดต่อกลับครับ' });
    expect(await botSaid(r.id)).toBe('[]');
    const events = await db.select().from(schema.caseEvent).where(and(eq(schema.caseEvent.caseId, c.id), eq(schema.caseEvent.eventType, 'delivery_skipped')));
    expect(events.length).toBe(1);
  });

  it('keeps the form version a conversation started with after a new version is published', async () => {
    const r = await reporter();
    const cats = await db.select().from(schema.category);
    const it_ = cats.find((c) => c.name === 'ระบบ IT')!;
    const login = cats.find((c) => c.name === 'เข้าระบบไม่ได้')!;
    await send(tap(r.id, 'menu:start'), tap(r.id, `cat:${it_.id}`), tap(r.id, `cat:${login.id}`));
    const [session] = await db.select().from(schema.dialogSession).where(eq(schema.dialogSession.lineUserId, r.id));
    const oldVersion = (session.state as { dialog: { formVersionId: string } }).dialog.formVersionId;

    // Publish a new version with different questions
    const [old] = await db.select().from(schema.formVersion).where(eq(schema.formVersion.id, oldVersion));
    const [nv] = await db.insert(schema.formVersion).values({ tenantId: tenant.id, formId: old.formId, version: old.version + 100, status: 'published', publishedAt: new Date() }).returning();
    await db.update(schema.formVersion).set({ status: 'archived' }).where(eq(schema.formVersion.id, old.id));
    await db.insert(schema.question).values({ tenantId: tenant.id, formVersionId: nv.id, key: 'only_q', order: 1, type: 'long_text', label: 'คำถามใหม่เท่านั้น', required: true });

    await send(tap(r.id, 'ans:0'));
    const out = await botSaid(r.id);
    expect(out).toContain('ข้อความ error ที่พบ'); // still on the old version's question 2 (skips show_if)
    expect(out).not.toContain('คำถามใหม่เท่านั้น');

    // Restore: re-publish the old version so other tests see the seed form
    await db.update(schema.formVersion).set({ status: 'archived' }).where(eq(schema.formVersion.id, nv.id));
    await db.update(schema.formVersion).set({ status: 'published' }).where(eq(schema.formVersion.id, old.id));
    await send(say(r.id, 'ยกเลิก'));
  });

  it('refuses to reopen after 7 days', async () => {
    const r = await reporter();
    const c = await caseFor(r.contact, 'เคสเก่า');
    await caseSvc.transition(tenant.id, c.id, 'resolved', actor(), { now: new Date(Date.now() - 8 * 86_400_000) });
    await botSaid(r.id);
    await send(tap(r.id, `csat:notyet:${c.id}`));
    expect(await botSaid(r.id)).toContain('เกิน 7 วัน');
    expect((await caseSvc.getCase(tenant.id, c.id)).status).toBe('resolved');
  });

  it('never sends internal notes to LINE', async () => {
    const r = await reporter();
    const c = await caseFor(r.contact, 'เคสบันทึกภายใน');
    await botSaid(r.id);
    await caseSvc.postAgentMessage(tenant.id, c.id, actor(), { mode: 'internal', text: 'ข้อมูลภายในห้ามส่ง' });
    expect(await botSaid(r.id)).toBe('[]');
  });

  it('tapping a score on the resolved card records CSAT and closes the case', async () => {
    const r = await reporter();
    const c = await caseFor(r.contact, 'เคสให้คะแนน');
    await caseSvc.transition(tenant.id, c.id, 'resolved', actor());
    expect(await botSaid(r.id)).toContain('ให้คะแนนความพึงพอใจ (1 = น้อยที่สุด)');
    await send(tap(r.id, `score:${c.id}:4`));
    const after = await caseSvc.getCase(tenant.id, c.id);
    expect(after.csatScore).toBe(4);
    expect(after.status).toBe('closed');
  });

  it('does not let a reporter act on someone else’s case', async () => {
    const owner = await reporter();
    const other = await reporter();
    const c = await caseFor(owner.contact, 'เคสของคนอื่น');
    await caseSvc.transition(tenant.id, c.id, 'resolved', actor());
    await send(tap(other.id, `csat:ok:${c.id}`), tap(other.id, `score:${c.id}:1`));
    const after = await caseSvc.getCase(tenant.id, c.id);
    expect(after.status).toBe('resolved');
    expect(after.csatScore).toBeNull();
  });
});

describe('security regressions (#14)', () => {
  it('M1: unfollow + follow does not lift a block', async () => {
    const r = await reporter();
    await db.update(schema.contact).set({ status: 'blocked' }).where(eq(schema.contact.id, r.contact.id));
    await send(ev(r.id, { type: 'unfollow' }), ev(r.id, { type: 'follow' }));
    const [c] = await db.select().from(schema.contact).where(eq(schema.contact.id, r.contact.id));
    expect(c.status).toBe('blocked');
  });

  it('M2: re-registering does not lift a block', async () => {
    const r = await reporter();
    await db.update(schema.contact).set({ status: 'blocked' }).where(eq(schema.contact.id, r.contact.id));
    await expect(registerContact(tenant, r.id, { fullName: 'ลงทะเบียนซ้ำ', phone: '0822222222', consent: true, consentVersion: tenant.pdpaVersion })).rejects.toThrow(/ระงับ/);
    const [c] = await db.select().from(schema.contact).where(eq(schema.contact.id, r.contact.id));
    expect(c.status).toBe('blocked');
  });

  it('L1: related cases only include cases the agent may see', async () => {
    const r = await reporter();
    const own = await caseFor(r.contact, 'เคสของ agent');
    const other = await caseFor(r.contact, 'เคสของหัวหน้า');
    const [a] = await db.select().from(schema.user).where(eq(schema.user.email, 'kamonchanok@example.com'));
    const agent: SessionUser = { id: a.id, tenantId: a.tenantId, role: a.role, name: a.name, email: a.email, teamId: a.teamId, mfaEnabled: false };
    await caseSvc.assign(tenant.id, own.id, agent.id, actor());
    const d = await caseDetail(agent, own.id);
    expect(d.related.map((x) => x.id)).not.toContain(other.id);
  });

  it('L4: malformed ids give 404, not a database error', async () => {
    await expect(caseSvc.getCase(tenant.id, 'not-a-uuid')).rejects.toMatchObject({ status: 404 });
    await expect(caseDetail(sup, "1' or 1=1")).rejects.toMatchObject({ status: 404 });
    const res = await listCases(sup, { tab: 'all', categoryId: 'xyz', assigneeId: '123' });
    expect(res.total).toBeGreaterThan(0);
  });

  it('L6: an agent without a team does not see other teams\' unassigned cases', async () => {
    const r = await reporter();
    const c = await caseFor(r.contact, 'เคสทีมอื่น');
    await db.update(schema.kase).set({ assigneeId: null }).where(eq(schema.kase.id, c.id));
    const loner: SessionUser = { id: randomUUID(), tenantId: tenant.id, role: 'agent', name: 'ไม่มีทีม', email: 'x@example.com', teamId: null, mfaEnabled: false };
    const res = await listCases(loner, { tab: 'unassigned', status: 'all' });
    expect(res.items.map((x) => x.id)).not.toContain(c.id);
  });
});
