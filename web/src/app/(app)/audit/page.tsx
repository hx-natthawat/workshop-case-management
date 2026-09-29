import Link from 'next/link';
import { fullWhen } from '@/components/format';
import { Button, Empty, PageHeader, Select } from '@/components/ui';
import { auditFacets, listAudit } from '@/server/admin/audit-log';
import { requirePageUser } from '@/server/lib/auth';
import { Pager, Table, Td, Th, pageBody } from '../_admin/table';

export const metadata = { title: 'Audit log' };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

function compact(diff: unknown): string {
  if (diff === null || diff === undefined) return '';
  const s = JSON.stringify(diff);
  return s.length > 240 ? `${s.slice(0, 240)}…` : s;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePageUser(['admin']);
  const sp = await searchParams;
  const action = one(sp.action);
  const entity = one(sp.entity);
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [data, facets] = await Promise.all([listAudit(me.tenantId, { action, entity, page }), auditFacets(me.tenantId)]);

  const href = (p: number) => {
    const q = new URLSearchParams();
    if (action) q.set('action', action);
    if (entity) q.set('entity', entity);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `/audit?${s}` : '/audit';
  };

  return (
    <>
      <PageHeader title="Audit log" subtitle="บันทึกการเปลี่ยนแปลงและการเข้าดูข้อมูลส่วนบุคคล (อ่านอย่างเดียว)" />
      <div className={pageBody}>
        <form method="get" action="/audit" className="flex flex-wrap items-end gap-2">
          <label className="text-[12px] font-semibold text-text-2">
            <span className="mb-1.5 block">Action</span>
            <Select name="action" defaultValue={action ?? ''} className="w-56">
              <option value="">ทั้งหมด</option>
              {facets.actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </label>
          <label className="text-[12px] font-semibold text-text-2">
            <span className="mb-1.5 block">Entity</span>
            <Select name="entity" defaultValue={entity ?? ''} className="w-44">
              <option value="">ทั้งหมด</option>
              {facets.entities.map((e) => <option key={e} value={e}>{e}</option>)}
            </Select>
          </label>
          <Button type="submit">กรอง</Button>
          {(action || entity) && <Link href="/audit" className="px-2 text-[13px] text-accent hover:underline">ล้างตัวกรอง</Link>}
        </form>

        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {data.items.length === 0 ? <Empty>ไม่พบรายการ</Empty> : (
            <Table className="rounded-none border-0">
              <thead>
                <tr><Th>เวลา</Th><Th>ผู้กระทำ</Th><Th>Action</Th><Th>Entity</Th><Th>รายละเอียด</Th><Th>IP</Th></tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="hover:bg-row-hover">
                    <Td className="tabular whitespace-nowrap text-text-2">{fullWhen(r.createdAt)}</Td>
                    <Td className={r.actorType === 'user' ? 'whitespace-nowrap' : 'whitespace-nowrap text-muted'}>{r.actorName}</Td>
                    <Td className="whitespace-nowrap font-mono text-[12.5px]">{r.action}</Td>
                    <Td className="whitespace-nowrap">
                      <span>{r.entity}</span>
                      {r.entityId && (r.entity === 'case'
                        ? <Link href={`/cases/${r.entityId}`} className="ml-1.5 font-mono text-[12px] text-accent hover:underline">{r.entityId.slice(0, 8)}</Link>
                        : <span className="ml-1.5 font-mono text-[12px] text-muted" title={r.entityId}>{r.entityId.slice(0, 8)}</span>)}
                    </Td>
                    <Td className="max-w-[420px]">
                      <code className="block truncate font-mono text-[12px] text-text-2" title={JSON.stringify(r.diff)}>{compact(r.diff)}</code>
                    </Td>
                    <Td className="tabular whitespace-nowrap text-muted">{r.ip ?? '-'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} href={href} unit="รายการ" />
        </div>
      </div>
    </>
  );
}
