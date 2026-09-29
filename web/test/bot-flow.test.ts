/**
 * Integration: LINE webhook events replayed through the real handler, Case Service and Postgres.
 * Uses simulator users (Usim…), so outbound messages land in sim_message instead of the LINE API.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/server/db';
import { handleEvents } from '@/server/bot/handler';
import type { LineEvent, LineMessage } from '@/server/bot/line-types';
import { registerContact } from '@/server/bot/registration';
import { sign, verifySignature } from '@/server/bot/signature';
import * as caseSvc from '@/server/case/service';
import type { SessionUser } from '@/server/lib/auth';
import { defaultTenant } from '@/server/lib/tenant';
import { slaSweep } from '@/server/worker/sla-sweep';

type Tenant = typeof schema.tenant.$inferSelect;
let tenant: Tenant;
let supervisor: SessionUser;
let agent: SessionUser;

const USER = `Usim${randomUUID().slice(0, 8)}`;
let lastSimId = 0;

function ev(partial: Partial<LineEvent>, userId = USER): LineEvent {
  return { type: 'message', webhookEventId: randomUUID(), timestamp: Date.now(), replyToken: 'sim', source: { type: 'user', userId }, ...partial } as LineEvent;
}
const say = (text: string, userId = USER) => ev({ type: 'message', message: { type: 'text', id: randomUUID(), text } }, userId);
const tap = (data: string, params?: Record<string, string>, userId = USER) => ev({ type: 'postback', postback: { data, params } }, userId);

/** Messages the bot sent since the previous call. */
async function botSaid(userId = USER): Promise<LineMessage[]> {
  const rows = await db.select().from(schema.simMessage)
    .where(and(eq(schema.simMessage.lineUserId, userId), eq(schema.simMessage.direction, 'bot'), gt(schema.simMessage.id, lastSimId)))
    .orderBy(asc(schema.simMessage.id));
  if (rows.length) lastSimId = rows[rows.length - 1].id;
  return rows.map((r) => r.payload as LineMessage);
}
const flat = (msgs: LineMessage[]) => JSON.stringify(msgs);

async function send(...events: LineEvent[]) {
  await handleEvents(tenant, events);
}

const asActor = (u: SessionUser) => ({ type: 'user' as const, user: u });

async function staff(email: string): Promise<SessionUser> {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  return { id: u.id, tenantId: u.tenantId, role: u.role, name: u.name, email: u.email, teamId: u.teamId };
}

async function latestCase() {
  const [contact] = await db.select().from(schema.contact).where(eq(schema.contact.lineUserId, USER));
  const cases = await caseSvc.openCasesOf(tenant.id, contact.id);
  return cases[0];
}

beforeAll(async () => {
  tenant = await defaultTenant();
  supervisor = await staff('thanapol@example.com');
  agent = await staff('kamonchanok@example.com');
});

describe('webhook signature', () => {
  it('accepts the LINE HMAC-SHA256 signature and rejects others', () => {
    const body = JSON.stringify({ events: [] });
    expect(verifySignature(body, sign(body, 'secret'), 'secret')).toBe(true);
    expect(verifySignature(body, sign(body, 'other'), 'secret')).toBe(false);
    expect(verifySignature(body, null, 'secret')).toBe(false);
  });
});

describe('registration (R1)', () => {
  it('greets a new follower with a register button', async () => {
    await send(ev({ type: 'follow' }));
    const out = flat(await botSaid());
    expect(out).toContain('ลงทะเบียน');
    expect(out).toContain(`/liff/register?sim=${USER}`);
  });

  it('blocks reporting before registration', async () => {
    await send(say('แจ้งปัญหาใหม่'));
    expect(flat(await botSaid())).toContain('กรุณาลงทะเบียนก่อนใช้งาน');
  });

  it('rejects registration without consent', async () => {
    await expect(registerContact(tenant, USER, { fullName: 'ทดสอบ ระบบ', phone: '0812345678', consent: false as unknown as true, consentVersion: tenant.pdpaVersion })).rejects.toThrow();
  });

  it('stores consent version and time', async () => {
    const c = await registerContact(tenant, USER, { fullName: 'ทดสอบ ระบบ', phone: '081-234-5678', customerRef: 'C-1', consent: true, consentVersion: tenant.pdpaVersion });
    expect(c.consentVersion).toBe(tenant.pdpaVersion);
    expect(c.consentAt).toBeInstanceOf(Date);
    expect(c.phone).toBe('0812345678');
    expect(flat(await botSaid())).toContain('ลงทะเบียนเรียบร้อยแล้ว');
  });
});

