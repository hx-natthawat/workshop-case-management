'use client';

import clsx from 'clsx';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { Priority, QuestionType, QuestionValidation } from '@/server/db/schema';
import { Button, Chip, Field, Input, Select, Textarea } from '@/components/ui';
import { KEY_RE, TYPE_LABEL, type EditQ } from './types';

const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];

export function QuestionCard({ q, index, all, selected, onSelect, onChange, onMove, onDelete, readOnly }: {
  q: EditQ;
  index: number;
  all: EditQ[];
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<EditQ>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  readOnly: boolean;
}) {
  const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
  const hasRules = q.type === 'single_choice' && q.priorityRules && Object.keys(q.priorityRules).length > 0;
  const keyDup = all.some((o) => o.uid !== q.uid && o.key === q.key);
  const keyErr = !KEY_RE.test(q.key) ? 'ใช้ a-z 0-9 _ ขึ้นต้นด้วยตัวอักษร ยาว 2–40 ตัว' : keyDup ? 'key ซ้ำกับคำถามอื่น' : null;
  const earlierChoices = all.slice(0, index).filter((p) => p.type === 'single_choice' && p.key);
  const ref = q.showIf ? all.slice(0, index).find((p) => p.key === q.showIf!.key) : undefined;
  const setV = (patch: Partial<QuestionValidation>) => onChange({ validation: { ...(q.validation ?? {}), ...patch } });
  const num = (s: string) => (s === '' ? undefined : Number(s));
  const id = `q-${q.uid}`;

  return (
    <li className={clsx('flex flex-col rounded-[10px] border bg-surface', selected ? 'border-accent ring-1 ring-accent' : 'border-border')}>
      <button type="button" onClick={onSelect} aria-expanded={selected} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
        <span className="tabular inline-flex size-6 shrink-0 items-center justify-center rounded-sm bg-neutral-tint text-[12px] font-semibold">{index + 1}</span>
        <span className="flex min-w-0 grow flex-col">
          <span className="truncate text-[14px] font-medium">{q.label || <span className="text-disabled">(ยังไม่มีข้อความคำถาม)</span>}</span>
          <span className="text-[12px] text-muted">
            {TYPE_LABEL[q.type]} · <span className="font-mono">{q.key}</span> · {q.required ? 'บังคับตอบ' : 'ไม่บังคับ'}
          </span>
        </span>
        {q.showIf && <Chip tone="info" className="max-w-[45%] truncate px-2">แสดงเมื่อ {q.showIf.key} = {q.showIf.equals}</Chip>}
        {hasRules && <Chip tone="info" className="px-2">ปรับ Priority</Chip>}
      </button>

      {selected && (
        <div className="flex flex-col gap-3 px-3.5 pb-3.5 pt-1 @md:pl-[50px]">
          <fieldset disabled={readOnly} className="flex flex-col gap-3">
            <div className="grid gap-3 @md:grid-cols-2">
              <Field label={<span className="text-muted">ข้อความคำถาม</span>} htmlFor={`${id}-label`} error={q.label.trim() ? null : 'กรุณาระบุข้อความคำถาม'}>
                <Input id={`${id}-label`} value={q.label} className="text-[13.5px]" onChange={(e) => onChange({ label: e.target.value })} maxLength={300} />
              </Field>
              <Field label={<span className="text-muted">ชื่อย่อในสรุปก่อนยืนยัน</span>} htmlFor={`${id}-short`} hint="แสดงในการ์ด &quot;ตรวจสอบข้อมูลก่อนส่ง&quot; เช่น ผลกระทบ · เว้นว่างเพื่อใช้ข้อความคำถาม">
                <Input id={`${id}-short`} value={q.shortLabel ?? ''} className="text-[13.5px]" onChange={(e) => onChange({ shortLabel: e.target.value })} maxLength={40} />
              </Field>
              <Field label={<span className="text-muted">ชนิดคำถาม</span>} htmlFor={`${id}-type`}>
                <Select id={`${id}-type`} value={q.type} className="text-[13.5px]" onChange={(e) => {
                  const type = e.target.value as QuestionType;
                  onChange({ type, options: type === 'single_choice' ? (q.options?.length ? q.options : ['', '']) : q.options });
                }}>
                  {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <Field label={<span className="text-muted">Key (ใช้อ้างอิงในรายงานและเงื่อนไข)</span>} htmlFor={`${id}-key`} error={keyErr}>
                <Input id={`${id}-key`} value={q.key} className="font-mono text-[13px]" maxLength={40}
                  onChange={(e) => onChange({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
              </Field>
            </div>

            {q.type === 'single_choice' && (
              <>
                <Field label={<span className="text-muted">ตัวเลือก (แสดงเป็น Quick Reply)</span>} htmlFor={`${id}-opts`}
                  error={opts.length < 2 ? 'ต้องมีอย่างน้อย 2 ตัวเลือก' : new Set(opts).size !== opts.length ? 'มีตัวเลือกซ้ำกัน' : null}
                  hint={opts.some((o) => o.length > 20) ? 'ปุ่ม Quick Reply แสดงได้ 20 ตัวอักษร ตัวเลือกที่ยาวกว่านี้จะถูกตัด' : 'บรรทัดละ 1 ตัวเลือก'}>
                  <Textarea id={`${id}-opts`} className="text-[13.5px]" rows={Math.max(3, (q.options ?? []).length)} value={(q.options ?? []).join('\n')}
                    onChange={(e) => onChange({ options: e.target.value.split('\n') })} />
                </Field>
                {opts.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[12px] font-semibold text-muted">กติกาหลังตอบ <span className="font-normal">· ปรับ Priority ตามคำตอบ (ไม่บังคับ)</span></p>
                    <div className="grid gap-x-4 gap-y-2 @md:grid-cols-2">
                      {opts.map((o) => (
                        <label key={o} className="flex items-center gap-2 text-[13px]">
                          <span className="min-w-0 flex-1 truncate">{o}</span>
                          <Select className="h-8 w-28 text-[13px]" value={q.priorityRules?.[o] ?? ''} aria-label={`Priority เมื่อเลือก ${o}`}
                            onChange={(e) => {
                              const next = { ...(q.priorityRules ?? {}) };
                              if (e.target.value) next[o] = e.target.value as Priority; else delete next[o];
                              onChange({ priorityRules: next });
                            }}>
                            <option value="">ไม่เปลี่ยน</option>
                            {PRIORITIES.map((p) => <option key={p} value={p}>→ {p}</option>)}
                          </Select>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {(q.type === 'short_text' || q.type === 'long_text') && (
              <Field label={<span className="text-muted">กติกาหลังตอบ · ความยาวสูงสุด (ตัวอักษร)</span>} htmlFor={`${id}-maxlen`} hint={`เว้นว่างเพื่อใช้ค่าเริ่มต้น ${q.type === 'short_text' ? 200 : 2000}`}>
                <Input id={`${id}-maxlen`} type="number" min={1} max={5000} className="w-40" value={q.validation?.maxLength ?? ''} onChange={(e) => setV({ maxLength: num(e.target.value) })} />
              </Field>
            )}
            {q.type === 'number' && (
              <div className="flex gap-4">
                <Field label={<span className="text-muted">ค่าต่ำสุด</span>} htmlFor={`${id}-min`}>
                  <Input id={`${id}-min`} type="number" className="w-32" value={q.validation?.min ?? ''} onChange={(e) => setV({ min: num(e.target.value) })} />
                </Field>
                <Field label={<span className="text-muted">ค่าสูงสุด</span>} htmlFor={`${id}-max`}>
                  <Input id={`${id}-max`} type="number" className="w-32" value={q.validation?.max ?? ''} onChange={(e) => setV({ max: num(e.target.value) })} />
                </Field>
              </div>
            )}
            {q.type === 'datetime' && (
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={!!q.validation?.notFuture} onChange={(e) => setV({ notFuture: e.target.checked })} />
                ห้ามเลือกเวลาในอนาคต
              </label>
            )}
            {q.type === 'attachment' && (
              <Field label={<span className="text-muted">กติกาหลังตอบ · จำนวนไฟล์สูงสุด</span>} htmlFor={`${id}-maxfiles`} hint="1–10 ไฟล์ (รูป วิดีโอ เสียง หรือเอกสาร ไม่เกิน 50 MB ต่อไฟล์ · ค่าเริ่มต้น 5)">
                <Input id={`${id}-maxfiles`} type="number" min={1} max={10} className="w-32" value={q.validation?.maxFiles ?? ''} onChange={(e) => setV({ maxFiles: num(e.target.value) })} />
              </Field>
            )}

            <div className="space-y-1.5">
              <p className="text-[12px] font-semibold text-muted">เงื่อนไขการแสดง</p>
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Select className="h-8 w-56 text-[13px]" aria-label="แสดงเมื่อคำถาม" value={q.showIf?.key ?? ''}
                  onChange={(e) => {
                    const k = e.target.value;
                    const p = earlierChoices.find((c) => c.key === k);
                    onChange({ showIf: k && p ? { key: k, equals: (p.options ?? []).map((o) => o.trim()).filter(Boolean)[0] ?? '' } : null });
                  }}>
                  <option value="">แสดงทุกครั้ง</option>
                  {earlierChoices.map((c) => <option key={c.uid} value={c.key}>แสดงเมื่อ {c.key}</option>)}
                </Select>
                {q.showIf && (
                  <>
                    <span>=</span>
                    <Select className="h-8 w-56 text-[13px]" aria-label="ตัวเลือกที่ทำให้แสดง" value={q.showIf.equals}
                      onChange={(e) => onChange({ showIf: { key: q.showIf!.key, equals: e.target.value } })}>
                      {(ref?.options ?? []).map((o) => o.trim()).filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  </>
                )}
              </div>
              {q.showIf && (!ref || ref.type !== 'single_choice') && <p className="text-[12px] text-critical">คำถามที่อ้างถึงต้องเป็นแบบตัวเลือกเดียวและอยู่ก่อนข้อนี้</p>}
              {!earlierChoices.length && !q.showIf && <p className="text-[12px] text-muted">ต้องมีคำถามแบบตัวเลือกเดียวก่อนหน้าจึงจะตั้งเงื่อนไขได้</p>}
            </div>
            <label className="flex items-center gap-2 text-[13.5px]">
              <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={q.required} onChange={(e) => onChange({ required: e.target.checked })} />
              บังคับตอบ
            </label>
          </fieldset>

          {!readOnly && (
            <div className="flex flex-wrap gap-2 border-t border-divider pt-3">
              <Button size="sm" onClick={() => onMove(-1)} disabled={index === 0}><ArrowUp className="size-3.5" />เลื่อนขึ้น</Button>
              <Button size="sm" onClick={() => onMove(1)} disabled={index === all.length - 1}><ArrowDown className="size-3.5" />เลื่อนลง</Button>
              <span className="flex-1" />
              <Button size="sm" variant="danger" onClick={onDelete}><Trash2 className="size-3.5" />ลบคำถาม</Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
