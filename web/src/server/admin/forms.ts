/**
 * Bot Flow Builder server logic (SPEC §5, analysis D1).
 * Invariants: a published form_version is never modified; each form has at most one draft
 * (version = max+1); publish archives the previous published version in the same transaction.
 */
import { and, asc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema, type Tx } from '@/server/db';
import type { Priority, QuestionType } from '@/server/db/schema';
import { audit } from '@/server/lib/audit';
import { HttpError, type SessionUser } from '@/server/lib/auth';

export const QUESTION_TYPES = [
  'short_text', 'long_text', 'single_choice', 'datetime', 'location', 'attachment', 'number', 'phone', 'email',
] as const satisfies readonly QuestionType[];
export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const satisfies readonly Priority[];
export const KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;

const priority = z.enum(PRIORITIES);

export const questionInput = z.object({
  key: z.string().trim(),
  type: z.enum(QUESTION_TYPES),
  label: z.string().trim().max(300),
  shortLabel: z.string().trim().max(40).nullish(),
  required: z.boolean().default(true),
  options: z.array(z.string().trim().max(100)).nullish(),
  validation: z.object({
    maxLength: z.number().int().positive().max(5000).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    notFuture: z.boolean().optional(),
    maxFiles: z.number().int().min(1).max(10).optional(),
  }).nullish(),
  showIf: z.object({ key: z.string(), equals: z.string() }).nullish(),
  priorityRules: z.record(z.string(), priority).nullish(),
});
export type QuestionInput = z.infer<typeof questionInput>;
export const draftInput = z.object({ questions: z.array(questionInput).max(50) });

/** Returns Thai error messages; empty when valid. */
export function validateQuestions(qs: QuestionInput[], forPublish: boolean): string[] {
  const errs: string[] = [];
  if (forPublish && qs.length === 0) errs.push('ต้องมีคำถามอย่างน้อย 1 ข้อก่อนเผยแพร่');
  const seen = new Set<string>();
  qs.forEach((q, i) => {
    const n = `ข้อ ${i + 1}`;
    if (!q.label) errs.push(`${n}: กรุณาระบุข้อความคำถาม`);
    if (!KEY_RE.test(q.key)) errs.push(`${n}: key ต้องขึ้นต้นด้วย a-z และใช้ได้เฉพาะ a-z 0-9 _ ความยาว 2–40 ตัวอักษร`);
    else if (seen.has(q.key)) errs.push(`${n}: key "${q.key}" ซ้ำกับข้ออื่น`);
    seen.add(q.key);
    if (q.type === 'single_choice') {
      const opts = q.options ?? [];
      if (opts.filter(Boolean).length < 2) errs.push(`${n}: ตัวเลือกเดียวต้องมีตัวเลือกอย่างน้อย 2 รายการ`);
      if (opts.some((o) => !o)) errs.push(`${n}: ตัวเลือกต้องไม่ว่าง`);
      if (new Set(opts).size !== opts.length) errs.push(`${n}: ตัวเลือกซ้ำกัน`);
      for (const k of Object.keys(q.priorityRules ?? {})) {
        if (!opts.includes(k)) errs.push(`${n}: กติกา priority อ้างถึงตัวเลือก "${k}" ที่ไม่มีอยู่`);
      }
    }
    const v = q.validation;
    if (v?.min != null && v?.max != null && v.min > v.max) errs.push(`${n}: ค่าต่ำสุดต้องไม่เกินค่าสูงสุด`);
    if (q.showIf) {
      const ref = qs.slice(0, i).find((p) => p.key === q.showIf!.key);
      if (!ref || ref.type !== 'single_choice') errs.push(`${n}: เงื่อนไขการแสดงต้องอ้างถึงคำถามแบบตัวเลือกเดียวที่อยู่ก่อนหน้า`);
      else if (!(ref.options ?? []).includes(q.showIf.equals)) errs.push(`${n}: เงื่อนไขการแสดงอ้างถึงตัวเลือกที่ไม่มีอยู่`);
    }
  });
  return errs;
}

/** Keep only the fields relevant to the type so stale values never reach the bot. */
function normalize(q: QuestionInput, order: number, tenantId: string, formVersionId: string) {
  const isChoice = q.type === 'single_choice';
  const v = q.validation ?? {};
  const validation: Record<string, unknown> = {};
  if ((q.type === 'short_text' || q.type === 'long_text') && v.maxLength) validation.maxLength = v.maxLength;
  if (q.type === 'number') {
    if (v.min != null) validation.min = v.min;
    if (v.max != null) validation.max = v.max;
  }
  if (q.type === 'datetime' && v.notFuture) validation.notFuture = true;
  if (q.type === 'attachment' && v.maxFiles) validation.maxFiles = v.maxFiles;
  const rules = isChoice && q.priorityRules && Object.keys(q.priorityRules).length ? q.priorityRules : null;
  return {
    tenantId, formVersionId, key: q.key, order, type: q.type, label: q.label, shortLabel: q.shortLabel?.trim() || null, required: q.required,
    options: isChoice ? q.options ?? [] : null,
    validation: Object.keys(validation).length ? validation : null,
    showIf: q.showIf ?? null,
    priorityRules: rules,
  };
}

