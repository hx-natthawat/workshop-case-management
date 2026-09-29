'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';

/** G5: create the 4-button rich menu on the real LINE OA and set it as default (research r1 Q9). */
export function RichMenuCard({ canProvision }: { canProvision: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function provision() {
    if (!confirm('สร้าง rich menu ใหม่บน LINE OA และตั้งเป็นเมนูเริ่มต้นของผู้ใช้ทุกคน ยืนยันหรือไม่')) return;
    setBusy(true); setMsg(null);
    const res = await fetch('/api/rich-menu', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: `ตั้งค่าแล้ว (rich menu ${data.richMenuId})` } : { ok: false, text: data.error ?? 'ไม่สำเร็จ' });
  }
  return (
    <Card title="Rich Menu บน LINE OA">
      <div className="grid gap-5 px-5 py-4 md:grid-cols-[280px_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/rich-menu/image" alt="ภาพตัวอย่าง rich menu 4 ปุ่ม" className="w-full rounded-lg border border-border" />
        <div className="space-y-3 text-[14px]">
          <p className="text-text-2">เมนู 4 ปุ่มตาม prototype: แจ้งปัญหาใหม่ · ติดตามสถานะ · เคสของฉัน · ติดต่อเจ้าหน้าที่ ทุกครั้งที่กดจะสร้างเมนูใหม่แล้วตั้งเป็นค่าเริ่มต้น เพราะ LINE ไม่ให้เปลี่ยนรูปของเมนูเดิม</p>
          {!canProvision && <p className="text-[13px] text-warning">ต้องตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ก่อน</p>}
          <Button variant="primary" disabled={busy || !canProvision} onClick={provision}>{busy ? 'กำลังตั้งค่า…' : 'ติดตั้ง Rich Menu'}</Button>
          {msg && <p className={msg.ok ? 'text-[13px] text-success' : 'text-[13px] text-critical'} role="status">{msg.text}</p>}
        </div>
      </div>
    </Card>
  );
}
