/**
 * #19 PDPA data-subject requests and retention (SPEC §8, analysis G2 + G3).
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/server/db';
import { ERASED_TEXT } from '@/server/admin/anonymise';
import { createDsr, eraseContact, exportContact, listDsr, rectifyContact, setRestricted, updateDsr } from '@/server/admin/dsr';
import { setContactStatus } from '@/server/admin/contacts';
import { getSettings, updateSettings } from '@/server/admin/settings';
import { registerContact } from '@/server/bot/registration';
import * as caseSvc from '@/server/case/service';
import type { SessionUser } from '@/server/lib/auth';
import { getObject, putObject } from '@/server/lib/storage';
import { defaultTenant } from '@/server/lib/tenant';
import { retentionSweep } from '@/server/worker/retention-sweep';

type Tenant = typeof schema.tenant.$inferSelect;
type Contact = typeof schema.contact.$inferSelect;
let tenant: Tenant;
let sup: SessionUser;
let admin: SessionUser;
const actor = () => ({ type: 'user' as const, user: sup });
const DAY = 86_400_000;

const asSession = (u: typeof schema.user.$inferSelect): SessionUser =>
  ({ id: u.id, tenantId: u.tenantId, role: u.role, name: u.name, email: u.email, teamId: u.teamId, mfaEnabled: !!u.mfaEnabledAt });

async function reporter(): Promise<Contact> {
  return registerContact(tenant, `Usim${randomUUID().slice(0, 10)}`, {
    fullName: 'สมหญิง ข้อมูลส่วนตัว', phone: '0812345678', customerRef: 'EMP-7788', orgUnit: 'ฝ่ายบัญชี', consent: true, consentVersion: tenant.pdpaVersion,
  });
}

/** An in-progress case with one text answer, one inbound image message (with a stored file) and one outbound reply. */
async function caseWithData(contact: Contact) {
  const [cat] = await db.select().from(schema.category).where(eq(schema.category.name, 'ซอฟต์แวร์'));
  const r = await caseSvc.createCase({
    tenantId: tenant.id, contact,
    draft: { categoryId: cat.id, formVersionId: null, answers: [{ key: 'detail', label: 'รายละเอียด', order: 1, value: { kind: 'text', text: 'เครื่องของสมหญิงเปิดไม่ติด' } }], note: 'เครื่องของสมหญิงเปิดไม่ติด' },
  } as Parameters<typeof caseSvc.createCase>[0]);
  const k = r.case;
  await caseSvc.assign(tenant.id, k.id, sup.id, actor());
  await caseSvc.transition(tenant.id, k.id, 'in_progress', actor());
  const file = await putObject(Buffer.from(`image-${randomUUID()}`), 'image/png');
  const [att] = await db.insert(schema.attachment).values({ tenantId: tenant.id, caseId: k.id, storageKey: file.key, mimeType: 'image/png', size: file.size, checksum: file.checksum }).returning();
  const [msg] = await db.insert(schema.caseMessage).values({ tenantId: tenant.id, caseId: k.id, direction: 'in', senderType: 'contact', senderId: contact.id, content: { type: 'image', attachmentId: att.id } }).returning();
  await db.update(schema.attachment).set({ messageId: msg.id }).where(eq(schema.attachment.id, att.id));
  await db.insert(schema.caseMessage).values({ tenantId: tenant.id, caseId: k.id, direction: 'out', senderType: 'agent', senderId: sup.id, content: { type: 'text', text: 'คุณสมหญิงลองกดปุ่มเปิดค้างไว้ครับ' } });
  return { case: k, attachment: att };
}

async function closeCase(caseId: string) {
  await caseSvc.transition(tenant.id, caseId, 'resolved', actor());
  await caseSvc.transition(tenant.id, caseId, 'closed', actor());
}

const auditOf = (entityId: string) => db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenant.id), eq(schema.auditLog.entityId, entityId)));

beforeAll(async () => {
  tenant = await defaultTenant();
  const [s] = await db.select().from(schema.user).where(eq(schema.user.email, 'thanapol@example.com'));
  const [a] = await db.select().from(schema.user).where(eq(schema.user.email, 'admin@example.com'));
  sup = asSession(s);
  admin = asSession(a);
});

