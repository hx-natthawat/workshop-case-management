import type { Metadata, Viewport } from 'next';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import { config, isSimUser } from '@/server/lib/config';
import { defaultTenant } from '@/server/lib/tenant';
import { RegisterForm } from './register-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'ลงทะเบียน · ศูนย์แจ้งปัญหา' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RegisterPage({ searchParams }: PageProps<'/liff/register'>) {
  const sp = await searchParams;
  const sim = typeof sp.sim === 'string' ? sp.sim : null;
  const simUserId = sim && config.simulatorEnabled() && isSimUser(sim) ? sim : null;
  const tenant = await defaultTenant();

  let initial = { fullName: '', phone: '', customerRef: '', orgUnit: '' };
  if (simUserId) {
    const [c] = await db.select().from(schema.contact)
      .where(and(eq(schema.contact.tenantId, tenant.id), eq(schema.contact.lineUserId, simUserId)));
    if (c) initial = { fullName: c.fullName ?? '', phone: c.phone ?? '', customerRef: c.customerRef ?? '', orgUnit: c.orgUnit ?? '' };
  }

  return (
    <RegisterForm
      oaName={tenant.oaName}
      pdpaText={tenant.pdpaText}
      pdpaVersion={tenant.pdpaVersion}
      simUserId={simUserId}
      simRequested={!!sim && !simUserId}
      liffId={config.line.liffId()}
      initial={initial}
    />
  );
}
