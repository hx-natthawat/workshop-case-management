import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { fullWhen, shortWhen } from '@/components/format';
import { Card, Chip, Empty, PageHeader, PriorityChip, StatusChip } from '@/components/ui';
import { contactDetail } from '@/server/admin/contacts';
import { HttpError, requirePageUser } from '@/server/lib/auth';
import { Table, Td, Th } from '../../_admin/table';
import { ContactStatusChip } from '../status-chip';
import { BlockToggle, PhoneReveal } from './contact-actions';

export const metadata = { title: 'ผู้ติดต่อ' };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3 border-t border-divider px-5 py-3 first:border-t-0">
      <dt className="text-[12px] font-semibold text-muted">{label}</dt>
      <dd className="min-w-0 text-[14px]">{children}</dd>
    </div>
  );
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePageUser();
  const { id } = await params;
  const d = await contactDetail(me, id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const c = d.contact;
  const canBlock = me.role !== 'agent';

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{c.name}<ContactStatusChip status={c.status} />{c.isSimulated && <Chip tone="warning">จำลอง</Chip>}</span>}
        subtitle={<Link href="/contacts" className="inline-flex items-center gap-1 hover:text-accent"><ChevronLeft size={14} aria-hidden />กลับไปหน้าผู้ติดต่อ</Link>}
        actions={canBlock ? <BlockToggle contactId={c.id} blocked={c.status === 'blocked'} /> : undefined}
      />
      <div className="grid gap-6 px-8 py-6 lg:grid-cols-[420px_1fr]">
        <Card title="ข้อมูลผู้ติดต่อ" className="self-start">
          <dl>
            <Row label="ชื่อ-นามสกุล">{c.name}</Row>
            <Row label="ชื่อที่แสดงใน LINE">{c.displayName ?? '-'}</Row>
            <Row label="เบอร์โทร">
              {c.hasPhone ? <PhoneReveal contactId={c.id} masked={c.phoneMasked} canReveal={d.canReveal} /> : '-'}
            </Row>
            <Row label="รหัสลูกค้า / พนักงาน"><span className="font-mono text-[13px]">{c.customerRef ?? '-'}</span></Row>
            <Row label="หน่วยงาน">{c.orgUnit ?? '-'}</Row>
            <Row label="ความยินยอม PDPA">{c.consentVersion ? `${c.consentVersion}${c.consentAt ? ` · ${fullWhen(c.consentAt)}` : ''}` : 'ยังไม่ยินยอม'}</Row>
            <Row label="ลงทะเบียนเมื่อ">{fullWhen(c.createdAt)}</Row>
          </dl>
        </Card>

        <Card title={`ประวัติเคส (${d.cases.length})`} className="self-start overflow-hidden">
          {d.cases.length === 0 ? <Empty>ไม่มีเคสที่คุณมีสิทธิ์ดู</Empty> : (
            <Table className="rounded-none border-0">
              <thead>
                <tr><Th>เลขเคส</Th><Th>หัวข้อ · หมวด</Th><Th>Priority</Th><Th>สถานะ</Th><Th>ผู้รับผิดชอบ</Th><Th>วันที่แจ้ง</Th></tr>
              </thead>
              <tbody>
                {d.cases.map((k) => (
                  <tr key={k.id} className="hover:bg-row-hover">
                    <Td><Link href={`/cases/${k.id}`} className="whitespace-nowrap font-mono text-[13px] text-accent hover:underline">{k.caseNo}</Link></Td>
                    <Td>
                      <Link href={`/cases/${k.id}`} className="hover:underline">{k.title}</Link>
                      {k.categoryName && <div className="text-[12px] text-muted">{k.categoryName}</div>}
                    </Td>
                    <Td><PriorityChip priority={k.priority} /></Td>
                    <Td><StatusChip status={k.status} /></Td>
                    <Td className="whitespace-nowrap">{k.assigneeName ?? <span className="text-warning">ยังไม่มอบหมาย</span>}</Td>
                    <Td className="tabular whitespace-nowrap text-muted">{shortWhen(k.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {d.hiddenCaseCount > 0 && (
            <p className="border-t border-divider px-5 py-3 text-[12px] text-muted">มีอีก {d.hiddenCaseCount} เคสที่อยู่นอกสิทธิ์การมองเห็นของคุณ</p>
          )}
        </Card>
      </div>
    </>
  );
}