describe('PDPA data-subject requests (#19)', () => {
  it('export contains the contact, cases, answers, messages and attachment list, and is audit-logged', async () => {
    const c = await reporter();
    const { case: k, attachment } = await caseWithData(c);
    const out = await exportContact(sup, c.id, '10.0.0.1');
    expect(out.contact).toMatchObject({ id: c.id, fullName: 'สมหญิง ข้อมูลส่วนตัว', phone: '0812345678', customerRef: 'EMP-7788', orgUnit: 'ฝ่ายบัญชี', lineUserId: c.lineUserId });
    expect(out.cases).toHaveLength(1);
    const x = out.cases[0];
    expect(x.caseNo).toBe(k.caseNo);
    expect(x.answers).toEqual([{ question: 'รายละเอียด', value: { kind: 'text', text: 'เครื่องของสมหญิงเปิดไม่ติด' } }]);
    expect(x.messages.map((m) => m.direction)).toEqual(expect.arrayContaining(['in', 'out']));
    expect(JSON.stringify(x.messages)).toContain('คุณสมหญิงลองกดปุ่ม');
    expect(x.attachments).toEqual([expect.objectContaining({ id: attachment.id, mimeType: 'image/png', sha256: attachment.checksum })]);
    const logs = await auditOf(c.id);
    expect(logs.find((l) => l.action === 'contact.exported')).toMatchObject({ actorId: sup.id, ip: '10.0.0.1' });
  });

  it('erase is refused while the contact has an open case', async () => {
    const c = await reporter();
    await caseWithData(c);
    await expect(eraseContact(sup, c.id, null)).rejects.toMatchObject({ status: 409 });
    const [still] = await db.select().from(schema.contact).where(eq(schema.contact.id, c.id));
    expect(still.fullName).toBe('สมหญิง ข้อมูลส่วนตัว');
    expect(still.anonymisedAt).toBeNull();
  });

  it('erase anonymises the contact and all cases, deletes files, keeps case metadata and writes audit rows', async () => {
    const c = await reporter();
    const { case: k, attachment } = await caseWithData(c);
    await closeCase(k.id);
    await getObject(attachment.storageKey); // exists before

    const r = await eraseContact(sup, c.id, null);
    expect(r).toMatchObject({ cases: 1, files: 1, contact: true });

    const [after] = await db.select().from(schema.contact).where(eq(schema.contact.id, c.id));
    expect(after).toMatchObject({ fullName: null, phone: null, customerRef: null, orgUnit: null, displayName: null, status: 'blocked' });
    expect(after.lineUserId).not.toBe(c.lineUserId);
    expect(after.anonymisedAt).not.toBeNull();

    const [kk] = await db.select().from(schema.kase).where(eq(schema.kase.id, k.id));
    expect(kk.anonymisedAt).not.toBeNull();
    expect(kk.title).not.toContain('สมหญิง');
    expect(kk).toMatchObject({ status: 'closed', priority: k.priority, caseNo: k.caseNo, categoryId: k.categoryId });

    const answers = await db.select().from(schema.caseAnswer).where(eq(schema.caseAnswer.caseId, k.id));
    expect(answers.every((a) => JSON.stringify(a.value) === JSON.stringify({ kind: 'text', text: ERASED_TEXT }))).toBe(true);
    const msgs = await db.select().from(schema.caseMessage).where(eq(schema.caseMessage.caseId, k.id));
    expect(msgs.length).toBeGreaterThan(0);
    expect(JSON.stringify(msgs.map((m) => m.content))).not.toMatch(/สมหญิง|attachmentId/);

    expect(await db.select().from(schema.attachment).where(eq(schema.attachment.id, attachment.id))).toHaveLength(0);
    await expect(getObject(attachment.storageKey)).rejects.toThrow();

    const actions = [...await auditOf(c.id), ...await auditOf(k.id)].map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['contact.erased', 'contact.anonymised', 'case.anonymised']));
    const all = await db.select().from(schema.auditLog).where(inArray(schema.auditLog.entityId, [c.id, k.id]));
    expect(JSON.stringify(all.map((l) => l.diff))).not.toMatch(/สมหญิง|0812345678/);

    // Further actions on an erased contact are refused
    await expect(rectifyContact(sup, c.id, { fullName: 'x' }, null)).rejects.toMatchObject({ status: 409 });
  });

  it('rectify changes only the given fields and audits field names, not values', async () => {
    const c = await reporter();
    const r = await rectifyContact(sup, c.id, { fullName: 'สมหญิง แก้ไขแล้ว', orgUnit: null, customerRef: 'EMP-7788' }, null);
    expect(r.changed.sort()).toEqual(['fullName', 'orgUnit']);
    const [after] = await db.select().from(schema.contact).where(eq(schema.contact.id, c.id));
    expect(after).toMatchObject({ fullName: 'สมหญิง แก้ไขแล้ว', orgUnit: null, phone: '0812345678' });
    const [log] = (await auditOf(c.id)).filter((l) => l.action === 'contact.rectified');
    expect(log.diff).toEqual({ fields: ['fullName', 'orgUnit'] });
  });

  it('restrict blocks the contact with a flag; a plain unblock is refused until the restriction is lifted', async () => {
    const c = await reporter();
    await setRestricted(sup, c.id, true, null);
    let [x] = await db.select().from(schema.contact).where(eq(schema.contact.id, c.id));
    expect(x.status).toBe('blocked');
    expect(x.restrictedAt).not.toBeNull();
    await expect(setContactStatus(sup, c.id, 'active', null)).rejects.toMatchObject({ status: 409 });
    await setRestricted(sup, c.id, false, null);
    [x] = await db.select().from(schema.contact).where(eq(schema.contact.id, c.id));
    expect(x).toMatchObject({ status: 'active', restrictedAt: null });
    const actions = (await auditOf(c.id)).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['contact.restricted', 'contact.restriction_lifted']));
  });

  it('logs a request with a 30-day due date, flags it overdue, and audits status changes', async () => {
    const c = await reporter();
    const received = new Date(Date.now() - 31 * DAY);
    const r = await createDsr(sup, c.id, { type: 'access', receivedAt: received.toISOString(), note: 'ขอทางอีเมล' }, null);
    expect(r.dueAt.getTime()).toBe(received.getTime() + 30 * DAY);
    await expect(createDsr(sup, c.id, { type: 'erase', receivedAt: new Date(Date.now() + 5 * DAY).toISOString() }, null)).rejects.toMatchObject({ status: 400 });
    let [row] = await listDsr(tenant.id, c.id);
    expect(row).toMatchObject({ type: 'access', status: 'open', overdue: true, createdByName: sup.name });
    await expect(updateDsr(sup, c.id, r.id, { status: 'rejected' }, null)).resolves.toBeTruthy(); // has a note already
    await updateDsr(sup, c.id, r.id, { status: 'completed' }, null);
    [row] = await listDsr(tenant.id, c.id);
    expect(row).toMatchObject({ status: 'completed', overdue: false, handledByName: sup.name });
    const actions = (await auditOf(r.id)).map((l) => l.action);
    expect(actions.filter((a) => a === 'dsr.updated')).toHaveLength(2);
    expect(actions).toContain('dsr.created');
  });
});

