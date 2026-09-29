'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input } from '@/components/ui';

export function AccessCodeForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = new FormData(e.currentTarget).get('code');
    const res = await fetch('/api/sim/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? 'ไม่สำเร็จ');
    router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="รหัสผู้ทดสอบ" htmlFor="code" error={error}><Input id="code" name="code" autoComplete="off" required /></Field>
      <Button type="submit" variant="primary" className="w-full">เข้าใช้ Simulator</Button>
    </form>
  );
}
