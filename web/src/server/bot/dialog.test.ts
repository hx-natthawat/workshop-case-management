import { describe, expect, it } from 'vitest';
import { step, type DialogCtx, type DialogInput, type DialogResult, type DialogState } from './dialog';
import type { LineMessage } from './line-types';

// Mirrors prototype/mock-data/bot-flow.json ("เข้าระบบไม่ได้" form).
const ctx: DialogCtx = {
  now: new Date('2026-09-29T10:00:00+07:00'),
  contactName: 'สมชาย',
  categories: [
    { id: 'it', parentId: null, name: 'ระบบ IT', hint: 'เข้าระบบ · อีเมล', sortOrder: 1, formVersionId: null },
    { id: 'login', parentId: 'it', name: 'เข้าระบบไม่ได้', sortOrder: 1, formVersionId: 'fv3' },
    { id: 'email', parentId: 'it', name: 'อีเมล', sortOrder: 2, formVersionId: null },
    { id: 'gen', parentId: null, name: 'สอบถามทั่วไป', sortOrder: 4, formVersionId: null },
    { id: 'ask', parentId: 'gen', name: 'สอบถาม', sortOrder: 1, formVersionId: null },
  ],
  forms: {
    fv3: {
      formVersionId: 'fv3', name: 'เข้าระบบไม่ได้', version: 3,
      questions: [
        { order: 1, key: 'system_name', type: 'single_choice', label: 'ระบบที่ใช้งานไม่ได้คือระบบใด', required: true, options: ['ERP', 'อีเมล', 'VPN', 'ระบบอื่น'] },
        { order: 2, key: 'system_other', type: 'short_text', label: 'ระบุชื่อระบบ', required: true, validation: { maxLength: 100 }, showIf: { key: 'system_name', equals: 'ระบบอื่น' } },
        { order: 3, key: 'error_msg', type: 'long_text', label: 'ข้อความ error ที่พบ', required: false },
        { order: 4, key: 'impact', type: 'single_choice', label: 'ปัญหานี้กระทบงานแค่ไหน', required: true, options: ['เฉพาะตัวเอง', 'กระทบงานของทีม', 'ทั้งหน่วยงานใช้งานไม่ได้'], priorityRules: { 'กระทบงานของทีม': 'P2', 'ทั้งหน่วยงานใช้งานไม่ได้': 'P1' } },
        { order: 5, key: 'started_at', type: 'datetime', label: 'เริ่มพบปัญหาเมื่อไร', required: true, validation: { notFuture: true } },
        { order: 6, key: 'screenshot', type: 'attachment', label: 'แนบภาพหน้าจอ error', required: false, validation: { maxFiles: 2 } },
      ],
    },
  },
};

const T = (text: string): DialogInput => ({ kind: 'text', text });
const P = (data: string, params?: Record<string, string>): DialogInput => ({ kind: 'postback', data, params });

function run(inputs: DialogInput[], from: DialogState | null = null): DialogResult {
  let state = from;
  let last: DialogResult = { state, messages: [] };
  for (const i of inputs) {
    last = step(state, i, ctx);
    state = last.state;
  }
  return last;
}

const texts = (msgs: LineMessage[]) => JSON.stringify(msgs);
const qrLabels = (msgs: LineMessage[]) => msgs.flatMap((m) => m.quickReply?.items.map((i) => i.action.label) ?? []);

const toQ1 = [{ kind: 'start' } as DialogInput, P('cat:it'), P('cat:login')];