// ── Categories ────────────────────────────────────────────────

export type CategoryRow = typeof schema.category.$inferSelect;

export async function listCategories(tenantId: string) {
  const rows = await db.select().from(schema.category)
    .where(eq(schema.category.tenantId, tenantId))
    .orderBy(asc(schema.category.sortOrder), asc(schema.category.createdAt));
  return rows.filter((c) => !c.parentId).map((p) => ({ ...p, children: rows.filter((c) => c.parentId === p.id) }));
}

export const categoryCreate = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().uuid().nullish(),
  hint: z.string().trim().max(200).nullish(),
  defaultPriority: priority.optional(),
  defaultTeamId: z.string().uuid().nullish(),
  formId: z.string().uuid().nullish(),
});

export const categoryPatch = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  hint: z.string().trim().max(200).nullish(),
  defaultPriority: priority.optional(),
  defaultTeamId: z.string().uuid().nullish(),
  formId: z.string().uuid().nullish(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  move: z.enum(['up', 'down']).optional(),
});

async function assertRefs(tenantId: string, r: { parentId?: string | null; defaultTeamId?: string | null; formId?: string | null }) {
  if (r.parentId) {
    const [p] = await db.select().from(schema.category).where(and(eq(schema.category.id, r.parentId), eq(schema.category.tenantId, tenantId)));
    if (!p) throw new HttpError(400, 'ไม่พบหมวดหลัก');
    if (p.parentId) throw new HttpError(400, 'หมวดย่อยมีได้ 2 ระดับเท่านั้น');
  }
  if (r.defaultTeamId) {
    const [t] = await db.select().from(schema.team).where(and(eq(schema.team.id, r.defaultTeamId), eq(schema.team.tenantId, tenantId)));
    if (!t) throw new HttpError(400, 'ไม่พบทีม');
  }
  if (r.formId) {
    const [f] = await db.select().from(schema.form).where(and(eq(schema.form.id, r.formId), eq(schema.form.tenantId, tenantId)));
    if (!f) throw new HttpError(400, 'ไม่พบแบบฟอร์ม');
  }
}

export async function createCategory(user: SessionUser, input: z.infer<typeof categoryCreate>, ip: string | null) {
  await assertRefs(user.tenantId, input);
  const parentCond = input.parentId ? eq(schema.category.parentId, input.parentId) : isNull(schema.category.parentId);
  const [{ m }] = await db.select({ m: max(schema.category.sortOrder) }).from(schema.category)
    .where(and(eq(schema.category.tenantId, user.tenantId), parentCond));
  let defaults: { defaultPriority?: Priority; defaultTeamId?: string | null } = {};
  if (input.parentId) {
    const [p] = await db.select().from(schema.category).where(eq(schema.category.id, input.parentId));
    defaults = { defaultPriority: p.defaultPriority, defaultTeamId: p.defaultTeamId };
  }
  const [row] = await db.insert(schema.category).values({
    tenantId: user.tenantId, parentId: input.parentId ?? null, name: input.name, hint: input.hint ?? null,
    formId: input.parentId ? input.formId ?? null : null,
    defaultPriority: input.defaultPriority ?? defaults.defaultPriority ?? 'P3',
    defaultTeamId: input.defaultTeamId ?? defaults.defaultTeamId ?? null,
    sortOrder: (m ?? 0) + 1,
  }).returning();
  await audit({ tenantId: user.tenantId, actorId: user.id, action: 'category.create', entity: 'category', entityId: row.id, diff: { after: row }, ip });
  return row;
}

