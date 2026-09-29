/**
 * Form-driven dialog engine (SPEC §3, design 04 §3). Pure: no I/O.
 * step(state, input, ctx) → next state + LINE messages + optional effect.
 */
import type { AnswerValue, Priority, QuestionType, QuestionValidation } from '@/server/db/schema';
import type { LineAction, LineMessage } from './line-types';
import {
  CMD, categoryCarousel, menuActions, optionList, pb, questionBubble, subcategoryPrompt, summary, text,
} from './messages';

export const DRAFT_TTL_MIN = 30;
export const MAX_RETRIES = 3;
const QR_OPTION_MAX = 11; // 13 Quick Reply items minus "ย้อนกลับ" and "ข้าม"

export interface DialogQuestion {
  key: string;
  order: number;
  type: QuestionType;
  label: string;
  shortLabel?: string | null;
  options?: string[] | null;
  required: boolean;
  validation?: QuestionValidation | null;
  showIf?: { key: string; equals: string } | null;
  priorityRules?: Record<string, Priority> | null;
}

export interface DialogForm {
  formVersionId: string | null;
  name: string;
  version: number;
  questions: DialogQuestion[];
}

export interface DialogCategory {
  id: string;
  parentId: string | null;
  name: string;
  hint?: string | null;
  icon?: string | null;
  sortOrder: number;
  formVersionId: string | null;
}

export interface DialogCtx {
  categories: DialogCategory[];
  forms: Record<string, DialogForm>; // keyed by formVersionId
  now: Date;
  contactName: string | null;
}

export type DialogInput =
  | { kind: 'text'; text: string }
  | { kind: 'postback'; data: string; params?: { datetime?: string; date?: string; time?: string } }
  | { kind: 'image'; attachmentId: string }
  | { kind: 'location'; title?: string; address?: string; latitude: number; longitude: number }
  | { kind: 'start' }
  | { kind: 'start_handoff' };

type Phase = 'choose_parent' | 'choose_child' | 'question' | 'summary' | 'edit_pick' | 'resume_prompt' | 'handoff_text';

export interface DialogState {
  v: 1;
  phase: Phase;
  parentId?: string;
  categoryId?: string;
  formVersionId?: string | null;
  qKey?: string;
  answers: Record<string, AnswerValue>;
  asked: string[];
  retries: number;
  editing?: boolean;
  saved?: DialogState;
}

export interface DraftAnswer { key: string; label: string; order: number; value: AnswerValue }

export interface CaseDraft {
  categoryId: string;
  formVersionId: string | null;
  answers: DraftAnswer[];
  requestedPriority?: Priority;
}

export type DialogEffect =
  | { type: 'create_case'; draft: CaseDraft }
  | { type: 'handoff'; categoryId?: string; formVersionId?: string | null; answers: DraftAnswer[]; note?: string };

export interface DialogResult {
  state: DialogState | null;
  messages: LineMessage[];
  effect?: DialogEffect;
}

/** Used when a sub-category has no form yet. */
export const FALLBACK_FORM: DialogForm = {
  formVersionId: null,
  name: 'แจ้งปัญหา',
  version: 0,
  questions: [{ key: 'detail', order: 1, type: 'long_text', label: 'กรุณาเล่าปัญหาที่พบ', required: true }],
};

const fresh = (): DialogState => ({ v: 1, phase: 'choose_parent', answers: {}, asked: [], retries: 0 });
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
const polite = (s: string) => (/(ครับ|คะ|ค่ะ)$/.test(s.trim()) ? s.trim() : `${s.trim()}ครับ`);

// ── Helpers over ctx ──────────────────────────────────────────

const parents = (ctx: DialogCtx) => ctx.categories.filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
const children = (ctx: DialogCtx, parentId: string) =>
  ctx.categories.filter((c) => c.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder);
const cat = (ctx: DialogCtx, id?: string) => ctx.categories.find((c) => c.id === id);

function formOf(state: DialogState, ctx: DialogCtx): DialogForm {
  if (state.formVersionId && ctx.forms[state.formVersionId]) return ctx.forms[state.formVersionId];
  return FALLBACK_FORM;
}

