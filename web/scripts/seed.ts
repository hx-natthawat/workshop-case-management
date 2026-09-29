/**
 * Seed data for user testing, taken from prototype/mock-data (fictional names).
 * Staff logins (test only): every seeded user has the password in SEED_PASSWORD (default "demo1234").
 * Set SEED_SAMPLES=false for an empty case list.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, pg, schema } from '../src/server/db';
import type { Priority, QuestionType } from '../src/server/db/schema';
import * as caseSvc from '../src/server/case/service';
import type { SessionUser } from '../src/server/lib/auth';

const PASSWORD = process.env.SEED_PASSWORD ?? 'demo1234';
const WITH_SAMPLES = process.env.SEED_SAMPLES !== 'false';
const PDPA_TEXT = `ประกาศความเป็นส่วนตัว (ฉบับ v3 · ตัวอย่างสำหรับการทดสอบ ต้องให้ฝ่ายกฎหมายตรวจก่อนใช้งานจริง)
ข้อมูลที่เก็บ: ชื่อ เบอร์โทรศัพท์ รหัสลูกค้าหรือหน่วยงาน LINE user ID ข้อความ และไฟล์ที่คุณส่ง
วัตถุประสงค์และฐานทางกฎหมาย: รับเรื่อง ติดต่อกลับ และแก้ไขปัญหาที่คุณแจ้ง เพื่อให้บริการตามที่คุณร้องขอ (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล มาตรา 24) และวัดคุณภาพบริการเพื่อประโยชน์โดยชอบด้วยกฎหมาย
ระยะเวลาเก็บ: ตลอดช่วงที่เคสยังเปิดอยู่ และเก็บต่อไม่เกิน [กำหนดโดยองค์กร] หลังปิดเคส จากนั้นลบหรือทำให้ไม่สามารถระบุตัวตนได้
ผู้เข้าถึง: เฉพาะเจ้าหน้าที่ที่เกี่ยวข้องกับเคส
สิทธิของคุณ: ขอเข้าถึงและขอสำเนา · แก้ไข · ลบ · ระงับการใช้ · คัดค้าน · ขอให้โอนย้ายข้อมูล โดยพิมพ์ "คุยกับเจ้าหน้าที่" ในแชท และร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลได้`;

type Q = { key: string; type: QuestionType; label: string; short?: string; required?: boolean; options?: string[]; validation?: object; showIf?: { key: string; equals: string }; priorityRules?: Record<string, Priority> };

const IMPACT: Q = {
  key: 'impact', type: 'single_choice', label: 'ปัญหานี้กระทบงานแค่ไหน', short: 'ผลกระทบ', options: ['เฉพาะตัวเอง', 'กระทบงานของทีม', 'ทั้งหน่วยงานใช้งานไม่ได้'],
  priorityRules: { 'กระทบงานของทีม': 'P2', 'ทั้งหน่วยงานใช้งานไม่ได้': 'P1' },
};
const SCREENSHOT: Q = { key: 'screenshot', type: 'attachment', label: 'แนบภาพหน้าจอหรือรูปประกอบ', short: 'ไฟล์แนบ', required: false, validation: { maxFiles: 5 } };

const FORMS: Record<string, Q[]> = {
  // prototype/mock-data/bot-flow.json
  'เข้าระบบไม่ได้': [
    { key: 'system_name', type: 'single_choice', label: 'ระบบที่ใช้งานไม่ได้คือระบบใด', short: 'ระบบ', options: ['ERP', 'อีเมล', 'VPN', 'ระบบอื่น'] },
    { key: 'system_other', type: 'short_text', label: 'ระบุชื่อระบบ', short: 'ชื่อระบบ', validation: { maxLength: 100 }, showIf: { key: 'system_name', equals: 'ระบบอื่น' } },
    { key: 'error_msg', type: 'long_text', label: 'ข้อความ error ที่พบ', short: 'ข้อความ error', required: false },
    IMPACT,
    { key: 'started_at', type: 'datetime', label: 'เริ่มพบปัญหาเมื่อไร', short: 'เริ่มพบ', validation: { notFuture: true } },
    { ...SCREENSHOT, label: 'แนบภาพหน้าจอ error' },
  ],
  'ปัญหาระบบ IT': [
    { key: 'symptom', type: 'long_text', label: 'อาการที่พบ', short: 'อาการ' },
    IMPACT,
    { key: 'started_at', type: 'datetime', label: 'เริ่มพบปัญหาเมื่อไร', short: 'เริ่มพบ', validation: { notFuture: true } },
    SCREENSHOT,
  ],
  'ขอสิทธิ์ใช้งาน': [
    { key: 'system_name', type: 'short_text', label: 'ต้องการสิทธิ์ในระบบใด', short: 'ระบบ' },
    { key: 'reason', type: 'long_text', label: 'เหตุผลที่ต้องการสิทธิ์', short: 'เหตุผล' },
    { key: 'approver_email', type: 'email', label: 'อีเมลของหัวหน้าที่อนุมัติ', short: 'ผู้อนุมัติ' },
  ],
  'อุปกรณ์': [
    { key: 'symptom', type: 'long_text', label: 'อาการที่พบ', short: 'อาการ' },
    { key: 'asset_no', type: 'short_text', label: 'เลขครุภัณฑ์ (ดูได้จากสติกเกอร์ที่ตัวเครื่อง)', short: 'เลขครุภัณฑ์', required: false },
    { key: 'device_count', type: 'number', label: 'จำนวนเครื่องที่มีปัญหา', short: 'จำนวนเครื่อง', validation: { min: 1, max: 500 } },
    { key: 'location', type: 'location', label: 'สาขาหรือจุดที่ตั้งเครื่อง', short: 'สถานที่' },
    SCREENSHOT,
  ],
  'อาคารสถานที่': [
    { key: 'symptom', type: 'long_text', label: 'รายละเอียดปัญหา', short: 'รายละเอียด' },
    { key: 'location', type: 'location', label: 'สาขาหรือจุดที่เกิดเหตุ', short: 'สถานที่' },
    { key: 'urgency', type: 'single_choice', label: 'ความเร่งด่วน', short: 'ความเร่งด่วน', options: ['รอได้', 'ต้องการภายในวันนี้', 'อันตราย ต้องแก้ทันที'], priorityRules: { 'ต้องการภายในวันนี้': 'P2', 'อันตราย ต้องแก้ทันที': 'P1' } },
    { ...SCREENSHOT, label: 'แนบรูปจุดที่เกิดปัญหา' },
  ],
  'สอบถามทั่วไป': [
    { key: 'question', type: 'long_text', label: 'เรื่องที่ต้องการสอบถาม', short: 'เรื่อง' },
    { key: 'callback_phone', type: 'phone', label: 'เบอร์ติดต่อกลับ (ถ้าต้องการให้โทรกลับ)', short: 'เบอร์ติดต่อกลับ', required: false },
  ],
};

const CATEGORIES: { name: string; hint: string; icon: string; team: string; priority: Priority; children: [string, string][] }[] = [
  { name: 'ระบบ IT', icon: 'monitor', hint: 'เข้าระบบ · อีเมล · เครือข่าย · ขอสิทธิ์', team: 'IT Service Desk', priority: 'P3', children: [
    ['เข้าระบบไม่ได้', 'เข้าระบบไม่ได้'], ['อีเมล', 'ปัญหาระบบ IT'], ['VPN และเครือข่าย', 'ปัญหาระบบ IT'], ['ขอสิทธิ์ใช้งาน', 'ขอสิทธิ์ใช้งาน'], ['ซอฟต์แวร์', 'ปัญหาระบบ IT'],
  ] },
  { name: 'อุปกรณ์', icon: 'printer', hint: 'คอมพิวเตอร์ · เครื่องพิมพ์ · โทรศัพท์', team: 'IT Service Desk', priority: 'P3', children: [
    ['คอมพิวเตอร์', 'อุปกรณ์'], ['เครื่องพิมพ์', 'อุปกรณ์'], ['โทรศัพท์', 'อุปกรณ์'],
  ] },
  { name: 'อาคารสถานที่', icon: 'building-2', hint: 'ปรับอากาศ · ไฟฟ้า · ประปา · ห้องประชุม', team: 'อาคารสถานที่', priority: 'P3', children: [
    ['ปรับอากาศ', 'อาคารสถานที่'], ['ไฟฟ้า', 'อาคารสถานที่'], ['ประปา', 'อาคารสถานที่'], ['ห้องประชุม', 'อาคารสถานที่'],
  ] },
  { name: 'สอบถามทั่วไป', icon: 'message-circle-question', hint: 'สอบถาม · ขอบริการ', team: 'IT Service Desk', priority: 'P4', children: [['สอบถาม', 'สอบถามทั่วไป']] },
];

const USERS = [
  { email: 'admin@example.com', name: 'ผู้ดูแลระบบ', role: 'admin' as const, team: 'IT Service Desk' },
  { email: 'thanapol@example.com', name: 'ธนพล ส.', role: 'supervisor' as const, team: 'IT Service Desk' },
  { email: 'kamonchanok@example.com', name: 'กมลชนก ว.', role: 'agent' as const, team: 'IT Service Desk' },
  { email: 'wanchai@example.com', name: 'วันชัย ร.', role: 'agent' as const, team: 'IT Service Desk' },
  { email: 'attapol@example.com', name: 'อรรถพล ม.', role: 'agent' as const, team: 'อาคารสถานที่' },
  { email: 'suda@example.com', name: 'สุดา ก.', role: 'supervisor' as const, team: 'อาคารสถานที่' },
];

const CANNED = [
  ['รับเรื่องแล้ว', 'สวัสดีครับ รับเรื่องแล้วครับ กำลังตรวจสอบให้ จะแจ้งความคืบหน้าในแชทนี้ครับ'],
  ['ขอข้อมูลเพิ่ม', 'รบกวนขอข้อมูลเพิ่มเติมครับ ช่วยส่งภาพหน้าจอ หรือเล่าขั้นตอนที่ทำก่อนพบปัญหาในแชทนี้ได้เลยครับ'],
  ['ลองอีกครั้ง', 'ดำเนินการแก้ไขเรียบร้อยครับ รบกวนลองใช้งานอีกครั้ง แล้วแจ้งผลในแชทนี้ได้เลยครับ'],
  ['นัดเข้าหน้างาน', 'เจ้าหน้าที่จะเข้าไปตรวจสอบที่หน้างานภายในวันนี้ครับ'],
];

async function main() {
  const [tenant] = await db.insert(schema.tenant).values({ name: 'HarmonyX Demo', oaName: 'ศูนย์แจ้งปัญหา', pdpaVersion: 'v3', pdpaText: PDPA_TEXT }).returning();
  const tenantId = tenant.id;

  await db.insert(schema.slaPolicy).values([
    { tenantId, priority: 'P1', responseMinutes: 15, resolveMinutes: 240, businessHoursOnly: false },
    { tenantId, priority: 'P2', responseMinutes: 60, resolveMinutes: 480, businessHoursOnly: true },
    { tenantId, priority: 'P3', responseMinutes: 240, resolveMinutes: 1440, businessHoursOnly: true },
    { tenantId, priority: 'P4', responseMinutes: 480, resolveMinutes: 2400, businessHoursOnly: true },
  ]);

  const teams: Record<string, string> = {};
  for (const name of ['IT Service Desk', 'อาคารสถานที่']) {
    const [t] = await db.insert(schema.team).values({ tenantId, name }).returning();
    teams[name] = t.id;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  const users: Record<string, typeof schema.user.$inferSelect> = {};
  for (const u of USERS) {
    const [row] = await db.insert(schema.user).values({ tenantId, email: u.email, name: u.name, role: u.role, teamId: teams[u.team], passwordHash: hash }).returning();
    users[u.name] = row;
  }
  const admin = users['ผู้ดูแลระบบ'];

  const formIds: Record<string, string> = {};
  for (const [name, qs] of Object.entries(FORMS)) {
    const [f] = await db.insert(schema.form).values({ tenantId, name }).returning();
    formIds[name] = f.id;
    const version = name === 'เข้าระบบไม่ได้' ? 3 : 1; // prototype shows v3 published
    const [fv] = await db.insert(schema.formVersion).values({ tenantId, formId: f.id, version, status: 'published', publishedAt: new Date(), publishedBy: admin.id }).returning();
    await db.insert(schema.question).values(qs.map((q, i) => ({
      tenantId, formVersionId: fv.id, key: q.key, order: i + 1, type: q.type, label: q.label, shortLabel: q.short ?? null, options: q.options ?? null,
      required: q.required ?? true, validation: q.validation ?? null, showIf: q.showIf ?? null, priorityRules: q.priorityRules ?? null,
    })));
  }

  const catIds: Record<string, string> = {};
  for (const [pi, p] of CATEGORIES.entries()) {
    const [parent] = await db.insert(schema.category).values({ tenantId, name: p.name, hint: p.hint, icon: p.icon, defaultPriority: p.priority, defaultTeamId: teams[p.team], sortOrder: pi + 1 }).returning();
    catIds[p.name] = parent.id;
    for (const [ci, [child, formName]] of p.children.entries()) {
      const [c] = await db.insert(schema.category).values({ tenantId, parentId: parent.id, name: child, formId: formIds[formName], defaultPriority: p.priority, defaultTeamId: teams[p.team], sortOrder: ci + 1 }).returning();
      catIds[child] = c.id;
    }
  }
  await db.update(schema.tenant).set({ handoffCategoryId: catIds['สอบถาม'] }).where(eq(schema.tenant.id, tenantId));
  await db.insert(schema.cannedReply).values(CANNED.map(([title, body]) => ({ tenantId, title, body })));

  if (WITH_SAMPLES) await seedSamples(tenantId, catIds, users);
  console.log(`Seeded tenant ${tenantId}. Staff password: see SEED_PASSWORD in scripts/seed.ts.`);
}

// ── Sample cases so the dashboard and reports are not empty ──

const REPORTERS = [
  ['สมชาย ใจดี', '0891234521', 'ฝ่ายบัญชี'], ['ณัฐวุฒิ พ.', '0812223344', 'ฝ่ายขาย'], ['ศิริพร ท.', '0823334455', 'ฝ่ายบุคคล'],
  ['วราภรณ์ ก.', '0834445566', 'ฝ่ายจัดซื้อ'], ['ชยพล อ.', '0845556677', 'ฝ่ายผลิต'], ['ปิยะ ร.', '0856667788', 'ฝ่ายจัดซื้อ'],
  ['พรทิพย์ จ.', '0867778899', 'ฝ่ายการตลาด'], ['อนุชา ป.', '0878889900', 'ฝ่ายฝึกอบรม'], ['มาลี ส.', '0889990011', 'ฝ่ายอาคาร'],
];

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];

async function seedSamples(tenantId: string, catIds: Record<string, string>, users: Record<string, typeof schema.user.$inferSelect>) {
  const contacts = [];
  for (const [i, [name, phone, org]] of REPORTERS.entries()) {
    const [c] = await db.insert(schema.contact).values({
      tenantId, lineUserId: `Usim${String(i + 1).padStart(4, '0')}sample`, displayName: name.split(' ')[0], fullName: name, phone, customerRef: `C-${1000 + i}`, orgUnit: org,
      consentVersion: 'v2', consentAt: new Date(Date.now() - 40 * 86_400_000), isSimulated: true,
    }).returning();
    contacts.push(c);
  }
  const asUser = (name: string): { type: 'user'; user: SessionUser } => {
    const u = users[name];
    return { type: 'user', user: { id: u.id, tenantId, role: 'admin', name: u.name, email: u.email, teamId: u.teamId } };
  };
  const text = (t: string) => ({ kind: 'text' as const, text: t });
  const min = 60_000;
  const now = Date.now();

  // History: 30 days of closed cases for reports
  const history: [string, string][] = [
    ['อีเมล', 'ส่งอีเมลออกภายนอกไม่ได้'], ['VPN และเครือข่าย', 'Wi-Fi หลุดบ่อย'], ['คอมพิวเตอร์', 'เครื่องเปิดไม่ติด'], ['เครื่องพิมพ์', 'เครื่องพิมพ์กระดาษติด'],
    ['ปรับอากาศ', 'แอร์ไม่เย็น'], ['ไฟฟ้า', 'ไฟทางเดินดับ'], ['ซอฟต์แวร์', 'ขอติดตั้งโปรแกรม'], ['สอบถาม', 'สอบถามขั้นตอนเบิกอุปกรณ์'], ['ประปา', 'ก๊อกน้ำรั่ว'],
  ];
  for (let i = 0; i < 46; i++) {
    const [catName, title] = pick(history);
    const created = new Date(now - (2 + rand() * 28) * 86_400_000);
    created.setUTCHours(2 + Math.floor(rand() * 8), Math.floor(rand() * 60)); // 09:00–17:00 Bangkok
    const contact = pick(contacts);
    const r = await caseSvc.createCase({ tenantId, contact, now: created, draft: { categoryId: catIds[catName], formVersionId: null, answers: [{ key: 'detail', label: 'รายละเอียด', order: 1, value: text(`${title} ${['ตั้งแต่เช้า', 'หลายครั้งแล้ว', 'ที่ชั้น 3', 'ทั้งแผนก'][i % 4]}`) }], note: title } });
    const agentName = catName === 'ปรับอากาศ' || catName === 'ไฟฟ้า' || catName === 'ประปา' ? 'อรรถพล ม.' : pick(['ธนพล ส.', 'กมลชนก ว.', 'วันชัย ร.']);
    const actor = asUser(agentName);
    if (r.case.assigneeId !== actor.user.id) await caseSvc.assign(tenantId, r.case.id, actor.user.id, actor, new Date(created.getTime() + 2 * min));
    const firstReply = new Date(created.getTime() + (5 + rand() * (i % 7 === 0 ? 400 : 90)) * min);
    await caseSvc.postAgentMessage(tenantId, r.case.id, actor, { mode: 'line', text: 'รับเรื่องแล้วครับ กำลังตรวจสอบให้ครับ', afterStatus: 'in_progress' }, firstReply);
    const resolved = new Date(firstReply.getTime() + (30 + rand() * (i % 5 === 0 ? 3000 : 600)) * min);
    await caseSvc.postAgentMessage(tenantId, r.case.id, actor, { mode: 'line', text: 'แก้ไขเรียบร้อยแล้วครับ', afterStatus: 'resolved' }, resolved);
    const contactActor = { type: 'contact' as const, contactId: contact.id };
    if (rand() < 0.8) {
      await caseSvc.transition(tenantId, r.case.id, 'closed', contactActor, { now: new Date(resolved.getTime() + 60 * min) });
      await caseSvc.setCsat(tenantId, r.case.id, contact.id, pick([5, 5, 5, 4, 4, 4, 3, 5, 2]));
    } else {
      await caseSvc.transition(tenantId, r.case.id, 'closed', { type: 'system' }, { now: new Date(resolved.getTime() + 3 * 86_400_000) });
    }
  }

  // Open cases mirroring prototype/mock-data/cases.json
  const open: { cat: string; note: string; contact: number; ago: number; agent?: string; steps?: ('start' | 'pending' | 'resolved')[]; answers?: [string, string, string][] ; priority?: Priority }[] = [
    { cat: 'VPN และเครือข่าย', note: 'เข้า VPN ไม่ได้ทั้งแผนกบัญชี', contact: 0, ago: 27, agent: 'ธนพล ส.', steps: ['start'], priority: 'P1' },
    { cat: 'ปรับอากาศ', note: 'แอร์ห้องประชุม B ไม่เย็น', contact: 1, ago: 190, agent: 'อรรถพล ม.', steps: ['start'] },
    { cat: 'อีเมล', note: 'อีเมลส่งออกภายนอกไม่ได้', contact: 2, ago: 70, agent: 'กมลชนก ว.', steps: ['start'], priority: 'P2' },
    { cat: 'เครื่องพิมพ์', note: 'เครื่องพิมพ์ชั้น 3 กระดาษติด', contact: 3, ago: 14 },
    { cat: 'คอมพิวเตอร์', note: 'จอคอมพิวเตอร์กะพริบ', contact: 4, ago: 118, agent: 'ธนพล ส.' },
    { cat: 'ขอสิทธิ์ใช้งาน', note: 'ขอสิทธิ์เข้าระบบ ERP โมดูลจัดซื้อ', contact: 5, ago: 40, agent: 'กมลชนก ว.' },
    { cat: 'VPN และเครือข่าย', note: 'Wi-Fi ห้องอบรมหลุดบ่อย', contact: 7, ago: 1300, agent: 'ธนพล ส.', steps: ['start', 'resolved'] },
    { cat: 'ไฟฟ้า', note: 'ไฟทางเดินชั้น 5 ดับ', contact: 8, ago: 1400, agent: 'อรรถพล ม.', steps: ['start', 'resolved'] },
  ];
  for (const o of open) {
    const created = new Date(now - o.ago * min);
    const contact = contacts[o.contact];
    const r = await caseSvc.createCase({ tenantId, contact, now: created, draft: { categoryId: catIds[o.cat], formVersionId: null, answers: [{ key: 'detail', label: 'รายละเอียด', order: 1, value: text(o.note) }], note: o.note } });
    const sup = asUser('ผู้ดูแลระบบ');
    if (o.priority && o.priority !== r.case.priority) await caseSvc.changePriority(tenantId, r.case.id, o.priority, 'ตัวอย่างข้อมูลทดสอบ', sup, created);
    if (o.agent && r.case.assigneeId !== users[o.agent].id) await caseSvc.assign(tenantId, r.case.id, users[o.agent].id, sup, new Date(created.getTime() + min));
    if (!o.agent && r.case.assigneeId) {
      // keep one unassigned case in the inbox
      await db.update(schema.kase).set({ assigneeId: null, status: 'new' }).where(eq(schema.kase.id, r.case.id));
    }
    let t = created.getTime() + 5 * min;
    for (const s of o.steps ?? []) {
      const actor = asUser(o.agent!);
      if (s === 'start') await caseSvc.postAgentMessage(tenantId, r.case.id, actor, { mode: 'line', text: 'รับเรื่องแล้วครับ กำลังตรวจสอบให้ครับ', afterStatus: 'in_progress' }, new Date(t));
      if (s === 'resolved') await caseSvc.postAgentMessage(tenantId, r.case.id, actor, { mode: 'line', text: 'แก้ไขเรียบร้อยแล้วครับ', afterStatus: 'resolved' }, new Date(t));
      t += 20 * min;
    }
  }

  // CS-2609-00123 story: ERP login case with the full form, waiting for the reporter
  const [fv] = await db.select().from(schema.formVersion).where(eq(schema.formVersion.version, 3));
  const started = new Date(now - 50 * min);
  const erp = await caseSvc.createCase({
    tenantId, contact: contacts[0], now: new Date(now - 48 * min),
    draft: {
      categoryId: catIds['เข้าระบบไม่ได้'], formVersionId: fv.id, requestedPriority: 'P2',
      answers: [
        { key: 'system_name', label: 'ระบบที่ใช้งานไม่ได้คือระบบใด', order: 1, value: { kind: 'choice', value: 'ERP' } },
        { key: 'error_msg', label: 'ข้อความ error ที่พบ', order: 3, value: text('Account is locked. Contact administrator.') },
        { key: 'impact', label: 'ปัญหานี้กระทบงานแค่ไหน', order: 4, value: { kind: 'choice', value: 'กระทบงานของทีม' } },
        { key: 'started_at', label: 'เริ่มพบปัญหาเมื่อไร', order: 5, value: { kind: 'datetime', iso: started.toISOString() } },
      ],
    },
  });
  const th = asUser('ธนพล ส.');
  if (erp.case.assigneeId !== th.user.id) await caseSvc.assign(tenantId, erp.case.id, th.user.id, th, new Date(now - 47 * min));
  await caseSvc.postAgentMessage(tenantId, erp.case.id, th, { mode: 'line', text: 'สวัสดีครับคุณสมชาย รับเรื่องแล้วครับ กำลังตรวจสอบบัญชี ERP ให้ครับ', afterStatus: 'in_progress' }, new Date(now - 40 * min));
  await caseSvc.postAgentMessage(tenantId, erp.case.id, th, { mode: 'internal', text: 'บัญชีถูกล็อกจากการใส่รหัสผิด 5 ครั้ง ปลดล็อกใน AD แล้ว รอ sync ประมาณ 10 นาที' }, new Date(now - 32 * min));
  await caseSvc.postAgentMessage(tenantId, erp.case.id, th, { mode: 'line', text: 'ปลดล็อกบัญชีเรียบร้อยครับ รบกวนลองเข้าระบบอีกครั้งหลัง 10 นาที แล้วแจ้งผลในแชทนี้ได้เลยครับ', afterStatus: 'pending_customer' }, new Date(now - 31 * min));

  // Seeding generates notifications for old events; start testers with a clean bell.
  await db.delete(schema.notification);
}

main()
  .then(() => pg.end())
  .catch(async (e) => {
    console.error(e);
    await pg.end();
    process.exit(1);
  });