describe('reporting a case (R2, R3)', () => {
  it('walks the ERP login form and creates a case with a raised priority and round-robin assignee', async () => {
    const cats = await db.select().from(schema.category).where(eq(schema.category.tenantId, tenant.id));
    const it_ = cats.find((c) => c.name === 'ระบบ IT')!;
    const login = cats.find((c) => c.name === 'เข้าระบบไม่ได้')!;

    await send(tap('menu:start'));
    expect(flat(await botSaid())).toContain('เลือกหัวข้อที่ต้องการแจ้ง');
    await send(tap(`cat:${it_.id}`), tap(`cat:${login.id}`));
    expect(flat(await botSaid())).toContain('ข้อ 1 จาก 5');

    await send(tap('ans:0'), say('Account is locked'), tap('ans:1'), tap('cmd:now'), tap('cmd:skip'));
    expect(flat(await botSaid())).toContain('ตรวจสอบข้อมูลก่อนส่ง');

    await send(tap('sum:confirm'));
    const out = flat(await botSaid());
    expect(out).toMatch(/รับเรื่องเรียบร้อย เลขเคส CS-\d{4}-\d{5}/);

    const c = await latestCase();
    expect(c.priority).toBe('P2'); // P3 raised one level by "กระทบงานของทีม"
    expect(c.status).toBe('assigned');
    expect(c.assigneeId).toBeTruthy();
    expect(c.slaResponseDue).toBeInstanceOf(Date);
    const answers = await db.select().from(schema.caseAnswer).where(eq(schema.caseAnswer.caseId, c.id));
    expect(answers.map((a) => a.questionKey).sort()).toEqual(['error_msg', 'impact', 'screenshot', 'started_at', 'system_name']);
    expect(c.formVersionId).toBeTruthy();
  });

  it('processes a redelivered event only once', async () => {
    const e = say('แจ้งปัญหาใหม่');
    await send(e, e);
    await send(e);
    expect((await botSaid()).length).toBe(2); // greeting + carousel, once
    await send(say('ยกเลิก'));
    await botSaid();
  });
});

describe('agent handling and reporter follow-up (A2, A3, R5, R6)', () => {
  it('rejects transitions outside the state machine', async () => {
    const c = await latestCase();
    await expect(caseSvc.transition(tenant.id, c.id, 'resolved', asActor(supervisor))).rejects.toThrow(/เปลี่ยนสถานะ/);
  });

  it('blocks agents from cases assigned to someone else', async () => {
    const c = await latestCase();
    const other = c.assigneeId === agent.id ? supervisor : agent;
    if (other.role !== 'agent') return; // round-robin picked the agent; covered by canView unit
    await expect(caseSvc.postAgentMessage(tenant.id, c.id, asActor(other), { mode: 'line', text: 'hi' })).rejects.toThrow();
  });

  it('asks for info, binds the reporter reply and resumes the SLA clock', async () => {
    let c = await latestCase();
    await caseSvc.assign(tenant.id, c.id, supervisor.id, asActor(supervisor));
    await caseSvc.postAgentMessage(tenant.id, c.id, asActor(supervisor), { mode: 'line', text: 'รับเรื่องแล้วครับ', afterStatus: 'in_progress' });
    await caseSvc.postAgentMessage(tenant.id, c.id, asActor(supervisor), { mode: 'line', text: 'ขอภาพหน้าจอเพิ่มครับ', afterStatus: 'pending_customer' });
    const out = flat(await botSaid());
    expect(out).toContain('รับเรื่องแล้วครับ');
    expect(out).toContain('ขอภาพหน้าจอเพิ่มครับ');

    c = await latestCase();
    expect(c.status).toBe('pending_customer');
    expect(c.slaPausedAt).toBeInstanceOf(Date);
    expect(c.firstResponseAt).toBeInstanceOf(Date);

    await send(say('ลองแล้วยังเข้าไม่ได้ครับ'));
    expect(flat(await botSaid())).toContain('ส่งต่อให้เจ้าหน้าที่ของเคส');
    c = await latestCase();
    expect(c.status).toBe('in_progress');
    expect(c.slaPausedAt).toBeNull();
    const inbound = await db.select().from(schema.caseMessage).where(and(eq(schema.caseMessage.caseId, c.id), eq(schema.caseMessage.direction, 'in')));
    expect(inbound.some((m) => m.content.type === 'text' && m.content.text === 'ลองแล้วยังเข้าไม่ได้ครับ')).toBe(true);
  });

  it('reopens when the reporter says it is not fixed', async () => {
    const c = await latestCase();
    await caseSvc.postAgentMessage(tenant.id, c.id, asActor(supervisor), { mode: 'line', text: 'แก้ไขแล้วครับ', afterStatus: 'resolved' });
    expect(flat(await botSaid())).toContain('ปัญหาได้รับการแก้ไขเรียบร้อยหรือไม่');
    await send(tap(`csat:notyet:${c.id}`));
    expect(flat(await botSaid())).toContain('อีกครั้งแล้ว');
    const r = await caseSvc.getCase(tenant.id, c.id);
    expect(r.status).toBe('reopened');
    expect(r.reopenCount).toBe(1);
  });

  it('closes on confirmation and records the CSAT score', async () => {
    const c = await latestCase();
    await caseSvc.transition(tenant.id, c.id, 'in_progress', asActor(supervisor));
    await caseSvc.transition(tenant.id, c.id, 'resolved', asActor(supervisor));
    await botSaid();
    await send(tap(`csat:ok:${c.id}`));
    expect(flat(await botSaid())).toContain('ให้คะแนนความพึงพอใจ');
    await send(tap(`score:${c.id}:5`));
    const r = await caseSvc.getCase(tenant.id, c.id);
    expect(r.status).toBe('closed');
    expect(r.csatScore).toBe(5);
  });
});

