'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { FlaskConical, Plus, UserRound } from 'lucide-react';
import { Phone } from './phone';

export interface Persona {
  id: string;
  lineUserId: string;
  name: string;
  registered: boolean;
  status: 'active' | 'unfollowed' | 'blocked';
  openCases: number;
}

export function Simulator({ oaName }: { oaName: string }) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPersonas = useCallback(async () => {
    const res = await fetch('/api/sim/personas', { cache: 'no-store' });
    if (!res.ok) return;
    const body = (await res.json()) as { personas: Persona[] };
    setPersonas(body.personas);
    setSelected((cur) => cur ?? body.personas.find((p) => p.registered)?.lineUserId ?? body.personas[0]?.lineUserId ?? null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPersonas();
  }, [loadPersonas]);

  async function addPersona(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAddError(null);
    try {
      const res = await fetch('/api/sim/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: newName }),
      });
      const body = (await res.json()) as { lineUserId?: string; error?: string; issues?: { message: string }[] };
      if (!res.ok || !body.lineUserId) {
        setAddError(body.issues?.[0]?.message ?? body.error ?? 'สร้างผู้ทดสอบไม่สำเร็จ');
        return;
      }
      setNewName('');
      setAdding(false);
      setSelected(body.lineUserId);
      await loadPersonas();
    } finally {
      setBusy(false);
    }
  }

  const current = personas.find((p) => p.lineUserId === selected) ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-bg lg:flex-row">
      <aside className="w-full shrink-0 border-b border-border bg-surface-muted lg:h-dvh lg:w-[320px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2 text-accent">
            <FlaskConical aria-hidden className="size-5" />
            <h1 className="text-[17px] font-semibold text-text">LINE Simulator</h1>
          </div>
          <p className="mt-2 rounded-md bg-note-tint px-3 py-2 text-[12.5px] leading-relaxed text-note">
            โปรแกรมจำลองแชท LINE สำหรับทดสอบกับผู้ใช้ ข้อความจะเข้าบอทจริงและสร้างเคสจริงในระบบ (บัญชีทดสอบ) ไม่ได้ส่งผ่าน LINE จริง
          </p>
        </div>

        <div className="px-3 py-3">
          <div className="flex items-center justify-between px-2 pb-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">ผู้ทดสอบ ({personas.length})</h2>
          </div>
          <ul className="space-y-1" aria-label="รายชื่อผู้ทดสอบ">
            {personas.map((p) => (
              <li key={p.lineUserId}>
                <button
                  type="button"
                  onClick={() => setSelected(p.lineUserId)}
                  aria-current={p.lineUserId === selected ? 'true' : undefined}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                    p.lineUserId === selected ? 'bg-accent-tint' : 'hover:bg-hover',
                  )}
                >
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral text-white">
                    <UserRound aria-hidden className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{p.name}</span>
                    <span className="block truncate font-mono text-[11px] text-muted">{p.lineUserId}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-medium', p.registered ? 'bg-success-tint text-success' : 'bg-warning-tint text-warning')}>
                      {p.registered ? 'ลงทะเบียนแล้ว' : 'ยังไม่ลงทะเบียน'}
                    </span>
                    {p.openCases > 0 && <span className="text-[11px] text-muted">เคสเปิด {p.openCases}</span>}
                    {p.status !== 'active' && <span className="text-[11px] text-critical">เลิกติดตาม</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {adding ? (
            <form onSubmit={addPersona} className="mt-3 space-y-2 rounded-lg border border-border bg-surface p-3">
              <label htmlFor="persona-name" className="block text-[12px] font-semibold text-text-2">ชื่อที่แสดงใน LINE</label>
              <input
                id="persona-name"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="เช่น ต้น"
                maxLength={40}
                className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-[14px] focus:border-accent focus:outline-none"
              />
              {addError && <p className="text-[12px] text-critical">{addError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={busy || !newName.trim()} className="h-9 flex-1 rounded-md bg-accent text-[14px] font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                  {busy ? 'กำลังสร้าง…' : 'เพิ่มเพื่อน'}
                </button>
                <button type="button" onClick={() => { setAdding(false); setAddError(null); }} className="h-9 rounded-md border border-border-strong px-3 text-[14px] hover:bg-hover">
                  ยกเลิก
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong text-[14px] font-medium text-accent hover:bg-accent-tint"
            >
              <Plus aria-hidden className="size-4" /> เพิ่มผู้ทดสอบใหม่
            </button>
          )}
        </div>

        <div className="space-y-1.5 border-t border-border px-5 py-4 text-[12px] leading-relaxed text-muted">
          <p className="font-semibold text-text-2">วิธีใช้</p>
          <p>เลือกผู้ทดสอบทางซ้าย แล้วแชทในโทรศัพท์จำลองได้เหมือน LINE จริง กด &quot;เมนู&quot; เพื่อเปิด Rich Menu</p>
          <p>ผู้ทดสอบใหม่ต้องลงทะเบียนก่อน (กดปุ่มลงทะเบียนในแชท)</p>
          <p>&quot;รีเซ็ตแชท&quot; ล้างเฉพาะหน้าจอ ไม่ลบข้อมูลในระบบ</p>
        </div>
      </aside>

      <main className="flex flex-1 items-start justify-center px-4 py-6 lg:h-dvh lg:items-center lg:overflow-hidden">
        {current ? (
          <Phone key={current.lineUserId} persona={current} oaName={oaName} onChanged={loadPersonas} />
        ) : (
          <p className="text-[14px] text-muted">เลือกหรือเพิ่มผู้ทดสอบเพื่อเริ่มแชท</p>
        )}
      </main>
    </div>
  );
}