function isVisible(q: DialogQuestion, answers: Record<string, AnswerValue>): boolean {
  if (!q.showIf) return true;
  const a = answers[q.showIf.key];
  return !!a && a.kind === 'choice' && a.value === q.showIf.equals;
}

const sortedQs = (form: DialogForm) => [...form.questions].sort((a, b) => a.order - b.order);
const visibleQs = (form: DialogForm, answers: Record<string, AnswerValue>) => sortedQs(form).filter((q) => isVisible(q, answers));

function nextQuestion(form: DialogForm, answers: Record<string, AnswerValue>, afterKey?: string): DialogQuestion | undefined {
  const qs = sortedQs(form);
  const start = afterKey ? qs.findIndex((q) => q.key === afterKey) + 1 : 0;
  return qs.slice(start).find((q) => isVisible(q, answers));
}

export function answerText(v: AnswerValue | undefined): string {
  if (!v) return '-';
  switch (v.kind) {
    case 'text': return v.text;
    case 'choice': return v.value;
    case 'datetime': return formatThaiDateTime(new Date(v.iso));
    case 'location': return [v.title, v.address].filter(Boolean).join(' · ') || `${v.latitude?.toFixed(5)}, ${v.longitude?.toFixed(5)}`;
    case 'files': return v.attachmentIds.length ? `${v.attachmentIds.length} รูป` : 'ไม่มีไฟล์แนบ';
    case 'skipped': return 'ไม่ระบุ';
  }
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export function formatThaiDateTime(d: Date): string {
  const l = new Date(d.getTime() + 7 * 3600_000);
  const hh = String(l.getUTCHours()).padStart(2, '0');
  const mm = String(l.getUTCMinutes()).padStart(2, '0');
  return `${l.getUTCDate()} ${TH_MONTHS[l.getUTCMonth()]} ${l.getUTCFullYear() + 543} · ${hh}:${mm} น.`;
}

// ── Prompts ───────────────────────────────────────────────────

function promptQuestion(state: DialogState, ctx: DialogCtx, q: DialogQuestion, prefix?: string): LineMessage[] {
  const form = formOf(state, ctx);
  const visible = visibleQs(form, state.answers);
  const idx = Math.max(0, visible.findIndex((x) => x.key === q.key)) + 1;
  // Prototype Main.png / LineConfirm.png: a small header line, then the question.
  const head = `ข้อ ${idx} จาก ${visible.length} · ${form.name}`;
  const pre: LineMessage[] = prefix ? [text(prefix)] : [];
  const back = pb(CMD.back, 'cmd:back');
  const skip = q.required ? [] : [pb(CMD.skip, 'cmd:skip')];
  const ask = (body: string, actions: LineAction[]) => [...pre, questionBubble(head, body, actions)];

  switch (q.type) {
    case 'single_choice': {
      const opts = (q.options ?? []).map((o, i) => pb(o, `ans:${i}`, o));
      if (opts.length <= QR_OPTION_MAX) return ask(polite(q.label), [...opts, ...skip, back]);
      return [...ask(polite(q.label), []), optionList(q.label, opts), text('เลือกจากรายการด้านบนครับ', [...skip, back])];
    }
    case 'datetime': {
      const picker: LineAction = { type: 'datetimepicker', label: 'เลือกวันและเวลา', data: 'dt', mode: 'datetime', ...(q.validation?.notFuture ? { max: toPickerValue(ctx.now) } : {}) };
      return ask(polite(q.label), [picker, pb('เพิ่งเกิดเมื่อสักครู่', 'cmd:now'), ...skip, back]);
    }
    case 'location':
      return ask(`${q.label} กดส่งตำแหน่ง หรือพิมพ์ชื่อสาขา/สถานที่ครับ`, [{ type: 'location', label: 'ส่งตำแหน่ง' }, ...skip, back]);
    case 'attachment': {
      const files = state.answers[q.key];
      const count = files?.kind === 'files' ? files.attachmentIds.length : 0;
      const max = q.validation?.maxFiles ?? 5;
      const tail = q.required ? `ส่งครบแล้วกด "${CMD.done}" ครับ` : `ส่งครบแล้วกด "${CMD.done}" หรือกด "${CMD.skip}" ครับ`;
      return ask(`${q.label} ได้สูงสุด ${max} ไฟล์ ${tail}`, attachmentActions(q, count));
    }
    default: {
      const hints: Partial<Record<QuestionType, string>> = {
        phone: ' (ตัวอย่าง 0812345678)', email: ' (ตัวอย่าง name@example.com)', number: ' (ตัวเลขเท่านั้น)',
      };
      return ask(`${polite(q.label)}${hints[q.type] ?? ''}`, [...skip, back]);
    }
  }
}

function attachmentActions(q: DialogQuestion, count: number): LineAction[] {
  return [
    { type: 'cameraRoll', label: 'เลือกรูป' },
    { type: 'camera', label: 'ถ่ายรูป' },
    ...(count > 0 ? [pb(CMD.done, 'cmd:done')] : []),
    ...(q.required ? [] : count === 0 ? [pb(CMD.skip, 'cmd:skip')] : []),
    pb(CMD.back, 'cmd:back'),
  ];
}

function toPickerValue(d: Date): string {
  const l = new Date(d.getTime() + 7 * 3600_000);
  return l.toISOString().slice(0, 16); // yyyy-MM-ddTHH:mm in Bangkok wall time
}

function categoryPath(ctx: DialogCtx, categoryId?: string): string {
  const c = cat(ctx, categoryId);
  if (!c) return '';
  const p = cat(ctx, c.parentId ?? undefined);
  return p ? `${p.name} › ${c.name}` : c.name;
}

function showSummary(state: DialogState, ctx: DialogCtx): DialogResult {
  const form = formOf(state, ctx);
  const rows = visibleQs(form, state.answers).map((q) => ({ label: q.shortLabel || q.label, value: answerText(state.answers[q.key]) }));
  const s: DialogState = { ...state, phase: 'summary', qKey: undefined, editing: false, retries: 0 };
  return { state: s, messages: [summary(categoryPath(ctx, state.categoryId), rows)] };
}

function ask(state: DialogState, ctx: DialogCtx, q: DialogQuestion | undefined, prefix?: string): DialogResult {
  if (!q) return showSummary(state, ctx);
  const s: DialogState = { ...state, phase: 'question', qKey: q.key, retries: 0 };
  return { state: s, messages: promptQuestion(s, ctx, q, prefix) };
}

function startCategoryPick(ctx: DialogCtx): DialogResult {
  return {
    state: fresh(),
    messages: categoryCarousel(ctx.contactName, parents(ctx).map((c) => ({ id: c.id, name: c.name, hint: c.hint, icon: c.icon }))),
  };
}

function enterCategory(state: DialogState, ctx: DialogCtx, c: DialogCategory): DialogResult {
  const s: DialogState = {
    ...state, categoryId: c.id, formVersionId: c.formVersionId, answers: {}, asked: [], retries: 0,
  };
  const form = formOf(s, ctx);
  return ask(s, ctx, nextQuestion(form, s.answers));
}

function enterParent(state: DialogState, ctx: DialogCtx, p: DialogCategory): DialogResult {
  const kids = children(ctx, p.id);
  const s: DialogState = { ...state, parentId: p.id };
  if (kids.length === 0) return enterCategory(s, ctx, p);
  if (kids.length === 1) return enterCategory(s, ctx, kids[0]);
  return { state: { ...s, phase: 'choose_child' }, messages: subcategoryPrompt(p.name, kids) };
}

function collectAnswers(state: DialogState, ctx: DialogCtx): DraftAnswer[] {
  const form = formOf(state, ctx);
  return visibleQs(form, state.answers)
    .filter((q) => state.answers[q.key])
    .map((q) => ({ key: q.key, label: q.label, order: q.order, value: state.answers[q.key] }));
}

function requestedPriority(state: DialogState, ctx: DialogCtx): Priority | undefined {
  const form = formOf(state, ctx);
  let best: Priority | undefined;
  for (const q of visibleQs(form, state.answers)) {
    const a = state.answers[q.key];
    if (q.priorityRules && a?.kind === 'choice' && q.priorityRules[a.value]) {
      const p = q.priorityRules[a.value];
      if (!best || p < best) best = p;
    }
  }
  return best;
}

// ── Answer validation ─────────────────────────────────────────

type Parsed = { ok: true; value: AnswerValue } | { ok: false; error: string } | { ok: 'partial'; value: AnswerValue; messages: LineMessage[] };

function parseAnswer(q: DialogQuestion, input: DialogInput, state: DialogState, ctx: DialogCtx): Parsed {
  const raw = input.kind === 'text' ? norm(input.text) : '';
  const v = q.validation ?? {};
  switch (q.type) {
    case 'short_text':
    case 'long_text': {
      if (input.kind !== 'text' || !raw) return { ok: false, error: 'กรุณาพิมพ์คำตอบเป็นข้อความครับ' };
      const max = v.maxLength ?? (q.type === 'short_text' ? 200 : 2000);
      if (raw.length > max) return { ok: false, error: `คำตอบยาวเกิน ${max} ตัวอักษรครับ` };
      return { ok: true, value: { kind: 'text', text: input.text.trim() } };
    }
    case 'number': {
      const n = Number(raw.replace(/,/g, ''));
      if (!raw || Number.isNaN(n)) return { ok: false, error: 'กรุณาพิมพ์เป็นตัวเลขครับ' };
      if (v.min != null && n < v.min) return { ok: false, error: `ตัวเลขต้องไม่น้อยกว่า ${v.min} ครับ` };
      if (v.max != null && n > v.max) return { ok: false, error: `ตัวเลขต้องไม่เกิน ${v.max} ครับ` };
      return { ok: true, value: { kind: 'text', text: String(n) } };
    }
    case 'phone': {
      const d = raw.replace(/[\s-]/g, '');
      if (!/^0\d{8,9}$/.test(d)) return { ok: false, error: 'เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0 ครับ' };
      return { ok: true, value: { kind: 'text', text: d } };
    }
    case 'email': {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return { ok: false, error: 'รูปแบบอีเมลไม่ถูกต้องครับ' };
      return { ok: true, value: { kind: 'text', text: raw.toLowerCase() } };
    }
    case 'single_choice': {
      const opts = q.options ?? [];
      if (input.kind === 'postback' && input.data.startsWith('ans:')) {
        const o = opts[Number(input.data.slice(4))];
        if (o !== undefined) return { ok: true, value: { kind: 'choice', value: o } };
      }
      const match = opts.find((o) => norm(o) === raw);
      if (match) return { ok: true, value: { kind: 'choice', value: match } };
      return { ok: false, error: 'กรุณาเลือกจากตัวเลือกที่แสดงครับ' };
    }
    case 'datetime': {
      let d: Date | null = null;
      if (input.kind === 'postback' && input.data === 'dt' && input.params?.datetime) {
        // LINE returns wall-clock time without a zone; treat it as Bangkok (research §7).
        d = new Date(`${input.params.datetime}:00+07:00`);
      } else if (input.kind === 'postback' && input.data === 'cmd:now') {
        d = ctx.now;
      } else if (input.kind === 'text') {
        d = parseThaiDate(raw);
      }
      if (!d || Number.isNaN(d.getTime())) return { ok: false, error: 'กรุณากด "เลือกวันและเวลา" หรือพิมพ์ในรูปแบบ วว/ดด/ปปปป ชช:นน ครับ' };
      if (v.notFuture && d.getTime() > ctx.now.getTime() + 60_000) return { ok: false, error: 'เวลาที่เลือกต้องไม่เกินเวลาปัจจุบันครับ' };
      return { ok: true, value: { kind: 'datetime', iso: d.toISOString() } };
    }
    case 'location': {
      if (input.kind === 'location') {
        return { ok: true, value: { kind: 'location', title: input.title, address: input.address, latitude: input.latitude, longitude: input.longitude } };
      }
      if (input.kind === 'text' && raw) return { ok: true, value: { kind: 'location', title: raw } };
      return { ok: false, error: 'กรุณากดส่งตำแหน่ง หรือพิมพ์ชื่อสถานที่ครับ' };
    }
    case 'attachment': {
      const prev = state.answers[q.key];
      const ids = prev?.kind === 'files' ? prev.attachmentIds : [];
      const max = v.maxFiles ?? 5;
      if (input.kind === 'image') {
        if (ids.length >= max) return { ok: false, error: `แนบได้สูงสุด ${max} รูปครับ กด "${CMD.done}" เพื่อไปต่อ` };
        const next = [...ids, input.attachmentId];
        const value: AnswerValue = { kind: 'files', attachmentIds: next };
        const msg = next.length >= max
          ? `ได้รับรูปครบ ${max} รูปแล้วครับ กด "${CMD.done}" เพื่อไปต่อ`
          : `ได้รับรูปที่ ${next.length} แล้วครับ ส่งเพิ่มได้ หรือกด "${CMD.done}"`;
        return { ok: 'partial', value, messages: [text(msg, attachmentActions(q, next.length))] };
      }
      if ((input.kind === 'postback' && input.data === 'cmd:done') || raw === CMD.done) {
        if (ids.length === 0) return { ok: false, error: q.required ? 'ข้อนี้ต้องแนบรูปอย่างน้อย 1 รูปครับ' : `ยังไม่มีรูปแนบครับ ส่งรูป หรือกด "${CMD.skip}"` };
        return { ok: true, value: { kind: 'files', attachmentIds: ids } };
      }
      return { ok: false, error: 'กรุณาส่งรูปภาพครับ' };
    }
  }
}

/** Accepts "29/09/2569 09:10" (B.E. or C.E.) and "29/9/2026". */
function parseThaiDate(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})[:.](\d{2}))?$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year > 2400) year -= 543;
  const pad = (x: string | number) => String(x).padStart(2, '0');
  return new Date(`${year}-${pad(m[2])}-${pad(m[1])}T${pad(m[4] ?? 0)}:${pad(m[5] ?? 0)}:00+07:00`);
}

