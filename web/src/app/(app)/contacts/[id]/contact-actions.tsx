'use client';

import { Ban, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui';

/** Masked phone; "แสดง" fetches the full number (audit-logged server side). */
export function PhoneReveal({ contactId, masked, canReveal }: { contactId: string; masked: string; canReveal: boolean }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function reveal() {
    setBusy(true);
    const res = await fetch(`/api/contacts/${contactId}/reveal-phone`, { method: 'POST' });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setError(j.error ?? 'แสดงเบอร์โทรไม่สำเร็จ');
    setPhone(j.phone ?? '-');
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="tabular">{phone ?? masked}</span>
      {!phone && canReveal && (
        <Button size="sm" variant="ghost" onClick={reveal} disabled={busy} title="การแสดงเบอร์โทรเต็มจะถูกบันทึกใน Audit log">
          <Eye size={14} aria-hidden />แสดง
        </Button>
      )}
      {phone && <span className="text-[12px] text-muted">บันทึกการเข้าดูแล้ว</span>}
      {error && <span role="alert" className="text-[12px] text-critical">{error}</span>}
    </span>
  );
}

export function BlockToggle({ contactId, blocked }: { contactId: string; blocked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    const msg = blocked
      ? 'ยกเลิกการบล็อกผู้ใช้นี้ใช่หรือไม่'
      : 'บล็อกผู้ใช้นี้ใช่หรือไม่ ระบบจะไม่รับเรื่องใหม่จากผู้ใช้นี้จนกว่าจะยกเลิกการบล็อก';
    if (!confirm(msg)) return;
    setBusy(true);
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: blocked ? 'active' : 'blocked' }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? 'บันทึกไม่สำเร็จ');
    setError(null);
    router.refresh();
  }
  return (
    <span className="flex items-center gap-2">
      {error && <span role="alert" className="text-[12px] text-critical">{error}</span>}
      <Button variant={blocked ? 'secondary' : 'danger'} onClick={toggle} disabled={busy}>
        <Ban size={16} aria-hidden />{blocked ? 'ยกเลิกบล็อก' : 'บล็อกผู้ใช้'}
      </Button>
    </span>
  );
}
