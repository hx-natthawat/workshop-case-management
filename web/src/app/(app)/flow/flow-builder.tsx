'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import type { Priority } from '@/server/db/schema';
import { PRIORITY } from '@/server/lib/enums';
import { Button, Chip, Field, Input, Select, buttonClass } from '@/components/ui';
import { CategoryPanel } from './category-panel';
import { LinePreview } from './line-preview';
import { QuestionCard } from './question-card';
import type { Cat, CatNode, EditQ, FormDetailJson, FormSummary, Q, Team } from './types';

const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
const NEW_FORM = '__new__';

let uidSeq = 0;
const withUid = (qs: Q[]): EditQ[] => qs.map((q) => ({ ...q, uid: `q${++uidSeq}` }));
const baseQuestions = (f: FormDetailJson | null) => withUid(f?.draft?.questions ?? f?.published?.questions ?? []);

async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
  return json as T;
}

/** Strip editor-only fields and blank option lines before sending to the API. */
function toPayload(qs: EditQ[]): Q[] {
  return qs.map((eq) => {
    const q: Q & { uid?: string } = { ...eq };
    delete q.uid;
    const options = q.type === 'single_choice' ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : null;
    const rules = options && q.priorityRules
      ? Object.fromEntries(Object.entries(q.priorityRules).filter(([k]) => options.includes(k)))
      : null;
    const validation = q.validation
      ? Object.fromEntries(Object.entries(q.validation).filter(([, v]) => v !== undefined && v !== null && !Number.isNaN(v)))
      : null;
    return { ...q, key: q.key.trim(), label: q.label.trim(), options, priorityRules: rules && Object.keys(rules).length ? rules : null, validation };
  });
}