// ── Commands ──────────────────────────────────────────────────

type Cmd = 'back' | 'restart' | 'cancel' | 'handoff' | 'skip';

function commandOf(input: DialogInput): Cmd | null {
  if (input.kind === 'postback' && input.data.startsWith('cmd:')) {
    const c = input.data.slice(4);
    if (c === 'back' || c === 'restart' || c === 'cancel' || c === 'handoff' || c === 'skip') return c;
    return null;
  }
  if (input.kind !== 'text') return null;
  const t = norm(input.text);
  if (t === CMD.back) return 'back';
  if (t === CMD.restart) return 'restart';
  if (t === CMD.cancel) return 'cancel';
  if (t === CMD.handoff || t === 'ติดต่อเจ้าหน้าที่') return 'handoff';
  if (t === CMD.skip) return 'skip';
  return null;
}

function goBack(state: DialogState, ctx: DialogCtx): DialogResult {
  switch (state.phase) {
    case 'choose_child':
      return startCategoryPick(ctx);
    case 'question':
    case 'summary': {
      if (state.editing) return showSummary(state, ctx);
      const asked = [...state.asked];
      const prevKey = asked.pop();
      if (!prevKey) {
        const p = cat(ctx, state.parentId);
        if (p && children(ctx, p.id).length > 1) {
          return { state: { ...state, phase: 'choose_child', categoryId: undefined, qKey: undefined }, messages: subcategoryPrompt(p.name, children(ctx, p.id)) };
        }
        return startCategoryPick(ctx);
      }
      const q = formOf(state, ctx).questions.find((x) => x.key === prevKey);
      const answers = { ...state.answers };
      if (q?.type === 'attachment') delete answers[prevKey];
      return ask({ ...state, asked, answers }, ctx, q);
    }
    case 'edit_pick':
      return showSummary(state, ctx);
    default:
      return startCategoryPick(ctx);
  }
}