describe('category selection', () => {
  it('shows the category carousel on start', () => {
    const r = run([{ kind: 'start' }]);
    expect(r.state?.phase).toBe('choose_parent');
    expect(r.messages[1].type).toBe('flex');
  });
  it('asks sub-category, then question 1 of the form with quick replies', () => {
    const r = run(toQ1);
    expect(r.state?.phase).toBe('question');
    expect(texts(r.messages)).toContain('ข้อ 1 จาก 5 · เข้าระบบไม่ได้');
    expect(texts(r.messages)).toContain('ระบบที่ใช้งานไม่ได้คือระบบใดครับ');
    expect(qrLabels(r.messages)).toEqual(['ERP', 'อีเมล', 'VPN', 'ระบบอื่น', 'ย้อนกลับ']);
  });
  it('accepts a typed category name', () => {
    const r = run([{ kind: 'start' }, T('ระบบ IT'), T('เข้าระบบไม่ได้')]);
    expect(r.state?.qKey).toBe('system_name');
  });
  it('skips the sub-category step when there is only one child and falls back to a generic form', () => {
    const r = run([{ kind: 'start' }, P('cat:gen')]);
    expect(r.state?.categoryId).toBe('ask');
    expect(texts(r.messages)).toContain('กรุณาเล่าปัญหาที่พบครับ');
  });
});

describe('answering questions', () => {
  it('walks the whole form to a summary and creates a case with a raised priority', () => {
    const r = run([
      ...toQ1, P('ans:0', undefined), T('Account is locked'), P('ans:2'),
      P('dt', { datetime: '2026-09-29T09:10' }),
      { kind: 'image', attachmentId: 'a1' }, P('cmd:done'),
    ]);
    expect(r.state?.phase).toBe('summary');
    expect(r.messages[0].type).toBe('flex');
    const done = step(r.state, P('sum:confirm'), ctx);
    expect(done.state).toBeNull();
    expect(done.effect?.type).toBe('create_case');
    if (done.effect?.type !== 'create_case') throw new Error();
    expect(done.effect.draft.categoryId).toBe('login');
    expect(done.effect.draft.formVersionId).toBe('fv3');
    expect(done.effect.draft.requestedPriority).toBe('P1');
    expect(done.effect.draft.answers.map((a) => a.key)).toEqual(['system_name', 'error_msg', 'impact', 'started_at', 'screenshot']);
    expect(done.effect.draft.answers.find((a) => a.key === 'started_at')?.value).toEqual({ kind: 'datetime', iso: '2026-09-29T02:10:00.000Z' });
    expect(done.effect.draft.answers.find((a) => a.key === 'screenshot')?.value).toEqual({ kind: 'files', attachmentIds: ['a1'] });
  });

  it('asks the conditional question only when its condition matches', () => {
    const r = run([...toQ1, T('ระบบอื่น')]);
    expect(r.state?.qKey).toBe('system_other');
    const r2 = run([...toQ1, T('ERP')]);
    expect(r2.state?.qKey).toBe('error_msg');
  });

  it('lets optional questions be skipped', () => {
    const r = run([...toQ1, T('ERP'), P('cmd:skip')]);
    expect(r.state?.qKey).toBe('impact');
    expect(r.state?.answers.error_msg).toEqual({ kind: 'skipped' });
  });

  it('rejects a required skip', () => {
    const r = run([...toQ1, T('ข้าม')]);
    expect(r.state?.qKey).toBe('system_name');
    expect(r.state?.retries).toBe(1);
  });

  it('rejects a future datetime', () => {
    const r = run([...toQ1, T('ERP'), P('cmd:skip'), T('เฉพาะตัวเอง'), P('dt', { datetime: '2026-09-30T09:00' })]);
    expect(r.state?.qKey).toBe('started_at');
    expect(texts(r.messages)).toContain('ต้องไม่เกินเวลาปัจจุบัน');
  });

  it('accepts "เพิ่งเกิดเมื่อสักครู่" as now', () => {
    const r = run([...toQ1, T('ERP'), P('cmd:skip'), T('เฉพาะตัวเอง'), P('cmd:now')]);
    expect(r.state?.answers.started_at).toEqual({ kind: 'datetime', iso: ctx.now.toISOString() });
  });

  it('collects images until "เสร็จ" and enforces maxFiles', () => {
    const base = [...toQ1, T('ERP'), P('cmd:skip'), T('เฉพาะตัวเอง'), P('cmd:now')];
    const r = run([...base, { kind: 'image', attachmentId: 'a1' }, { kind: 'image', attachmentId: 'a2' }, { kind: 'image', attachmentId: 'a3' }]);
    expect(r.state?.answers.screenshot).toEqual({ kind: 'files', attachmentIds: ['a1', 'a2'] });
    expect(texts(r.messages)).toContain('แนบได้สูงสุด 2 รูป');
  });

  it('offers a hand-off after 3 invalid answers', () => {
    const r = run([...toQ1, T('x'), T('y'), T('z')]);
    expect(qrLabels(r.messages)).toContain('คุยกับเจ้าหน้าที่');
    expect(r.state?.qKey).toBe('system_name');
  });
});

