'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import type { CatNode } from './types';

/** Left column: 2-level category tree (SPEC §5). */
export function CategoryPanel({ categories, selectedId, onSelect, onCreate, busy }: {
  categories: CatNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string, parentId: string | null) => Promise<boolean>;
  busy: boolean;
}) {
  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null);
  const [name, setName] = useState('');

  async function submit() {
    if (!adding || !name.trim()) return;
    if (await onCreate(name.trim(), adding.parentId)) {
      setAdding(null);
      setName('');
    }
  }

  const addBox = (parentId: string | null) => adding && adding.parentId === parentId && (
    <form className="mx-2 my-1.5 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={parentId ? 'ชื่อหมวดย่อย' : 'ชื่อหมวดหลัก'} className="h-8 text-[13px]" aria-label={parentId ? 'ชื่อหมวดย่อยใหม่' : 'ชื่อหมวดหลักใหม่'} />
      <Button type="submit" size="sm" variant="primary" disabled={busy || !name.trim()}>เพิ่ม</Button>
      <Button size="sm" variant="ghost" onClick={() => { setAdding(null); setName(''); }}>ยกเลิก</Button>
    </form>
  );

  const openParent = categories.find((p) => p.id === selectedId || p.children.some((c) => c.id === selectedId))?.id ?? null;

  return (
    <nav aria-label="หมวดหมู่" className="flex flex-col gap-1 px-3 py-4">
      <div className="flex items-center px-1.5 pb-2">
        <h2 className="grow text-[14px] font-semibold">หมวดหมู่</h2>
        <Button size="sm" aria-label="เพิ่มหมวดหมู่" onClick={() => { setAdding({ parentId: null }); setName(''); }}>+ เพิ่ม</Button>
      </div>
      {addBox(null)}
      <ul className="flex flex-col gap-1">
        {categories.map((p, pi) => (
          <li key={p.id} className={clsx(pi > 0 && 'pt-2.5')}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              aria-current={selectedId === p.id ? 'true' : undefined}
              className={clsx('flex w-full items-center rounded-md px-2.5 py-1 text-left text-[12px] font-semibold',
                selectedId === p.id ? 'bg-accent-tint text-accent' : 'text-muted hover:bg-field', !p.isActive && 'opacity-50')}
            >
              <span className="grow">{p.name}{!p.isActive && ' (ปิด)'}</span>
              <span className="tabular">{p.children.length}</span>
            </button>
            <ul className="mt-1 flex flex-col gap-1">
              {p.children.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={selectedId === c.id ? 'true' : undefined}
                    className={clsx('flex h-[34px] w-full items-center gap-2 rounded-md pl-5 pr-2.5 text-left text-[13.5px]',
                      selectedId === c.id ? 'bg-accent-tint font-semibold text-accent' : 'text-text hover:bg-field', !c.isActive && 'opacity-50')}
                  >
                    <span className="flex-1 truncate">{c.name}</span>
                    {!c.isActive && <span className="text-[11px] text-muted">ปิด</span>}
                    {!c.formId && <span className="text-[11px] font-normal text-warning">ไม่มีฟอร์ม</span>}
                  </button>
                </li>
              ))}
            </ul>
            {addBox(p.id) || (openParent === p.id && (
              <button type="button" onClick={() => { setAdding({ parentId: p.id }); setName(''); }} className="mt-0.5 h-8 rounded-md pl-5 pr-2 text-[12px] text-muted hover:text-accent">
                + เพิ่มหมวดย่อย
              </button>
            ))}
          </li>
        ))}
      </ul>
    </nav>
  );
}