export function FlowBuilder({ initialCategories, initialForms, teams, initialSelectedId, initialForm, simulatorEnabled }: {
  initialCategories: CatNode[];
  initialForms: FormSummary[];
  teams: Team[];
  initialSelectedId: string | null;
  initialForm: FormDetailJson | null;
  simulatorEnabled: boolean;
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [forms, setForms] = useState(initialForms);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [form, setForm] = useState<FormDetailJson | null>(initialForm);
  const [questions, setQuestions] = useState<EditQ[]>(() => baseQuestions(initialForm));
  const [dirty, setDirty] = useState(false);
  const [selQ, setSelQ] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [rename, setRename] = useState<{ id: string; name: string; hint: string } | null>(null);

  const all: Cat[] = categories.flatMap((p) => [p, ...p.children]);
  const selected = all.find((c) => c.id === selectedId) ?? null;
  const parent = selected?.parentId ? categories.find((p) => p.id === selected.parentId) ?? null : null;
  const siblings: Cat[] = selected ? (selected.parentId ? parent?.children ?? [] : categories) : [];
  const sibIndex = selected ? siblings.findIndex((s) => s.id === selected.id) : -1;
  const selIndex = questions.findIndex((q) => q.uid === selQ);

  async function run<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if (ok) setNotice(ok);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const reloadCategories = async () => setCategories((await api<{ categories: CatNode[] }>('/api/categories')).categories);
  const reloadForms = async () => setForms((await api<{ forms: FormSummary[] }>('/api/forms')).forms);

  function loadForm(f: FormDetailJson | null, keepIndex = -1) {
    const qs = baseQuestions(f);
    setForm(f);
    setQuestions(qs);
    setDirty(false);
    setSelQ(qs[keepIndex]?.uid ?? null);
  }

  async function select(id: string) {
    if (id === selectedId) return;
    if (dirty && !window.confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้โดยไม่บันทึกหรือไม่')) return;
    setSelectedId(id);
    setRename(null);
    setError(null);
    setNotice(null);
    const c = all.find((x) => x.id === id);
    if (!c?.formId) return loadForm(null);
    if (c.formId === form?.id) return loadForm(form);
    await run(async () => loadForm((await api<{ form: FormDetailJson }>(`/api/forms/${c.formId}`)).form));
  }

  async function patchCategory(patch: Record<string, unknown>, ok = 'บันทึกหมวดหมู่แล้ว') {
    if (!selected) return;
    await run(async () => {
      await api(`/api/categories/${selected.id}`, 'PATCH', patch);
      await reloadCategories();
    }, ok);
  }

  async function createCategory(name: string, parentId: string | null) {
    const r = await run(async () => {
      const { category } = await api<{ category: Cat }>('/api/categories', 'POST', { name, parentId });
      await reloadCategories();
      return category;
    }, 'เพิ่มหมวดหมู่แล้ว');
    if (r) {
      setSelectedId(r.id);
      loadForm(null);
    }
    return !!r;
  }

  async function chooseForm(value: string) {
    if (!selected) return;
    if (dirty && !window.confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการเปลี่ยนแบบฟอร์มโดยไม่บันทึกหรือไม่')) return;
    await run(async () => {
      let formId: string | null = value || null;
      if (value === NEW_FORM) {
        const { form: created } = await api<{ form: FormSummary }>('/api/forms', 'POST', { name: selected.name });
        formId = created.id;
        await reloadForms();
      }
      await api(`/api/categories/${selected.id}`, 'PATCH', { formId });
      await reloadCategories();
      loadForm(formId ? (await api<{ form: FormDetailJson }>(`/api/forms/${formId}`)).form : null);
    }, value === NEW_FORM ? 'สร้างแบบฟอร์มใหม่แล้ว เพิ่มคำถามแล้วกดเผยแพร่เพื่อเริ่มใช้งาน' : 'เปลี่ยนแบบฟอร์มแล้ว');
  }

  function updateQ(uid: string, patch: Partial<EditQ>) {
    setQuestions((qs) => {
      const old = qs.find((q) => q.uid === uid);
      return qs.map((q) => {
        if (q.uid === uid) return { ...q, ...patch };
        // Keep show-if references pointing at a renamed key
        if (old && patch.key !== undefined && q.showIf?.key === old.key) return { ...q, showIf: { ...q.showIf, key: patch.key } };
        return q;
      });
    });
    setDirty(true);
  }

  function moveQ(i: number, dir: -1 | 1) {
    setQuestions((qs) => {
      const next = [...qs];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
    setDirty(true);
  }

  function deleteQ(uid: string) {
    const q = questions.find((x) => x.uid === uid);
    if (!q) return;
    const deps = questions.filter((x) => x.showIf?.key === q.key);
    const msg = deps.length
      ? `ลบคำถาม "${q.label || q.key}" และล้างเงื่อนไขของ ${deps.length} ข้อที่อ้างถึงคำถามนี้หรือไม่`
      : `ลบคำถาม "${q.label || q.key}" หรือไม่`;
    if (!window.confirm(msg)) return;
    setQuestions((qs) => qs.filter((x) => x.uid !== uid).map((x) => (x.showIf?.key === q.key ? { ...x, showIf: null } : x)));
    setSelQ(null);
    setDirty(true);
  }

  function addQ() {
    const keys = new Set(questions.map((q) => q.key));
    let n = questions.length + 1;
    while (keys.has(`question_${n}`)) n++;
    const [q] = withUid([{ key: `question_${n}`, type: 'short_text', label: '', required: true, options: null, validation: null, showIf: null, priorityRules: null }]);
    setQuestions((qs) => [...qs, q]);
    setSelQ(q.uid);
    setDirty(true);
    setTimeout(() => document.getElementById(`q-${q.uid}-label`)?.focus(), 50);
  }

  async function saveDraft() {
    if (!form) return null;
    const r = await run(async () => (await api<{ form: FormDetailJson }>(`/api/forms/${form.id}/draft`, 'PUT', { questions: toPayload(questions) })).form, 'บันทึกร่างแล้ว');
    if (r) {
      loadForm(r, selIndex);
      await reloadForms().catch(() => {});
    }
  }

  async function publish() {
    if (!form) return;
    setConfirmPublish(false);
    const r = await run(async () => {
      if (dirty || !form.draft) {
        await api(`/api/forms/${form.id}/draft`, 'PUT', { questions: toPayload(questions) });
      }
      const res = (await api<{ form: FormDetailJson }>(`/api/forms/${form.id}/publish`, 'POST')).form;
      await reloadForms();
      return res;
    }, 'เผยแพร่แล้ว บทสนทนาที่เริ่มหลังจากนี้จะใช้เวอร์ชันใหม่');
    if (r) loadForm(r);
  }

  async function discardDraft() {
    if (!form) return;
    if (!form.draft) return loadForm(form); // only unsaved local edits
    if (!window.confirm(`ยกเลิกร่าง v${form.draft.version} และกลับไปใช้คำถามของเวอร์ชันที่เผยแพร่อยู่หรือไม่`)) return;
    const r = await run(async () => (await api<{ form: FormDetailJson }>(`/api/forms/${form.id}/draft`, 'DELETE')).form, 'ยกเลิกร่างแล้ว');
    if (r) {
      loadForm(r);
      await reloadForms().catch(() => {});
    }
  }

  const nextVersion = form ? form.draft?.version ?? form.maxVersion + 1 : null;
  const hasChanges = !!form && (dirty || !!form.draft);
  const previewQ = selIndex >= 0 ? questions[selIndex] : questions[0] ?? null;
  const previewIdx = selIndex >= 0 ? selIndex + 1 : 1;
  const formUsers = form ? all.filter((c) => c.formId === form.id && c.id !== selected?.id) : [];
  const crumb = parent?.name ?? (selected && !selected.parentId ? selected.name : null);

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:min-h-0">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-6 py-4">
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <span className="text-[12.5px] text-muted">Bot Flow{crumb ? ` › ${crumb}` : ''}</span>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[20px] font-semibold leading-[1.3]">
              {form ? `แบบฟอร์ม: ${form.name}` : selected ? `หมวด: ${selected.name}` : 'Bot Flow'}
            </h1>
            {form && hasChanges && <Chip tone="warning" className="px-2">Draft v{nextVersion} · {dirty ? 'ยังไม่บันทึก' : 'ยังไม่ publish'}</Chip>}
            {form && (form.published ? <Chip tone="success" className="px-2">ใช้งานอยู่: v{form.published.version}</Chip> : <Chip tone="neutral" className="px-2">ยังไม่เคย publish</Chip>)}
            {formUsers.length > 0 && <span className="text-[12px] text-muted">ใช้ร่วมกับหมวด {formUsers.map((c) => c.name).join(', ')}</span>}
          </div>
        </div>
        {form && dirty && <Button onClick={saveDraft} disabled={busy}>บันทึกร่าง</Button>}
        {form && hasChanges && <Button variant="ghost" onClick={discardDraft} disabled={busy}>ยกเลิกร่าง</Button>}
        <Button disabled title="ประวัติ version จะเปิดใช้ใน Phase 2">
          ประวัติ version<Phase2 />
        </Button>
        {simulatorEnabled ? (
          <a href="/simulator" target="_blank" rel="noopener noreferrer" className={buttonClass('secondary')}>ทดสอบใน LINE</a>
        ) : (
          <Button disabled title="เปิด LINE Simulator ด้วย SIMULATOR_ENABLED=true">ทดสอบใน LINE</Button>
        )}
        {form && (
          <Button variant="primary" className="px-4 font-semibold" onClick={() => setConfirmPublish(true)} disabled={busy || !hasChanges || questions.length === 0}>
            {hasChanges ? `Publish v${nextVersion}` : 'Publish'}
          </Button>
        )}
      </header>

      {(error || notice) && (
        <div role={error ? 'alert' : 'status'} className={`mx-6 mt-3 whitespace-pre-line rounded-md px-4 py-2.5 text-[13px] ${error ? 'bg-critical-tint text-critical' : 'bg-success-tint text-success'}`}>
          {error ?? notice}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_320px]">
        <aside className="border-b border-border bg-surface lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <CategoryPanel categories={categories} selectedId={selectedId} onSelect={(id) => void select(id)} onCreate={createCategory} busy={busy} />
        </aside>

        <section aria-label="คำถามในแบบฟอร์ม" className="@container flex min-w-0 flex-col gap-3 px-6 py-5 lg:overflow-y-auto">
          {!selected ? (
            <p className="py-12 text-center text-[14px] text-muted">ยังไม่มีหมวดหมู่ กด &quot;+ เพิ่ม&quot; เพื่อสร้างหมวดหลัก</p>
          ) : (
            <div className="rounded-[10px] border border-border bg-surface px-4 py-3.5">
              <div className="grid gap-3 @lg:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold text-muted">Priority เริ่มต้น</span>
                  <Select value={selected.defaultPriority} disabled={busy} className="text-[13.5px]" onChange={(e) => void patchCategory({ defaultPriority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p} {PRIORITY[p].label}</option>)}
                  </Select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold text-muted">ทีมที่รับเรื่อง</span>
                  <Select value={selected.defaultTeamId ?? ''} disabled={busy} className="text-[13.5px]" onChange={(e) => void patchCategory({ defaultTeamId: e.target.value || null })}>
                    <option value="">ไม่ระบุ</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </label>
                <label className="flex flex-col gap-1.5" title="FAQ ก่อนเปิดเคสจะเปิดใช้ใน Phase 2">
                  <span className="flex items-center text-[12px] font-semibold text-muted">FAQ ก่อนเปิดเคส<Phase2 /></span>
                  <Select disabled value="" className="text-[13.5px]">
                    <option value="">ไม่แสดง FAQ</option>
                  </Select>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-divider pt-3">
                {rename?.id === selected.id ? (
                  <form className="flex flex-1 flex-wrap items-end gap-2" onSubmit={(e) => {
                    e.preventDefault();
                    if (!rename.name.trim()) return;
                    void patchCategory({ name: rename.name.trim(), hint: rename.hint.trim() || null }).then(() => setRename(null));
                  }}>
                    <Field label="ชื่อหมวด" htmlFor="cat-name"><Input id="cat-name" autoFocus value={rename.name} maxLength={100} onChange={(e) => setRename({ ...rename, name: e.target.value })} /></Field>
                    {!selected.parentId && (
                      <Field label="คำอธิบายใต้ชื่อหมวด (แสดงใน LINE)" htmlFor="cat-hint"><Input id="cat-hint" value={rename.hint} maxLength={200} onChange={(e) => setRename({ ...rename, hint: e.target.value })} /></Field>
                    )}
                    <Button type="submit" variant="primary" size="sm" disabled={busy}>บันทึก</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRename(null)}>ยกเลิก</Button>
                  </form>
                ) : (
                  <>
                    <div className="flex w-full items-center gap-2">
                      <div className="min-w-0 grow truncate text-[13px]">
                        <span className="font-semibold">{selected.parentId ? 'หมวดย่อย' : 'หมวดหลัก'}: {selected.name}</span>
                        {selected.hint && <span className="text-muted"> · {selected.hint}</span>}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setRename({ id: selected.id, name: selected.name, hint: selected.hint ?? '' })}>เปลี่ยนชื่อ</Button>
                    </div>
                    {selected.parentId && (
                      <label className="flex items-center gap-2 whitespace-nowrap text-[12px] font-semibold text-muted">
                        แบบฟอร์มที่ใช้
                        <Select value={selected.formId ?? ''} disabled={busy} className="h-8 w-52 text-[13px] font-normal text-text" onChange={(e) => void chooseForm(e.target.value)}>
                          <option value="">ไม่ใช้แบบฟอร์ม</option>
                          {forms.map((f) => (
                            <option key={f.id} value={f.id}>{f.name}{f.publishedVersion ? ` (v${f.publishedVersion})` : ' (ยังไม่ publish)'}</option>
                          ))}
                          <option value={NEW_FORM}>+ สร้างแบบฟอร์มใหม่</option>
                        </Select>
                      </label>
                    )}
                    <span className="grow" />
                    <Button size="sm" variant="ghost" aria-label="เลื่อนหมวดขึ้น" disabled={busy || sibIndex <= 0} onClick={() => void patchCategory({ move: 'up' }, 'เรียงลำดับแล้ว')}><ArrowUp className="size-4" /></Button>
                    <Button size="sm" variant="ghost" aria-label="เลื่อนหมวดลง" disabled={busy || sibIndex < 0 || sibIndex >= siblings.length - 1} onClick={() => void patchCategory({ move: 'down' }, 'เรียงลำดับแล้ว')}><ArrowDown className="size-4" /></Button>
                    <label className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={selected.isActive} disabled={busy}
                        onChange={(e) => void patchCategory({ isActive: e.target.checked }, e.target.checked ? 'เปิดใช้งานหมวดแล้ว' : 'ปิดใช้งานหมวดแล้ว บอทจะไม่แสดงหมวดนี้')} />
                      เปิดใช้งาน
                    </label>
                  </>
                )}
              </div>
              {selected.parentId && selected.formId && form && !form.published && (
                <p className="mt-3 text-[12px] text-warning">แบบฟอร์มนี้ยังไม่ได้ publish บอทจะยังไม่ถามคำถามในหมวดนี้จนกว่าจะ publish</p>
              )}
            </div>
          )}

          {selected && !selected.parentId && (
            <p className="text-[13px] text-muted">เลือกหมวดย่อยทางซ้ายเพื่อแก้ไขคำถามของแบบฟอร์ม หมวดย่อยใหม่จะใช้ Priority และทีมของหมวดหลักเป็นค่าเริ่มต้น</p>
          )}
          {selected?.parentId && !selected.formId && (
            <p className="text-[13px] text-muted">หมวดนี้ยังไม่มีแบบฟอร์ม บอทจะเปิดเคสทันทีหลังผู้แจ้งเลือกหมวด เลือกแบบฟอร์มหรือสร้างแบบฟอร์มใหม่ด้านบน</p>
          )}

          {form && (
            <>
              <div className="flex items-center gap-3">
                <h2 className="grow text-[15px] font-semibold">คำถาม {questions.length} ข้อ · bot ถามตามลำดับนี้</h2>
                <Button onClick={addQ} disabled={busy || questions.length >= 50}>+ เพิ่มคำถาม</Button>
              </div>
              {questions.length === 0 ? (
                <p className="rounded-[10px] border border-dashed border-border-strong px-6 py-10 text-center text-[14px] text-muted">ยังไม่มีคำถาม กด &quot;+ เพิ่มคำถาม&quot; เพื่อเริ่ม</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {questions.map((q, i) => (
                    <QuestionCard
                      key={q.uid}
                      q={q}
                      index={i}
                      all={questions}
                      selected={selQ === q.uid}
                      onSelect={() => setSelQ(selQ === q.uid ? null : q.uid)}
                      onChange={(p) => updateQ(q.uid, p)}
                      onMove={(d) => moveQ(i, d)}
                      onDelete={() => deleteQ(q.uid)}
                      readOnly={busy}
                    />
                  ))}
                </ol>
              )}
            </>
          )}
        </section>

        <aside aria-label="ตัวอย่างใน LINE" className="flex flex-col border-t border-border bg-surface p-5 lg:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0">
          <LinePreview q={form ? previewQ : null} index={previewIdx} total={questions.length} />
        </aside>
      </div>

      {confirmPublish && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmPublish(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="publish-title" className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 id="publish-title" className="text-[18px] font-semibold">Publish แบบฟอร์ม v{nextVersion}</h2>
            <div className="mt-3 space-y-2 text-[14px] text-text-2">
              <p>แบบฟอร์ม &quot;{form.name}&quot; จำนวน {questions.length} คำถาม จะเริ่มใช้งานทันที{form.published ? ` แทน v${form.published.version}` : ''}</p>
              <p>บทสนทนาที่เริ่มหลัง publish เท่านั้นที่ใช้เวอร์ชันใหม่ ผู้แจ้งที่กำลังตอบคำถามอยู่จะใช้เวอร์ชันเดิมจนจบ และเคสที่เปิดแล้วยังเก็บคำตอบตามเวอร์ชันเดิม</p>
              {formUsers.length > 0 && <p>แบบฟอร์มนี้ใช้ร่วมกับหมวด {formUsers.map((c) => c.name).join(', ')} ด้วย</p>}
              {dirty && <p className="text-warning">การแก้ไขที่ยังไม่บันทึกจะถูกบันทึกเป็นร่างก่อน publish</p>}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setConfirmPublish(false)}>ยกเลิก</Button>
              <Button variant="primary" autoFocus onClick={() => void publish()}>ยืนยัน Publish</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small tag for prototype features scheduled after the MVP. */
function Phase2() {
  return <span className="ml-1.5 rounded-full bg-neutral-tint px-1.5 text-[11px] font-medium leading-[18px] text-neutral">Phase 2</span>;
}
