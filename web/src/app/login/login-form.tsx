'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input } from '@/components/ui';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'password' | 'mfa'>('password');

  const done = () => {
    // Only same-site relative paths (no open redirect)
    const next = new URLSearchParams(window.location.search).get('next');
    router.push(next && /^\/(?!\/)/.test(next) ? next : '/dashboard');
    router.refresh();
  };

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'เข้าสู่ระบบไม่สำเร็จ');
      if (res.status === 401 && step === 'mfa' && /หมดเวลา/.test(data.error ?? '')) setStep('password');
      return null;
    }
    return data as { mfaRequired?: boolean };
  }

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await post('/api/auth/login', { email: f.get('email'), password: f.get('password') });
    if (!r) return;
    if (r.mfaRequired) setStep('mfa');
    else done();
  }

  async function onCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await post('/api/auth/mfa', { code: new FormData(e.currentTarget).get('code') });
    if (r) done();
  }

  if (step === 'mfa') {
    return (
      <form onSubmit={onCode} className="space-y-4">
        <p className="text-[14px] text-text-2">กรอกรหัส 6 หลักจากแอป authenticator หรือใช้รหัสสำรองที่ได้รับตอนตั้งค่า</p>
        <Field label="รหัสยืนยันตัวตน" htmlFor="code" error={error}>
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required className="tabular tracking-widest" />
        </Field>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? 'กำลังตรวจสอบ…' : 'ยืนยัน'}</Button>
        <button type="button" className="w-full text-center text-[13px] text-muted underline" onClick={() => { setStep('password'); setError(null); }}>กลับไปหน้าเข้าสู่ระบบ</button>
      </form>
    );
  }

  return (
    <form onSubmit={onPassword} className="space-y-4">
      <Field label="อีเมล" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="username" required /></Field>
      <Field label="รหัสผ่าน" htmlFor="password" error={error}><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</Button>
    </form>
  );
}
