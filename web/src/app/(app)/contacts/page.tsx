import { Search } from 'lucide-react';
import Link from 'next/link';
import { shortWhen } from '@/components/format';
import { Chip, Empty, Input, PageHeader } from '@/components/ui';
import { listContacts } from '@/server/admin/contacts';
import { requirePageUser } from '@/server/lib/auth';
import { Pager, Table, Td, Th, pageBody } from '../_admin/table';
import { ContactStatusChip } from './status-chip';

export const metadata = { title: 'ผู้ติดต่อ' };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePageUser();
  const sp = await searchParams;
  const q = one(sp.q)?.trim();
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const data = await listContacts(me.tenantId, { q, page });
  const href = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set('q', q);
    if (p > 1) s.set('page', String(p));
    return s.size ? `/contacts?${s}` : '/contacts';
  };

  return (
    <>
      <PageHeader
        title="ผู้ติดต่อ"
        subtitle="ผู้แจ้งที่ลงทะเบียนผ่าน LINE (แสดงเบอร์โทรแบบปิดบังตาม PDPA)"
        actions={
          <form method="get" action="/contacts" role="search" className="relative w-[340px]">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="ค้นหาชื่อหรือรหัสลูกค้า/พนักงาน" aria-label="ค้นหาผู้ติดต่อ" className="pl-9" />
          </form>
        }
      />
      <div className={pageBody}>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {data.items.length === 0 ? <Empty>{q ? `ไม่พบผู้ติดต่อที่ตรงกับ "${q}"` : 'ยังไม่มีผู้ติดต่อ'}</Empty> : (
            <Table className="rounded-none border-0">
              <thead>
                <tr><Th>ชื่อ</Th><Th>เบอร์โทร</Th><Th>รหัสลูกค้า / หน่วยงาน</Th><Th>ความยินยอม PDPA</Th><Th>สถานะ</Th><Th className="text-right">เคสทั้งหมด</Th><Th className="text-right">เคสที่เปิดอยู่</Th></tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="hover:bg-row-hover">
                    <Td>
                      <Link href={`/contacts/${c.id}`} className="font-medium hover:text-accent hover:underline">{c.name}</Link>
                      {c.isSimulated && <Chip tone="warning" className="ml-2">จำลอง</Chip>}
                    </Td>
                    <Td className="tabular whitespace-nowrap">{c.phoneMasked}</Td>
                    <Td>
                      <div className="font-mono text-[12.5px]">{c.customerRef ?? '-'}</div>
                      {c.orgUnit && <div className="text-[12px] text-muted">{c.orgUnit}</div>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {c.consentVersion ? <><span>{c.consentVersion}</span>{c.consentAt && <span className="ml-1.5 text-[12px] text-muted">{shortWhen(c.consentAt)}</span>}</> : <span className="text-muted">ยังไม่ยินยอม</span>}
                    </Td>
                    <Td><ContactStatusChip status={c.status} /></Td>
                    <Td className="tabular text-right">{c.totalCases}</Td>
                    <Td className="tabular text-right">{c.openCases > 0 ? <span className="font-semibold">{c.openCases}</span> : <span className="text-muted">0</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} href={href} unit="ราย" />
        </div>
      </div>
    </>
  );
}
