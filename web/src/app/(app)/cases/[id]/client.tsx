'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Button, Select } from '@/components/ui';

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'ทำรายการไม่สำเร็จ');
  return data;
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

/** Pick up reporter replies without a manual reload (user-test convenience). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      // Don't refresh while a staff member is typing or playing reporter video/audio (D-015).
      const playing = [...document.querySelectorAll<HTMLMediaElement>('video, audio')].some((m) => !m.paused);
      if (document.visibilityState === 'visible' && !playing && !document.activeElement?.matches('textarea, input, select')) router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  useEffect(() => {
    const el = document.getElementById('timeline');
    if (el) el.scrollTop = el.scrollHeight;
  });
  return null;
}

const AFTER_LABEL: Record<string, string> = {
  in_progress: 'กำลังดำเนินการ',
  pending_customer: 'รอข้อมูลผู้แจ้ง',
  resolved: 'แก้ไขแล้ว',
};

export function Composer({ caseId, reporterName, canned, afterOptions, contactActive }: {
  caseId: string; reporterName: string; canned: { id: string; title: string; body: string }[]; afterOptions: string[]; contactActive: boolean;
}) {
  const [mode, setMode] = useState<'line' | 'internal'>('line');
  const [text, setText] = useState('');
  const [after, setAfter] = useState('');
  const [showCanned, setShowCanned] = useState(false);
  const { busy, error, run } = useAction();
  const line = mode === 'line';

  const send = () => run(async () => {
    await api(`/api/cases/${caseId}/messages`, 'POST', { mode, text, afterStatus: after || null });
    setText('');
    setAfter('');
  });

  return (
    <div className={clsx('rounded-xl border bg-surface', line ? 'border-border' : 'border-dashed border-note-border')}>
      <div className="flex gap-1 px-3 pt-3" role="tablist" aria-label="ประเภทข้อความ">
        {(['line', 'internal'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={clsx('h-9 rounded-md px-4 text-[14px]', mode === m ? (m === 'line' ? 'bg-accent-tint font-semibold text-accent' : 'bg-note-tint font-semibold text-note') : 'text-text-2 hover:bg-hover')}>
            {m === 'line' ? 'ตอบผู้แจ้งทาง LINE' : 'บันทึกภายใน'}
          </button>
        ))}
      </div>
      <label htmlFor="composer" className="sr-only">ข้อความ</label>
      <textarea id="composer" value={text} onChange={(e) => setText(e.target.value)} rows={3}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) send(); }}
        placeholder={line ? `พิมพ์ข้อความถึง${reporterName} (ส่งเข้า LINE)` : 'บันทึกภายในสำหรับทีม (ผู้แจ้งไม่เห็น)'}
        className={clsx('block w-full resize-none px-4 py-3 text-[14px] focus:outline-none', !line && 'bg-note-tint/40')} />
      {!contactActive && line && <p className="px-4 pb-2 text-[12px] text-critical">ผู้แจ้งเลิกติดตามหรือถูกบล็อก ข้อความจะส่งไม่ถึง</p>}
      {error && <p className="px-4 pb-2 text-[13px] text-critical" role="alert">{error}</p>}
      <div className="relative flex items-center gap-2 border-t border-divider px-3 py-3">
        <Button size="sm" onClick={() => setShowCanned((v) => !v)} aria-expanded={showCanned}>ข้อความสำเร็จรูป</Button>
        <Button size="sm" aria-label="แนบไฟล์ (ยังไม่รองรับใน MVP)" title="แนบไฟล์ (ยังไม่รองรับใน MVP)" disabled><Paperclip size={15} /></Button>
        {showCanned && (
          <ul className="absolute bottom-14 left-3 z-10 w-[360px] overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
            {canned.length === 0 && <li className="px-4 py-3 text-[13px] text-muted">ยังไม่มีข้อความสำเร็จรูป</li>}
            {canned.map((c) => (
              <li key={c.id}>
                <button type="button" className="block w-full px-4 py-2.5 text-left hover:bg-row-hover" onClick={() => { setText((t) => (t ? `${t}\n${c.body}` : c.body)); setShowCanned(false); }}>
                  <span className="block text-[13px] font-semibold">{c.title}</span>
                  <span className="block truncate text-[12px] text-muted">{c.body}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <span className="ml-auto flex items-center gap-2 whitespace-nowrap text-[13px] text-muted">
          <label htmlFor="after">หลังส่ง</label>
          <Select id="after" value={after} onChange={(e) => setAfter(e.target.value)} className="h-8 w-auto text-[13px]">
            <option value="">คงสถานะเดิม</option>
            {afterOptions.map((s) => <option key={s} value={s}>{AFTER_LABEL[s]}</option>)}
          </Select>
        </span>
        <Button variant="primary" onClick={send} disabled={busy || !text.trim()}
          className={clsx(!line && 'border-note bg-note hover:bg-note/90')}>
          {busy ? 'กำลังส่ง…' : line ? 'ส่งทาง LINE' : 'บันทึก'}
        </Button>
      </div>
    </div>
  );
}

export function HeaderActions({ caseId, allowed, canSelfAssign, userId, canReassign }: { caseId: string; allowed: string[]; canSelfAssign: boolean; userId: string; canReassign: boolean }) {
  const { busy, error, run } = useAction();
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[13px] text-critical" role="alert">{error}</span>}
      <Button disabled title="รวมเคสซ้ำเปิดใช้ใน Phase 2">รวมกับเคสอื่น</Button>
      {canReassign && <Button onClick={() => document.getElementById('sp-assignee')?.focus()}>มอบหมายต่อ</Button>}
      {canSelfAssign && <Button disabled={busy} onClick={() => run(() => api(`/api/cases/${caseId}/assign`, 'POST', { assigneeId: userId }))}>รับเคสนี้</Button>}
      {allowed.includes('in_progress') && <Button disabled={busy} onClick={() => run(() => api(`/api/cases/${caseId}`, 'PATCH', { status: 'in_progress' }))}>เริ่มดำเนินการ</Button>}
      {allowed.includes('resolved') && <Button variant="primary" disabled={busy} onClick={() => run(() => api(`/api/cases/${caseId}`, 'PATCH', { status: 'resolved' }))}>ทำเครื่องหมายว่าแก้ไขแล้ว</Button>}
      {allowed.includes('closed') && <Button variant="primary" disabled={busy} onClick={() => run(() => api(`/api/cases/${caseId}`, 'PATCH', { status: 'closed', reason: 'หัวหน้าทีมปิดเคสโดยไม่รอผู้แจ้งยืนยัน' }))}>ปิดเคส</Button>}
    </div>
  );
}

export function CaseSidePanel({ caseId, status, priority, assigneeId, allowed, role, userId, assignees, priorities, statuses }: {
  caseId: string; status: string; priority: string; assigneeId: string | null; allowed: string[]; role: string; userId: string;
  assignees: { id: string; name: string; role: string }[]; priorities: { code: string; label: string }[]; statuses: Record<string, string>;
}) {
  const { busy, error, run } = useAction();
  const closed = status === 'closed' || status === 'cancelled';

  const changeStatus = (to: string) => {
    if (!to || to === status) return;
    let reason: string | undefined;
    if (to === 'cancelled') {
      reason = window.prompt('ระบุเหตุผลการยกเลิกเคส (ผู้แจ้งจะเห็นข้อความนี้)') ?? undefined;
      if (!reason) return;
    }
    run(() => api(`/api/cases/${caseId}`, 'PATCH', { status: to, reason }));
  };
  const changePriority = (to: string) => {
    if (to === priority) return;
    const reason = window.prompt(`ระบุเหตุผลที่เปลี่ยน priority เป็น ${to}`);
    if (!reason) return;
    run(() => api(`/api/cases/${caseId}`, 'PATCH', { priority: to, reason }));
  };
  const options = role === 'agent' ? assignees.filter((a) => a.id === userId || a.id === assigneeId) : assignees;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-critical-tint px-3 py-2 text-[13px] text-critical" role="alert">{error}</p>}
      <div className="space-y-1.5">
        <label htmlFor="sp-status" className="block text-[12px] font-semibold text-text-2">สถานะ</label>
        <Select id="sp-status" value={status} disabled={busy || closed || allowed.length === 0} onChange={(e) => changeStatus(e.target.value)}>
          <option value={status}>{statuses[status]}</option>
          {allowed.map((s) => <option key={s} value={s}>→ {statuses[s]}</option>)}
        </Select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="sp-priority" className="block text-[12px] font-semibold text-text-2">Priority</label>
        <Select id="sp-priority" value={priority} disabled={busy || closed} onChange={(e) => changePriority(e.target.value)}>
          {priorities.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
        </Select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="sp-assignee" className="block text-[12px] font-semibold text-text-2">ผู้รับผิดชอบ</label>
        <Select id="sp-assignee" value={assigneeId ?? ''} disabled={busy || closed}
          onChange={(e) => e.target.value && run(() => api(`/api/cases/${caseId}/assign`, 'POST', { assigneeId: e.target.value }))}>
          {!assigneeId && <option value="">ยังไม่มอบหมาย</option>}
          {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </div>
    </div>
  );
}

export function PhoneReveal({ caseId, masked }: { caseId: string; masked: string }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (phone) return <span className="tabular">{phone}</span>;
  return (
    <span className="tabular">
      {masked}{' '}
      <button type="button" className="font-semibold text-accent hover:underline" title="การดูเบอร์เต็มจะถูกบันทึกใน audit log"
        onClick={async () => { try { setPhone((await api(`/api/cases/${caseId}/reveal-phone`, 'POST')).phone); } catch (e) { setErr((e as Error).message); } }}>
        แสดง
      </button>
      {err && <span className="block text-[12px] text-critical">{err}</span>}
    </span>
  );
}
