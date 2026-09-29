import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { config } from '@/server/lib/config';
import { accessCodeConfigured, hasSimulatorAccess } from '@/server/lib/sim-access';
import { defaultTenant } from '@/server/lib/tenant';
import { AccessCodeForm } from './access-code-form';
import { Simulator } from './simulator';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'LINE Simulator · ทดสอบผู้ใช้' };

export default async function SimulatorPage() {
  if (!config.simulatorEnabled()) notFound();
  if (!(await hasSimulatorAccess())) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-[380px] space-y-4 rounded-xl border border-border bg-surface p-8">
          <h1 className="text-[18px] font-semibold">LINE Simulator</h1>
          <p className="text-[14px] text-muted">สำหรับผู้ทดสอบเท่านั้น กรุณาใส่รหัสผู้ทดสอบที่ได้รับจากผู้ดูแลการทดสอบ หรือเข้าสู่ระบบในฐานะเจ้าหน้าที่</p>
          {accessCodeConfigured() && <AccessCodeForm />}
          <Link href="/login?next=/simulator" className="block text-center text-[14px] text-accent underline">เข้าสู่ระบบเจ้าหน้าที่</Link>
        </div>
      </main>
    );
  }
  const tenant = await defaultTenant();
  return <Simulator oaName={tenant.oaName} />;
}