export async function updateCategory(user: SessionUser, id: string, patch: z.infer<typeof categoryPatch>, ip: string | null) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, 'ไม่พบหมวดหมู่');
  const [cur] = await db.select().from(schema.category).where(and(eq(schema.category.id, id), eq(schema.category.tenantId, user.tenantId)));
  if (!cur) throw new HttpError(404, 'ไม่พบหมวดหมู่');
  await assertRefs(user.tenantId, patch);
  if (patch.formId && !cur.parentId) throw new HttpError(400, 'เลือกแบบฟอร์มได้เฉพาะหมวดย่อย');

  return db.transaction(async (tx) => {
    const { move, ...fields } = patch;
    const set: Partial<CategoryRow> = {};
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) (set as Record<string, unknown>)[k] = v;
    if (Object.keys(set).length) await tx.update(schema.category).set(set).where(eq(schema.category.id, id));
    if (move) await moveCategory(tx, cur, move);
    const [after] = await tx.select().from(schema.category).where(eq(schema.category.id, id));
    const before: Record<string, unknown> = {};
    for (const k of Object.keys(set)) before[k] = cur[k as keyof CategoryRow];
    await audit({ tenantId: user.tenantId, actorId: user.id, action: 'category.update', entity: 'category', entityId: id, diff: { before, after: set, move }, ip }, tx);
    return after;
  });
}