describe('PDPA retention (#19)', () => {
  afterAll(async () => {
    await db.update(schema.tenant).set({ retentionDays: null }).where(eq(schema.tenant.id, tenant.id));
  });

  it('retention is set in Settings (admin) and audit-logged', async () => {
    await updateSettings(admin, { retentionDays: 30 }, null);
    expect((await getSettings(tenant.id)).tenant.retentionDays).toBe(30);
    const [log] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenant.id), eq(schema.auditLog.action, 'settings.updated'), eq(schema.auditLog.actorId, admin.id)));
    expect(JSON.stringify(log.diff)).toContain('retentionDays');
  });

  it('the sweep anonymises only closed cases past retention, and the contact only when none of their cases remain', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 40 * DAY);
    const recent = new Date(now.getTime() - 5 * DAY);
    await db.update(schema.tenant).set({ retentionDays: 30 }).where(eq(schema.tenant.id, tenant.id));

    // A: only case, closed 40 days ago -> case + contact anonymised
    const a = await reporter();
    const ka = await caseWithData(a);
    await closeCase(ka.case.id);
    await db.update(schema.kase).set({ closedAt: old }).where(eq(schema.kase.id, ka.case.id));
    // B: closed 5 days ago -> untouched
    const b = await reporter();
    const kb = await caseWithData(b);
    await closeCase(kb.case.id);
    await db.update(schema.kase).set({ closedAt: recent }).where(eq(schema.kase.id, kb.case.id));
    // C: one expired case and one open case -> case anonymised, contact kept
    const c = await reporter();
    const kc1 = await caseWithData(c);
    await closeCase(kc1.case.id);
    await db.update(schema.kase).set({ closedAt: old }).where(eq(schema.kase.id, kc1.case.id));
    const kc2 = await caseWithData(c);
    // D: open case with an old update time -> untouched
    const d = await reporter();
    const kd = await caseWithData(d);
    await db.update(schema.kase).set({ updatedAt: old, createdAt: old }).where(eq(schema.kase.id, kd.case.id));

    const stats = await retentionSweep(now);
    expect(stats.cases).toBeGreaterThanOrEqual(2);

    const cases = await db.select().from(schema.kase).where(inArray(schema.kase.id, [ka.case.id, kb.case.id, kc1.case.id, kc2.case.id, kd.case.id]));
    const anon = (id: string) => !!cases.find((k) => k.id === id)!.anonymisedAt;
    expect(anon(ka.case.id)).toBe(true);
    expect(anon(kc1.case.id)).toBe(true);
    expect(anon(kb.case.id)).toBe(false);
    expect(anon(kc2.case.id)).toBe(false);
    expect(anon(kd.case.id)).toBe(false);
    expect(cases.find((k) => k.id === ka.case.id)!.status).toBe('closed');

    const contacts = await db.select().from(schema.contact).where(inArray(schema.contact.id, [a.id, b.id, c.id, d.id]));
    const cAnon = (id: string) => contacts.find((x) => x.id === id)!;
    expect(cAnon(a.id)).toMatchObject({ fullName: null, phone: null });
    expect(cAnon(a.id).anonymisedAt).not.toBeNull();
    expect(cAnon(b.id).anonymisedAt).toBeNull();
    expect(cAnon(c.id).fullName).toBe('สมหญิง ข้อมูลส่วนตัว');
    expect(cAnon(d.id).anonymisedAt).toBeNull();

    // Files of the expired case are gone; the recent case keeps its file
    await expect(getObject(ka.attachment.storageKey)).rejects.toThrow();
    await expect(getObject(kb.attachment.storageKey)).resolves.toBeTruthy();

    // System audit rows
    const logs = await db.select().from(schema.auditLog).where(inArray(schema.auditLog.entityId, [ka.case.id, a.id, kc1.case.id]));
    expect(logs.filter((l) => l.actorType === 'system').map((l) => l.action).sort()).toEqual(['case.anonymised', 'case.anonymised', 'contact.anonymised']);

    // C's contact is anonymised once the open case closes and also expires
    await closeCase(kc2.case.id);
    await db.update(schema.kase).set({ closedAt: old }).where(eq(schema.kase.id, kc2.case.id));
    await retentionSweep(now);
    const [c2] = await db.select().from(schema.contact).where(eq(schema.contact.id, c.id));
    expect(c2.anonymisedAt).not.toBeNull();

    // A second sweep does nothing new for these rows
    const again = await retentionSweep(now);
    const logs2 = await db.select().from(schema.auditLog).where(inArray(schema.auditLog.entityId, [ka.case.id, a.id]));
    expect(logs2.filter((l) => l.action.endsWith('.anonymised'))).toHaveLength(2);
    expect(again.contacts).toBe(0);
  });

  it('the sweep does nothing when retention is off', async () => {
    await db.update(schema.tenant).set({ retentionDays: null }).where(eq(schema.tenant.id, tenant.id));
    const a = await reporter();
    const ka = await caseWithData(a);
    await closeCase(ka.case.id);
    await db.update(schema.kase).set({ closedAt: new Date(Date.now() - 4000 * DAY) }).where(eq(schema.kase.id, ka.case.id));
    await retentionSweep();
    const [k] = await db.select().from(schema.kase).where(eq(schema.kase.id, ka.case.id));
    expect(k.anonymisedAt).toBeNull();
  });
});