// ── Main entry ────────────────────────────────────────────────

export function step(state: DialogState | null, input: DialogInput, ctx: DialogCtx): DialogResult {
  if (input.kind === 'start') {
    if (state && state.phase !== 'resume_prompt' && state.phase !== 'handoff_text' && (state.categoryId || state.phase !== 'choose_parent')) {
      return {
        state: { v: 1, phase: 'resume_prompt', answers: {}, asked: [], retries: 0, saved: state },
        messages: [text('คุณมีเรื่องที่แจ้งค้างไว้ ต้องการทำต่อหรือเริ่มใหม่ครับ', [pb('ทำต่อ', 'resume:continue'), pb('เริ่มใหม่', 'resume:restart')])],
      };
    }
    return startCategoryPick(ctx);
  }
  if (input.kind === 'start_handoff') {
    return {
      state: { v: 1, phase: 'handoff_text', answers: {}, asked: [], retries: 0 },
      messages: [text('กรุณาพิมพ์เรื่องที่ต้องการติดต่อเจ้าหน้าที่ได้เลยครับ', [pb(CMD.cancel, 'cmd:cancel')])],
    };
  }
  if (!state) return startCategoryPick(ctx);

  const cmd = commandOf(input);
  if (cmd === 'cancel') return { state: null, messages: [text('ยกเลิกการแจ้งเคสแล้วครับ', menuActions())] };
  if (cmd === 'restart') return startCategoryPick(ctx);
  if (cmd === 'handoff' && state.phase !== 'handoff_text') {
    return {
      state: null,
      messages: [],
      effect: { type: 'handoff', categoryId: state.categoryId, formVersionId: state.formVersionId, answers: collectAnswers(state, ctx) },
    };
  }
  if (cmd === 'back' && state.phase !== 'resume_prompt' && state.phase !== 'handoff_text') return goBack(state, ctx);

  switch (state.phase) {
    case 'handoff_text': {
      if (input.kind !== 'text' || !norm(input.text)) return { state, messages: [text('กรุณาพิมพ์เป็นข้อความครับ', [pb(CMD.cancel, 'cmd:cancel')])] };
      return { state: null, messages: [], effect: { type: 'handoff', answers: [], note: input.text.trim() } };
    }

    case 'resume_prompt': {
      const choice = input.kind === 'postback' ? input.data : input.kind === 'text' ? norm(input.text) : '';
      if ((choice === 'resume:continue' || choice === 'ทำต่อ') && state.saved) return resend(state.saved, ctx);
      if (choice === 'resume:restart' || choice === 'เริ่มใหม่') return startCategoryPick(ctx);
      return { state, messages: [text('กรุณาเลือก "ทำต่อ" หรือ "เริ่มใหม่" ครับ', [pb('ทำต่อ', 'resume:continue'), pb('เริ่มใหม่', 'resume:restart')])] };
    }

    case 'choose_parent': {
      const p = pickCategory(input, parents(ctx));
      if (!p) return { state, messages: [text('กรุณาเลือกหมวดหมู่จากรายการครับ', parents(ctx).slice(0, 12).map((c) => pb(c.name, `cat:${c.id}`, c.name)))] };
      return enterParent(state, ctx, p);
    }

    case 'choose_child': {
      const kids = children(ctx, state.parentId!);
      const c = pickCategory(input, kids);
      if (!c) return { state, messages: subcategoryPrompt(cat(ctx, state.parentId)?.name ?? '', kids) };
      return enterCategory(state, ctx, c);
    }

    case 'question': {
      const form = formOf(state, ctx);
      const q = form.questions.find((x) => x.key === state.qKey);
      if (!q) return showSummary(state, ctx);

      if (cmd === 'skip' && !q.required) {
        const prev = state.answers[q.key];
        const hasFiles = prev?.kind === 'files' && prev.attachmentIds.length > 0;
        if (!hasFiles) return advance(state, ctx, q, { kind: 'skipped' });
      }

      if (input.kind === 'postback' && input.data === 'cmd:retry') return ask(state, ctx, q);

      const parsed = parseAnswer(q, input, state, ctx);
      if (parsed.ok === 'partial') {
        return { state: { ...state, answers: { ...state.answers, [q.key]: parsed.value }, retries: 0 }, messages: parsed.messages };
      }
      if (parsed.ok) return advance(state, ctx, q, parsed.value);

      const retries = state.retries + 1;
      if (retries >= MAX_RETRIES) {
        return {
          state: { ...state, retries: 0 },
          messages: [text(`${parsed.error}\nหากไม่สะดวก ให้เจ้าหน้าที่ช่วยได้ครับ`, [pb(CMD.handoff, 'cmd:handoff'), pb('ลองอีกครั้ง', 'cmd:retry'), pb(CMD.restart, 'cmd:restart')])],
        };
      }
      return { state: { ...state, retries }, messages: promptQuestion(state, ctx, q, parsed.error) };
    }

    case 'summary': {
      const choice = input.kind === 'postback' ? input.data : input.kind === 'text' ? norm(input.text) : '';
      if (choice === 'sum:confirm' || choice === 'ยืนยัน') {
        return {
          state: null,
          messages: [],
          effect: {
            type: 'create_case',
            draft: { categoryId: state.categoryId!, formVersionId: state.formVersionId ?? null, answers: collectAnswers(state, ctx), requestedPriority: requestedPriority(state, ctx) },
          },
        };
      }
      if (choice === 'sum:cancel') return { state: null, messages: [text('ยกเลิกการแจ้งเคสแล้วครับ', menuActions())] };
      if (choice === 'sum:edit' || choice === 'แก้ไขข้อ') {
        const qs = visibleQs(formOf(state, ctx), state.answers).slice(0, 12);
        return {
          state: { ...state, phase: 'edit_pick' },
          messages: [text('ต้องการแก้ไขข้อใดครับ', [...qs.map((q) => pb(q.label, `edit:${q.key}`, q.label)), pb(CMD.back, 'cmd:back')])],
        };
      }
      return { state, messages: [text('กรุณากด "ยืนยันแจ้งเคส" "แก้ไขข้อ" หรือ "ยกเลิก" ในสรุปด้านบนครับ', [pb('ยืนยัน', 'sum:confirm'), pb('แก้ไขข้อ', 'sum:edit'), pb(CMD.cancel, 'sum:cancel')])] };
    }

    case 'edit_pick': {
      const form = formOf(state, ctx);
      const key = input.kind === 'postback' && input.data.startsWith('edit:') ? input.data.slice(5) : undefined;
      const q = form.questions.find((x) => x.key === key)
        ?? (input.kind === 'text' ? form.questions.find((x) => norm(x.label) === norm(input.text)) : undefined);
      if (!q) return { state, messages: [text('กรุณาเลือกข้อที่ต้องการแก้ไขครับ')] };
      const answers = { ...state.answers };
      if (q.type === 'attachment') delete answers[q.key];
      return ask({ ...state, answers, editing: true }, ctx, q);
    }
  }
}

