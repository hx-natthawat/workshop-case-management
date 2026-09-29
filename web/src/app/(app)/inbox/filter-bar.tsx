'use client';

import clsx from 'clsx';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface Opt { id?: string; code?: string; name?: string; label?: string }

export function FilterBar({ values, categories, assignees, statuses, priorities }: {
  values: Record<'status' | 'priority' | 'categoryId' | 'assigneeId' | 'sla' | 'sort', string>;
  categories: Opt[]; assignees: Opt[]; statuses: Opt[]; priorities: Opt[];
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v); else p.delete(k);
    p.delete('page');
    router.push(`${path}?${p.toString()}`);
  };
  const sel = 'h-9 rounded-md border border-border-strong bg-surface px-3 pr-8 text-[14px] focus:border-accent focus:outline-none';
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label className="sr-only" htmlFor="f-status">สถานะ</label>
      <select id="f-status" className={sel} value={values.status} onChange={(e) => set('status', e.target.value === 'open' ? '' : e.target.value)}>
        <option value="open">สถานะ: ยังไม่ปิด</option>
        <option value="all">สถานะ: ทั้งหมด</option>
        {statuses.map((s) => <option key={s.code} value={s.code}>สถานะ: {s.label}</option>)}
      </select>
      <label className="sr-only" htmlFor="f-cat">หมวด</label>
      <select id="f-cat" className={sel} value={values.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
        <option value="">หมวด: ทั้งหมด</option>
        {categories.map((c) => <option key={c.id} value={c.id}>หมวด: {c.name}</option>)}
      </select>
      <label className="sr-only" htmlFor="f-pri">Priority</label>
      <select id="f-pri" className={sel} value={values.priority} onChange={(e) => set('priority', e.target.value)}>
        <option value="">Priority: ทั้งหมด</option>
        {priorities.map((p) => <option key={p.code} value={p.code}>Priority: {p.label}</option>)}
      </select>
      {assignees.length > 0 && (
        <>
          <label className="sr-only" htmlFor="f-asg">ผู้รับผิดชอบ</label>
          <select id="f-asg" className={sel} value={values.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
            <option value="">ผู้รับผิดชอบ: ทั้งหมด</option>
            {assignees.map((a) => <option key={a.id} value={a.id}>ผู้รับผิดชอบ: {a.name}</option>)}
          </select>
        </>
      )}
      <button type="button" aria-pressed={values.sla === 'risk'} onClick={() => set('sla', values.sla === 'risk' ? '' : 'risk')}
        className={clsx('h-9 rounded-md border px-3 text-[14px] font-medium', values.sla === 'risk' ? 'border-warning bg-warning text-white' : 'border-warning text-warning hover:bg-warning-tint')}>
        ใกล้เกินหรือเกิน SLA
      </button>
      <span className="ml-auto flex items-center gap-2 text-[13px] text-muted">
        <label htmlFor="f-sort">เรียงตาม</label>
        <select id="f-sort" className={sel} value={values.sort} onChange={(e) => set('sort', e.target.value === 'sla' ? '' : e.target.value)}>
          <option value="sla">SLA ใกล้หมดก่อน</option>
          <option value="updated">อัปเดตล่าสุด</option>
        </select>
      </span>
    </div>
  );
}
