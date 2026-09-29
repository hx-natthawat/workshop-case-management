'use client';

import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, Input, PriorityChip, Textarea } from '@/components/ui';
import type { Priority } from '@/server/db/schema';
import { PRIORITY } from '@/server/lib/enums';

interface Sla { priority: Priority; responseMinutes: number; resolveMinutes: number; businessHoursOnly: boolean }
interface Settings {
  tenant: { oaName: string; bizStartMin: number; bizEndMin: number; pdpaText: string; pdpaVersion: string; slaTargetPct: number };
  sla: Sla[];
}

const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
function human(min: number) {
  if (min < 60) return `${min} นาที`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

export function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const t0 = initial.tenant;
  const [oaName, setOaName] = useState(t0.oaName);
  const [start, setStart] = useState(toHHMM(t0.bizStartMin));
  const [end, setEnd] = useState(toHHMM(t0.bizEndMin));
  const [pdpaText, setPdpaText] = useState(t0.pdpaText);
  const [pdpaVersion, setPdpaVersion] = useState(t0.pdpaVersion);
  const [sla, setSla] = useState<Sla[]>(initial.sla);
  const [target, setTarget] = useState(t0.slaTargetPct);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const textChanged = pdpaText.trim() !== t0.pdpaText;
  const versionChanged = pdpaVersion.trim() !== t0.pdpaVersion;
  const pdpaError = textChanged && !versionChanged ? 'แก้ไขข้อความแล้ว กรุณาเปลี่ยนเลข version ด้วย' : null;
  const hoursError = start && end && toMin(end) <= toMin(start) ? 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม' : null;

  const setRow = (p: Priority, patch: Partial<Sla>) => setSla((rows) => rows.map((r) => (r.priority === p ? { ...r, ...patch } : r)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pdpaError || hoursError) return;
    if (sla.some((r) => !(r.responseMinutes >= 1 && r.resolveMinutes >= 1))) return setMsg({ ok: false, text: 'เวลา SLA ต้องมากกว่า 0 นาที' });
    const body: Record<string, unknown> = {};
    if (oaName.trim() !== t0.oaName) body.oaName = oaName.trim();
    if (toMin(start) !== t0.bizStartMin) body.bizStartMin = toMin(start);
    if (toMin(end) !== t0.bizEndMin) body.bizEndMin = toMin(end);
    if (textChanged) body.pdpaText = pdpaText.trim();
    if (versionChanged) body.pdpaVersion = pdpaVersion.trim();
    if (target !== t0.slaTargetPct) body.slaTargetPct = target;
    const changedSla = sla.filter((r) => {
      const o = initial.sla.find((x) => x.priority === r.priority);
      return !o || o.responseMinutes !== r.responseMinutes || o.resolveMinutes !== r.resolveMinutes || o.businessHoursOnly !== r.businessHoursOnly;
    });
    if (changedSla.length) body.sla = changedSla;
    if (!Object.keys(body).length) return setMsg({ ok: true, text: 'ไม่มีการเปลี่ยนแปลง' });
    if (versionChanged && !confirm(`ผู้ที่ลงทะเบียนหลังจากนี้จะถูกบันทึกว่ารับทราบประกาศ PDPA version "${pdpaVersion.trim()}" ยืนยันการบันทึกหรือไม่`)) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? 'บันทึกไม่สำเร็จ' });
    setMsg({ ok: true, text: 'บันทึกการตั้งค่าแล้ว' });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Card title="ข้อมูลองค์กรและเวลาทำการ">
        <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
          <Field label="ชื่อ LINE OA" htmlFor="s-oa"><Input id="s-oa" value={oaName} onChange={(e) => setOaName(e.target.value)} maxLength={80} required /></Field>
          <Field label="เริ่มเวลาทำการ" htmlFor="s-start" hint="จันทร์–ศุกร์ เวลาประเทศไทย"><Input id="s-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
          <Field label="สิ้นสุดเวลาทำการ" htmlFor="s-end" error={hoursError}><Input id="s-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
        </div>
      </Card>

      <Card title="ประกาศความเป็นส่วนตัว (PDPA)">
        <div className="space-y-4 px-5 py-4">
          <Field label="ข้อความประกาศ" htmlFor="s-pdpa"><Textarea id="s-pdpa" rows={6} value={pdpaText} onChange={(e) => setPdpaText(e.target.value)} maxLength={10000} required /></Field>
          <div className="max-w-[240px]">
            <Field label="Version" htmlFor="s-ver" error={pdpaError} hint={`ปัจจุบัน: ${t0.pdpaVersion}`}><Input id="s-ver" value={pdpaVersion} onChange={(e) => setPdpaVersion(e.target.value)} maxLength={20} required /></Field>
          </div>
          {(textChanged || versionChanged) && (
            <p className="flex items-start gap-2 rounded-md bg-warning-tint px-3 py-2 text-[13px] text-warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              ผู้ที่ลงทะเบียนใหม่หลังบันทึกจะถูกบันทึกว่ารับทราบประกาศ version ใหม่ ผู้ที่ลงทะเบียนไว้แล้วยังคงบันทึก version เดิม
            </p>
          )}
        </div>
      </Card>

      <div id="sla" className="scroll-mt-6" />
      <Card title="นโยบาย SLA">
        <div className="max-w-[320px] px-5 pt-4">
          <Field label="เป้าหมายอัตราผ่าน SLA (%)" htmlFor="s-target" hint="แสดงบนแดชบอร์ด ค่าเริ่มต้น 90% ยังไม่ยืนยันกับลูกค้า">
            <Input id="s-target" type="number" min={50} max={100} value={target} onChange={(e) => setTarget(Number(e.target.value))} required />
          </Field>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-surface-muted text-left text-[12px] font-semibold text-muted">
                <th scope="col" className="h-11 pl-5 pr-4">Priority</th>
                <th scope="col" className="px-4">ตอบรับภายใน (นาที)</th>
                <th scope="col" className="px-4">แก้ไขภายใน (นาที)</th>
                <th scope="col" className="px-4">นับเฉพาะเวลาทำการ</th>
              </tr>
            </thead>
            <tbody>
              {sla.map((r) => (
                <tr key={r.priority} className="border-t border-divider">
                  <td className="h-14 pl-5 pr-4"><PriorityChip priority={r.priority} /> <span className="ml-1 text-text-2">{PRIORITY[r.priority].label}</span></td>
                  <td className="px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-28 shrink-0"><Input type="number" min={1} className="tabular" aria-label={`${r.priority} ตอบรับภายใน (นาที)`} value={r.responseMinutes} onChange={(e) => setRow(r.priority, { responseMinutes: Number(e.target.value) })} /></div>
                      <span className="whitespace-nowrap text-[12px] text-muted">{r.responseMinutes >= 1 ? human(r.responseMinutes) : ''}</span>
                    </div>
                  </td>
                  <td className="px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-28 shrink-0"><Input type="number" min={1} className="tabular" aria-label={`${r.priority} แก้ไขภายใน (นาที)`} value={r.resolveMinutes} onChange={(e) => setRow(r.priority, { resolveMinutes: Number(e.target.value) })} /></div>
                      <span className="whitespace-nowrap text-[12px] text-muted">{r.resolveMinutes >= 1 ? human(r.resolveMinutes) : ''}</span>
                    </div>
                  </td>
                  <td className="px-4">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="size-4 accent-accent" checked={r.businessHoursOnly} onChange={(e) => setRow(r.priority, { businessHoursOnly: e.target.checked })} />
                      <span>{r.businessHoursOnly ? 'เวลาทำการ' : 'ตลอด 24 ชม.'}</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-divider px-5 py-3 text-[12px] text-muted">การเปลี่ยนแปลงมีผลกับเคสที่เปิดใหม่หลังบันทึก เคสที่เปิดอยู่แล้วใช้กำหนดเวลาเดิม</p>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {msg && <span role="status" className={msg.ok ? 'text-[13px] text-success' : 'text-[13px] text-critical'}>{msg.text}</span>}
        <Button type="submit" variant="primary" disabled={busy || !!pdpaError || !!hoursError}>{busy ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}</Button>
      </div>
    </form>
  );
}
