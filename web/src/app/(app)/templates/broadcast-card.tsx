'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fullWhen } from '@/components/format';
import { Button, Card, Field, Textarea } from '@/components/ui';

interface Item { id: string; text: string; recipientCount: number; failedCount: number; createdAt: string; sentBy: string | null }

/** Outage announcement (SPEC §5 Message Templates). Shows quota impact before sending (research r1 Q10). */
export function BroadcastCard({ recipients, history, mfaReady }: { recipients: number; history: Item[]; mfaReady: boolean }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (!confirm(`ส่งประกาศถึงผู้แจ้งที่ลงทะเบียนและยังติดตาม OA ${recipients} คน\nจะใช้โควตาข้อความ ${recipients} ข้อความ (นับตามจำนวนผู้รับ) ยืนยันการส่งหรือไม่`)) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, confirm: true }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? 'ส่งไม่สำเร็จ' });
    setMsg({ ok: data.failed === 0, text: data.failed ? `ส่งแล้ว ${data.recipients - data.failed} คน · ไม่สำเร็จ ${data.failed} คน` : `ส่งประกาศถึง ${data.recipients} คนแล้ว` });
    setText('');
    router.refresh();
  }

  return (
    <Card title="ประกาศเหตุขัดข้อง" className="mt-6">
      <div className="space-y-4 px-5 py-4">
        <p className="flex items-start gap-2 rounded-md bg-warning-tint px-3 py-2 text-[13px] text-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          ส่งถึงผู้แจ้งทุกคนที่ลงทะเบียนและยังติดตาม OA ({recipients} คน) และใช้โควตาข้อความของแพ็กเกจ LINE OA ตามจำนวนผู้รับ ใช้เฉพาะกรณีจำเป็น
        </p>
        <Field label="ข้อความประกาศ" htmlFor="bc-text" hint={`${text.length}/1000 ตัวอักษร · ระบบเติมหัวข้อ "ประกาศจาก<ชื่อ OA>" ให้`}>
          <Textarea id="bc-text" rows={4} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="เช่น ระบบ ERP ขัดข้องตั้งแต่ 09:30 น. ทีมกำลังแก้ไข คาดว่าใช้งานได้ภายใน 11:00 น. ครับ" />
        </Field>
        {msg && <p className={msg.ok ? 'text-[13px] text-success' : 'text-[13px] text-critical'} role="status">{msg.text}</p>}
        {!mfaReady && <p className="text-[13px] text-warning">ต้องเปิดใช้ MFA ก่อนส่งประกาศ ตั้งค่าได้ที่ <a className="underline" href="/account/security">ความปลอดภัยของบัญชี</a></p>}
        <Button variant="primary" disabled={busy || !mfaReady || !text.trim() || recipients === 0} onClick={send}>{busy ? 'กำลังส่ง…' : `ส่งประกาศ (${recipients} คน)`}</Button>
        {history.length > 0 && (
          <div className="border-t border-divider pt-4">
            <h3 className="mb-2 text-[12px] font-semibold text-text-2">ประกาศล่าสุด</h3>
            <ul className="space-y-2 text-[13px]">
              {history.map((h) => (
                <li key={h.id} className="rounded-lg border border-border px-3 py-2">
                  <p className="whitespace-pre-wrap">{h.text}</p>
                  <p className="mt-1 text-[12px] text-muted">{fullWhen(h.createdAt)} · {h.sentBy ?? '-'} · ผู้รับ {h.recipientCount} คน{h.failedCount ? ` · ไม่สำเร็จ ${h.failedCount}` : ''}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
