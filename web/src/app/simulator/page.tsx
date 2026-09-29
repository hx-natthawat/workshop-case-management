import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { config } from '@/server/lib/config';
import { defaultTenant } from '@/server/lib/tenant';
import { Simulator } from './simulator';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'LINE Simulator · ทดสอบผู้ใช้' };

export default async function SimulatorPage() {
  if (!config.simulatorEnabled()) notFound();
  const tenant = await defaultTenant();
  return <Simulator oaName={tenant.oaName} />;
}
