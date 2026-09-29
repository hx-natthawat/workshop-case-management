import Link from 'next/link';
import { requirePageUser } from '@/server/lib/auth';
import { MfaPanel } from './mfa-panel';

export const dynamic = 'force-dynamic';

/** Outside the app shell so an admin without MFA can reach it (ADR 0006). */
export default async function SecurityPage({ searchParams }: PageProps<'/account/security'>) {
  const user = await requirePageUser(undefined, { allowWithoutMfa: true });
  const sp = await searchParams;
  const required = sp.required === '1' || (user.role === 'admin' && !user.mfaEnabled);
  return (
    <main className="flex min-h-screen items-start justify-center px-4 py-12">
      <div className="w-full max-w-[460px] space-y-5 rounded-xl border border-border bg-surface p-8">
        <div>
          <h1 className="text-[20px] font-semibold">ความปลอดภัยของบัญชี</h1>
          <p className="mt-1 text-[13px] text-muted">{user.name} · {user.email}</p>
        </div>
        {required && !user.mfaEnabled && (
          <p className="rounded-md bg-warning-tint px-3 py-2 text-[13px] text-warning">ผู้ดูแลระบบต้องเปิดใช้การยืนยันตัวตนสองขั้นตอน (MFA) ก่อนใช้งานระบบ</p>
        )}
        <MfaPanel enabled={user.mfaEnabled} canDisable={user.role !== 'admin'} />
        {!(required && !user.mfaEnabled) && <Link href="/dashboard" className="block text-center text-[14px] text-accent underline">กลับสู่ระบบ</Link>}
      </div>
    </main>
  );
}