describe('hand-off and my cases', () => {
  it('turns "ติดต่อเจ้าหน้าที่" into a tracked case', async () => {
    await send(tap('menu:handoff'), say('ขอสอบถามเรื่องใบแจ้งหนี้'));
    expect(flat(await botSaid())).toContain('ส่งเรื่องถึงเจ้าหน้าที่แล้วครับ');
    const c = await latestCase();
    expect(c.title).toBe('ขอสอบถามเรื่องใบแจ้งหนี้');
  });

  it('lists open cases and shows detail only for the reporter’s own case', async () => {
    const c = await latestCase();
    await send(tap('menu:my_cases'));
    expect(flat(await botSaid())).toContain(c.caseNo);
    await send(say(c.caseNo));
    expect(flat(await botSaid())).toContain(`รายละเอียดเคส ${c.caseNo}`);
    await send(say('CS-0101-99999'));
    expect(flat(await botSaid())).toContain('ไม่พบเคส');
  });

  it('sends free text straight to the only open case (D-017)', async () => {
    const c = await latestCase();
    await send(say('มีอัปเดตไหมครับ'));
    expect(flat(await botSaid())).toContain(`ส่งข้อความถึงเจ้าหน้าที่ของเคส ${c.caseNo} แล้ว`);
    const inbound = await db.select().from(schema.caseMessage).where(and(eq(schema.caseMessage.caseId, c.id), eq(schema.caseMessage.direction, 'in')));
    expect(inbound.some((m) => m.content.type === 'text' && m.content.text === 'มีอัปเดตไหมครับ')).toBe(true);
  });
});

describe('SLA worker (S2)', () => {
  it('flags a breach and notifies supervisors, then auto-closes a silent resolved case', async () => {
    const c = await latestCase();
    // A week back always contains office time, whatever hour the test runs (D-011)
    await db.update(schema.kase).set({ slaResponseDue: new Date(Date.now() - 7 * 86_400_000), firstResponseAt: null }).where(eq(schema.kase.id, c.id));
    await slaSweep();
    const after = await caseSvc.getCase(tenant.id, c.id);
    expect(after.slaBreachedResponse).toBe(true);
    const notes = await db.select().from(schema.notification).where(and(eq(schema.notification.caseId, c.id), eq(schema.notification.type, 'sla_breached')));
    expect(notes.length).toBeGreaterThan(0);

    await caseSvc.assign(tenant.id, c.id, supervisor.id, asActor(supervisor));
    await caseSvc.transition(tenant.id, c.id, 'in_progress', asActor(supervisor));
    await caseSvc.transition(tenant.id, c.id, 'resolved', asActor(supervisor), { now: new Date(Date.now() - 4 * 86_400_000) });
    await slaSweep();
    expect((await caseSvc.getCase(tenant.id, c.id)).status).toBe('closed');
    expect(flat(await botSaid())).toContain('ปิดอัตโนมัติ');
  });
});