describe('commands', () => {
  it('ย้อนกลับ re-asks the previous question', () => {
    const r = run([...toQ1, T('ERP'), T('ย้อนกลับ')]);
    expect(r.state?.qKey).toBe('system_name');
  });
  it('ย้อนกลับ on question 1 returns to the sub-category', () => {
    const r = run([...toQ1, T('ย้อนกลับ')]);
    expect(r.state?.phase).toBe('choose_child');
  });
  it('ยกเลิก clears the draft', () => {
    expect(run([...toQ1, T('ยกเลิก')]).state).toBeNull();
  });
  it('เริ่มใหม่ goes back to the category list', () => {
    const r = run([...toQ1, T('ERP'), T('เริ่มใหม่')]);
    expect(r.state?.phase).toBe('choose_parent');
    expect(r.state?.answers).toEqual({});
  });
  it('คุยกับเจ้าหน้าที่ emits a hand-off with the answers so far', () => {
    const r = run([...toQ1, T('ERP'), T('คุยกับเจ้าหน้าที่')]);
    expect(r.state).toBeNull();
    expect(r.effect).toMatchObject({ type: 'handoff', categoryId: 'login', answers: [{ key: 'system_name' }] });
  });
  it('hand-off from the menu takes free text', () => {
    const r = run([{ kind: 'start_handoff' }, T('อยากสอบถามเรื่องบิล')]);
    expect(r.effect).toEqual({ type: 'handoff', answers: [], note: 'อยากสอบถามเรื่องบิล' });
  });
});

describe('summary edits and resume', () => {
  const toSummary = [...toQ1, T('ERP'), P('cmd:skip'), T('เฉพาะตัวเอง'), P('cmd:now'), P('cmd:skip')];

  it('reaches the summary', () => {
    expect(run(toSummary).state?.phase).toBe('summary');
  });

  it('edits one answer and returns to the summary', () => {
    const r = run([...toSummary, P('sum:edit'), P('edit:impact'), T('กระทบงานของทีม')]);
    expect(r.state?.phase).toBe('summary');
    expect(r.state?.answers.impact).toEqual({ kind: 'choice', value: 'กระทบงานของทีม' });
  });

  it('asks a newly revealed conditional question after an edit', () => {
    const r = run([...toSummary, P('sum:edit'), P('edit:system_name'), T('ระบบอื่น')]);
    expect(r.state?.qKey).toBe('system_other');
    const r2 = step(r.state, T('HRIS'), ctx);
    expect(r2.state?.phase).toBe('summary');
  });

  it('drops answers of questions hidden by an edit', () => {
    const r = run([...toQ1, T('ระบบอื่น'), T('HRIS'), P('cmd:skip'), T('เฉพาะตัวเอง'), P('cmd:now'), P('cmd:skip'), P('sum:edit'), P('edit:system_name'), T('ERP'), P('sum:confirm')]);
    if (r.effect?.type !== 'create_case') throw new Error('expected create_case');
    expect(r.effect.draft.answers.map((a) => a.key)).not.toContain('system_other');
  });

  it('asks to continue or restart when starting again with a draft open', () => {
    const mid = run([...toQ1, T('ERP')]);
    const r = step(mid.state, { kind: 'start' }, ctx);
    expect(r.state?.phase).toBe('resume_prompt');
    const cont = step(r.state, P('resume:continue'), ctx);
    expect(cont.state?.qKey).toBe('error_msg');
    const restart = step(r.state, P('resume:restart'), ctx);
    expect(restart.state?.phase).toBe('choose_parent');
  });
});