function advance(state: DialogState, ctx: DialogCtx, q: DialogQuestion, value: AnswerValue): DialogResult {
  const answers = { ...state.answers, [q.key]: value };
  const asked = state.asked.includes(q.key) ? state.asked : [...state.asked, q.key];
  const s: DialogState = { ...state, answers, asked, retries: 0 };
  const form = formOf(s, ctx);
  if (state.editing) {
    // An edit can reveal a conditional question that has no answer yet.
    const missing = visibleQs(form, answers).find((x) => !answers[x.key]);
    if (missing) return ask(s, ctx, missing);
    return showSummary(s, ctx);
  }
  return ask(s, ctx, nextQuestion(form, answers, q.key));
}

function resend(state: DialogState, ctx: DialogCtx): DialogResult {
  switch (state.phase) {
    case 'choose_parent': return startCategoryPick(ctx);
    case 'choose_child': {
      const p = cat(ctx, state.parentId);
      return p ? { state, messages: subcategoryPrompt(p.name, children(ctx, p.id)) } : startCategoryPick(ctx);
    }
    case 'question': {
      const q = formOf(state, ctx).questions.find((x) => x.key === state.qKey);
      return q ? { state, messages: promptQuestion(state, ctx, q, 'ทำต่อจากข้อที่ค้างไว้ครับ') } : showSummary(state, ctx);
    }
    default: return showSummary(state, ctx);
  }
}

function pickCategory(input: DialogInput, list: DialogCategory[]): DialogCategory | undefined {
  if (input.kind === 'postback' && input.data.startsWith('cat:')) return list.find((c) => c.id === input.data.slice(4));
  if (input.kind === 'text') return list.find((c) => norm(c.name) === norm(input.text));
  return undefined;
}
