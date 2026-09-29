'use client';

import clsx from 'clsx';
import Script from 'next/script';
import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface Liff {
  init(o: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(o?: { redirectUri?: string }): void;
  getIDToken(): string | null;
  isInClient(): boolean;
  closeWindow(): void;
}
declare global {
  interface Window {
    liff?: Liff;
  }
}

type Fields = { fullName: string; phone: string; customerRef: string; orgUnit: string };
type Errors = Partial<Record<keyof Fields | 'consent' | 'form', string>>;

interface Props {
  oaName: string;
  pdpaText: string;
  pdpaVersion: string;
  simUserId: string | null;
  simRequested: boolean;
  liffId: string;
  initial: Fields;
}

const inputCls = (err?: string) =>
  clsx(
    'h-11 w-full rounded-md border bg-surface px-3 text-[16px] placeholder:text-disabled focus:outline-none focus:ring-2 focus:ring-accent/30',
    err ? 'border-critical' : 'border-border-strong focus:border-accent',
  );

export function RegisterForm({ oaName, pdpaText, pdpaVersion, simUserId, simRequested, liffId, initial }: Props) {
  const simMode = !!simUserId;
  const [fields, setFields] = useState<Fields>(initial);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [liffState, setLiffState] = useState<'idle' | 'ready' | 'error'>(simMode ? 'ready' : 'idle');
  const [liffError, setLiffError] = useState<string | null>(
    simRequested ? 'โหมดจำลองปิดอยู่ หรือรหัสผู้ใช้จำลองไม่ถูกต้อง' : !simMode && !liffId ? 'ยังไม่ได้ตั้งค่า LIFF ID กรุณาเปิดหน้านี้จากแชท LINE' : null,
  );

  const initLiff = async () => {
    const liff = window.liff;
    if (!liff || !liffId) return;
    try {
      await liff.init({ liffId });
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return;
      }
      setLiffState('ready');
    } catch {
      setLiffState('error');
      setLiffError('เชื่อมต่อกับ LINE ไม่สำเร็จ กรุณาปิดแล้วเปิดหน้านี้ใหม่จากแชท');
    }
  };

  // If the SDK was already loaded (e.g. client navigation), init right away.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!simMode && liffId && window.liff) void initLiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof Fields) => (e: { target: { value: string } }) => {
    setFields((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    // The API validates everything (zod), so all field errors show at once.
    setBusy(true);
    setErrors({});
    try {
      let identity: { simUserId: string } | { idToken: string };
      if (simUserId) identity = { simUserId };
      else {
        const token = window.liff?.getIDToken();
        if (!token) throw new Error('ไม่พบข้อมูลยืนยันตัวตนจาก LINE กรุณาเปิดหน้านี้ใหม่จากแชท');
        identity = { idToken: token };
      }
      const res = await fetch('/api/liff/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...identity, ...fields, consent, consentVersion: pdpaVersion }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: { path: (string | number)[]; message: string }[] };
      if (!res.ok) {
        const next: Errors = {};
        for (const i of body.issues ?? []) {
          const key = String(i.path[0] ?? 'form') as keyof Errors;
          if (!next[key]) next[key] = i.message;
        }
        if (!body.issues?.length) next.form = body.error ?? 'ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
        setErrors(next);
        return;
      }
      setDone(true);
      if (simMode) {
        window.parent?.postMessage({ type: 'registered' }, '*');
      } else if (window.liff?.isInClient()) {
        setTimeout(() => window.liff?.closeWindow(), 1200);
      }
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'ลงทะเบียนไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  }

  const script = !simMode && liffId ? (
    <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" onLoad={() => void initLiff()} />
  ) : null;

  if (done) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
        <CheckCircle2 aria-hidden className="size-14 text-accent" />
        <h1 className="text-[20px] font-semibold">ลงทะเบียนเรียบร้อยแล้ว</h1>
        <p className="text-[15px] text-text-2">ลงทะเบียนเรียบร้อยแล้ว กลับไปที่แชทได้เลยครับ</p>
      </main>
    );
  }

  const disabled = busy || liffState !== 'ready';

  return (
    <main className="min-h-dvh bg-surface">
      {script}
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <p className="text-[12px] text-muted">{oaName}</p>
        <h1 className="text-[18px] font-semibold">ลงทะเบียนผู้แจ้งปัญหา</h1>
        {simMode && <p className="mt-1 text-[12px] text-warning">โหมดจำลองสำหรับทดสอบ · {simUserId}</p>}
      </header>

      <form onSubmit={submit} noValidate className="mx-auto max-w-md space-y-5 px-4 pb-10 pt-4">
        {liffError && (
          <p role="alert" className="rounded-md bg-critical-tint px-3 py-2 text-[14px] text-critical">{liffError}</p>
        )}

        <section aria-labelledby="pdpa-title" className="space-y-2">
          <h2 id="pdpa-title" className="text-[14px] font-semibold">ประกาศความเป็นส่วนตัว (ฉบับ {pdpaVersion})</h2>
          <div tabIndex={0} className="max-h-48 overflow-y-auto whitespace-pre-line rounded-lg border border-border bg-surface-muted p-3 text-[13px] leading-relaxed text-text-2">
            {pdpaText}
          </div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => { setConsent(e.target.checked); setErrors((er) => ({ ...er, consent: undefined })); }}
              aria-invalid={!!errors.consent}
              aria-describedby={errors.consent ? 'consent-err' : undefined}
              className="mt-0.5 size-5 shrink-0 accent-accent"
            />
            <span className="text-[14px]">ข้าพเจ้าได้อ่านและรับทราบประกาศความเป็นส่วนตัว ฉบับ {pdpaVersion}</span>
          </label>
          {errors.consent && <p id="consent-err" className="text-[13px] text-critical">{errors.consent}</p>}
        </section>

        <FieldRow id="fullName" label="ชื่อ-นามสกุล" required error={errors.fullName}>
          <input id="fullName" autoComplete="name" value={fields.fullName} onChange={set('fullName')} className={inputCls(errors.fullName)} placeholder="เช่น สมชาย ใจดี" aria-invalid={!!errors.fullName} />
        </FieldRow>
        <FieldRow id="phone" label="เบอร์โทรศัพท์" required error={errors.phone}>
          <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={fields.phone} onChange={set('phone')} className={inputCls(errors.phone)} placeholder="เช่น 0812345678" aria-invalid={!!errors.phone} />
        </FieldRow>
        <FieldRow id="customerRef" label="รหัสลูกค้า / รหัสพนักงาน" error={errors.customerRef}>
          <input id="customerRef" value={fields.customerRef} onChange={set('customerRef')} className={inputCls(errors.customerRef)} placeholder="ถ้ามี" />
        </FieldRow>
        <FieldRow id="orgUnit" label="หน่วยงาน / สาขา" error={errors.orgUnit}>
          <input id="orgUnit" value={fields.orgUnit} onChange={set('orgUnit')} className={inputCls(errors.orgUnit)} placeholder="ถ้ามี" />
        </FieldRow>

        {errors.form && <p role="alert" className="rounded-md bg-critical-tint px-3 py-2 text-[14px] text-critical">{errors.form}</p>}

        <button
          type="submit"
          disabled={disabled}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[16px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {liffState === 'idle' && !liffError ? 'กำลังเชื่อมต่อ LINE…' : 'ลงทะเบียน'}
        </button>
      </form>
    </main>
  );
}

function FieldRow({ id, label, required, error, children }: { id: string; label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-semibold text-text-2">
        {label} {required ? <span className="text-critical">*</span> : <span className="font-normal text-muted">(ไม่บังคับ)</span>}
      </label>
      {children}
      {error && <p className="text-[13px] text-critical">{error}</p>}
    </div>
  );
}
