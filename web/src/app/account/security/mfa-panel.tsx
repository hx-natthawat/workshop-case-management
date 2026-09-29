'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input } from '@/components/ui';

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'ทำรายการไม่สำเร็จ');
  return data;
}

export function MfaPanel({ enabled, canDisable }: { enabled: boolean; canDisable: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (codes) {
    return (
      <section className="space-y-3">
        <h2 className="text-[16px] font-semibold text-success">เปิดใช้ MFA แล้ว</h2>
        <p className="text-[13px] text-text-2">เก็บรหัสสำรองต่อไปนี้ไว้ในที่ปลอดภัย ใช้ได้รหัสละ 1 ครั้งเมื่อไม่มีโทรศัพท์ ระบบจะไม่แสดงรหัสเหล่านี้อีก</p>
        <ul className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-muted p-3 font-mono text-[14px]">
          {codes.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <Button variant="primary" className="w-full" onClick={() => { router.push('/dashboard'); router.refresh(); }}>บันทึกรหัสแล้ว ไปต่อ</Button>
      </section>
    );
  }

  if (enabled) {
    return (
      <section className="space-y-3">
        <p className="text-[14px]"><span className="font-semibold text-success">เปิดใช้ MFA อยู่</span> เข้าสู่ระบบครั้งถัดไปต้องกรอกรหัสจากแอป authenticator</p>
        {canDisable && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const code = new FormData(e.currentTarget).get('code'); run(async () => { await post('/api/account/mfa/disable', { code }); router.refresh(); }); }}>
            <Field label="ปิด MFA (กรอกรหัสปัจจุบันเพื่อยืนยัน)" htmlFor="dcode" error={error}><Input id="dcode" name="code" inputMode="numeric" required /></Field>
            <Button type="submit" variant="danger" disabled={busy}>ปิด MFA</Button>
          </form>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-[14px] text-text-2">
        <li>ติดตั้งแอป authenticator เช่น Google Authenticator หรือ Microsoft Authenticator</li>
        <li>สแกน QR code หรือพิมพ์รหัสลับด้วยตนเอง</li>
        <li>กรอกรหัส 6 หลักที่แอปแสดงเพื่อยืนยัน</li>
      </ol>
      {!setup ? (
        <Button variant="primary" className="w-full" disabled={busy} onClick={() => run(async () => setSetup(await post('/api/account/mfa')))}>เริ่มตั้งค่า MFA</Button>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const code = new FormData(e.currentTarget).get('code'); run(async () => setCodes((await post('/api/account/mfa/confirm', { code })).recoveryCodes)); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code สำหรับแอป authenticator" className="mx-auto size-[220px]" />
          <p className="text-center text-[12px] text-muted">รหัสลับ: <span className="font-mono text-text">{setup.secret.match(/.{1,4}/g)?.join(' ')}</span></p>
          <Field label="รหัส 6 หลักจากแอป" htmlFor="ecode" error={error}><Input id="ecode" name="code" inputMode="numeric" autoComplete="one-time-code" required className="tabular tracking-widest" /></Field>
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>ยืนยันและเปิดใช้ MFA</Button>
        </form>
      )}
      {error && !setup && <p className="text-[13px] text-critical">{error}</p>}
    </section>
  );
}