/** Swap with the neighbour and renumber siblings 1..n so duplicate sortOrders cannot stick. */
async function moveCategory(tx: Tx, cur: CategoryRow, dir: 'up' | 'down') {
  const parentCond = cur.parentId ? eq(schema.category.parentId, cur.parentId) : isNull(schema.category.parentId);
  const sibs = await tx.select().from(schema.category)
    .where(and(eq(schema.category.tenantId, cur.tenantId), parentCond))
    .orderBy(asc(schema.category.sortOrder), asc(schema.category.createdAt));
  const i = sibs.findIndex((s) => s.id === cur.id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= sibs.length) return;
  [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
  for (const [n, s] of sibs.entries()) {
    if (s.sortOrder !== n + 1) await tx.update(schema.category).set({ sortOrder: n + 1 }).where(eq(schema.category.id, s.id));
  }
}

// ── Forms ─────────────────────────────────────────────────────

export async function listForms(tenantId: string) {
  const forms = await db.select().from(schema.form).where(eq(schema.form.tenantId, tenantId)).orderBy(asc(schema.form.createdAt));
  const versions = forms.length
    ? await db.select().from(schema.formVersion).where(and(eq(schema.formVersion.tenantId, tenantId), inArray(schema.formVersion.status, ['published', 'draft'])))
    : [];
  return forms.map((f) => ({
    id: f.id,
    name: f.name,
    publishedVersion: versions.find((v) => v.formId === f.id && v.status === 'published')?.version ?? null,
    draftVersion: versions.find((v) => v.formId === f.id && v.status === 'draft')?.version ?? null,
  }));
}

export const formCreate = z.object({ name: z.string().trim().min(1).max(100) });

export async function createForm(user: SessionUser, name: string, ip: string | null) {
  return db.transaction(async (tx) => {
    const [f] = await tx.insert(schema.form).values({ tenantId: user.tenantId, name }).returning();
    const [v] = await tx.insert(schema.formVersion).values({ tenantId: user.tenantId, formId: f.id, version: 1, status: 'draft' }).returning();
    await audit({ tenantId: user.tenantId, actorId: user.id, action: 'form.create', entity: 'form', entityId: f.id, diff: { name, draftVersion: v.version }, ip }, tx);
    return { id: f.id, name: f.name, publishedVersion: null, draftVersion: v.version };
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getForm(tenantId: string, formId: string, tx: Tx | typeof db = db) {
  if (!UUID_RE.test(formId)) throw new HttpError(404, 'ไม่พบแบบฟอร์ม');
  const [f] = await tx.select().from(schema.form).where(and(eq(schema.form.id, formId), eq(schema.form.tenantId, tenantId)));
  if (!f) throw new HttpError(404, 'ไม่พบแบบฟอร์ม');
  return f;
}

const questionsOf = (tx: Tx | typeof db, formVersionId: string) =>
  tx.select().from(schema.question).where(eq(schema.question.formVersionId, formVersionId)).orderBy(asc(schema.question.order));

export async function getFormDetail(tenantId: string, formId: string) {
  const f = await getForm(tenantId, formId);
  const versions = await db.select().from(schema.formVersion).where(eq(schema.formVersion.formId, formId));
  const pub = versions.find((v) => v.status === 'published');
  const draft = versions.find((v) => v.status === 'draft');
  const strip = (q: typeof schema.question.$inferSelect) => ({
    key: q.key, type: q.type, label: q.label, shortLabel: q.shortLabel, required: q.required, options: q.options,
    validation: q.validation, showIf: q.showIf, priorityRules: q.priorityRules,
  });
  return {
    id: f.id,
    name: f.name,
    maxVersion: Math.max(0, ...versions.map((v) => v.version)),
    published: pub ? { version: pub.version, publishedAt: pub.publishedAt, questions: (await questionsOf(db, pub.id)).map(strip) } : null,
    draft: draft ? { version: draft.version, createdAt: draft.createdAt, questions: (await questionsOf(db, draft.id)).map(strip) } : null,
  };
}
export type FormDetail = Awaited<ReturnType<typeof getFormDetail>>;

/** Lock the form row so concurrent save/publish on the same form serialise. */
async function lockForm(tx: Tx, tenantId: string, formId: string) {
  const f = await getForm(tenantId, formId, tx);
  await tx.execute(sql`select id from ${schema.form} where id = ${formId} for update`);
  return f;
}

export async function saveDraft(user: SessionUser, formId: string, input: z.infer<typeof draftInput>, ip: string | null) {
  const errs = validateQuestions(input.questions, false);
  if (errs.length) throw new HttpError(400, errs.join('\n'));
  await db.transaction(async (tx) => {
    await lockForm(tx, user.tenantId, formId);
    const versions = await tx.select().from(schema.formVersion).where(eq(schema.formVersion.formId, formId));
    let draft = versions.find((v) => v.status === 'draft');
    const created = !draft;
    if (!draft) {
      const next = Math.max(0, ...versions.map((v) => v.version)) + 1;
      [draft] = await tx.insert(schema.formVersion).values({ tenantId: user.tenantId, formId, version: next, status: 'draft' }).returning();
    }
    const before = created ? null : (await questionsOf(tx, draft.id)).map((q) => q.key);
    await tx.delete(schema.question).where(eq(schema.question.formVersionId, draft.id));
    if (input.questions.length) {
      await tx.insert(schema.question).values(input.questions.map((q, i) => normalize(q, i + 1, user.tenantId, draft!.id)));
    }
    await audit({
      tenantId: user.tenantId, actorId: user.id, action: 'form.draft_save', entity: 'form_version', entityId: draft.id,
      diff: { formId, version: draft.version, created, beforeKeys: before, afterKeys: input.questions.map((q) => q.key) }, ip,
    }, tx);
  });
  return getFormDetail(user.tenantId, formId);
}

export async function discardDraft(user: SessionUser, formId: string, ip: string | null) {
  await db.transaction(async (tx) => {
    await lockForm(tx, user.tenantId, formId);
    const [draft] = await tx.select().from(schema.formVersion).where(and(eq(schema.formVersion.formId, formId), eq(schema.formVersion.status, 'draft')));
    if (!draft) throw new HttpError(404, 'ไม่มีร่างให้ยกเลิก');
    // A draft was never used by the bot or by a case, so removing it loses no history.
    await tx.delete(schema.question).where(eq(schema.question.formVersionId, draft.id));
    await tx.delete(schema.formVersion).where(eq(schema.formVersion.id, draft.id));
    await audit({ tenantId: user.tenantId, actorId: user.id, action: 'form.draft_discard', entity: 'form_version', entityId: draft.id, diff: { formId, version: draft.version }, ip }, tx);
  });
  return getFormDetail(user.tenantId, formId);
}

export async function publishDraft(user: SessionUser, formId: string, ip: string | null) {
  await db.transaction(async (tx) => {
    await lockForm(tx, user.tenantId, formId);
    const versions = await tx.select().from(schema.formVersion).where(eq(schema.formVersion.formId, formId));
    const draft = versions.find((v) => v.status === 'draft');
    if (!draft) throw new HttpError(400, 'ไม่มีร่างให้เผยแพร่');
    const qs = await questionsOf(tx, draft.id);
    const errs = validateQuestions(qs.map((q) => ({ ...q, options: q.options ?? null })), true);
    if (errs.length) throw new HttpError(400, errs.join('\n'));
    const prev = versions.filter((v) => v.status === 'published');
    if (prev.length) {
      await tx.update(schema.formVersion).set({ status: 'archived' }).where(inArray(schema.formVersion.id, prev.map((v) => v.id)));
    }
    await tx.update(schema.formVersion).set({ status: 'published', publishedAt: new Date(), publishedBy: user.id }).where(eq(schema.formVersion.id, draft.id));
    await audit({
      tenantId: user.tenantId, actorId: user.id, action: 'form.publish', entity: 'form_version', entityId: draft.id,
      diff: { formId, version: draft.version, archived: prev.map((v) => v.version), questionCount: qs.length }, ip,
    }, tx);
  });
  return getFormDetail(user.tenantId, formId);
}

export async function listTeams(tenantId: string) {
  return db.select({ id: schema.team.id, name: schema.team.name }).from(schema.team).where(eq(schema.team.tenantId, tenantId)).orderBy(asc(schema.team.name));
}
