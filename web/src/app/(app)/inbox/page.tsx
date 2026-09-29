import clsx from 'clsx';
import Link from 'next/link';
import { SlaCell } from '@/components/sla-cell';
import { PageHeader, PriorityChip, StatusChip, buttonClass } from '@/components/ui';
import { shortWhen } from '@/components/format';
import { requirePageUser } from '@/server/lib/auth';
import { PRIORITY, STATUS } from '@/server/lib/enums';
import { listCases, tabCounts, type InboxFilters, type InboxTab } from '@/server/queries/cases';
import { FilterBar } from './filter-bar';

const TAB_LABEL: Record<InboxTab, string> = { mine: 'ของฉัน', team: 'ทีมของฉัน', unassigned: 'ยังไม่มอบหมาย', all: 'ทั้งหมด' };

export default async function InboxPage({ searchParams }: PageProps<'/inbox'>) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const filters: InboxFilters = {
    tab: get('tab') as InboxTab | undefined, status: get('status'), priority: get('priority'), categoryId: get('categoryId'),
    assigneeId: get('assigneeId'), sla: get('sla'), q: get('q'), sort: get('sort'), page: Number(get('page') ?? 1),
  };
  const [data, counts] = await Promise.all([listCases(user, filters), tabCounts(user)]);
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === 'string')), ...patch })) if (v) p.set(k, v as string);
    return `/inbox?${p.toString()}`;
  };
  const from = data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = Math.min(data.total, data.page * data.pageSize);

  return (
    <>
      <PageHeader title="กล่องเคส" actions={<><form action="/inbox" className="relative">
        {data.tab && <input type="hidden" name="tab" value={data.tab} />}
        <label className="sr-only" htmlFor="q">ค้นหา</label>
        <input id="q" name="q" defaultValue={filters.q} placeholder="ค้นหาเลขเคส หัวข้อ หรือผู้แจ้ง"
          className="h-9 w-[320px] rounded-md border border-border-strong bg-surface px-3 text-[14px] placeholder:text-disabled focus:border-accent focus:outline-none" />
      </form>
      <button type="button" disabled title="สร้างเคสแทนผู้แจ้งเปิดใช้ใน Phase 2" className={buttonClass('secondary')}>+ สร้างเคสแทนผู้แจ้ง</button></>}>
        <nav className="-mb-px flex gap-6" aria-label="มุมมอง">
          {Object.entries(counts).map(([tab, n]) => (
            <Link key={tab} href={href({ tab, page: undefined })} aria-current={data.tab === tab ? 'page' : undefined}
              className={clsx('flex items-center gap-2 border-b-2 pb-3 text-[15px]', data.tab === tab ? 'border-accent font-semibold text-accent' : 'border-transparent text-text-2 hover:text-text')}>
              {TAB_LABEL[tab as InboxTab]}
              <span className="tabular rounded-full bg-neutral-tint px-2 text-[12px] font-semibold text-text-2">{n}</span>
            </Link>
          ))}
        </nav>
      </PageHeader>

      <div className="space-y-4 px-8 py-5">
        <FilterBar
          values={{ status: filters.status ?? 'open', priority: filters.priority ?? '', categoryId: filters.categoryId ?? '', assigneeId: filters.assigneeId ?? '', sla: filters.sla ?? '', sort: filters.sort ?? 'sla' }}
          categories={data.categories.map((c) => ({ id: c.id, name: c.name }))}
          assignees={user.role === 'agent' ? [] : data.assignees.map((a) => ({ id: a.id, name: a.name }))}
          statuses={Object.entries(STATUS).map(([code, s]) => ({ code, label: s.label }))}
          priorities={Object.entries(PRIORITY).map(([code, p]) => ({ code, label: `${code} ${p.label}` }))}
        />

        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[1080px] text-[13.5px] [&_td]:whitespace-nowrap">
            <thead className="bg-surface-muted text-left text-[12px] font-semibold text-muted">
              <tr className="h-11 border-b border-divider">
                <th className="px-5">เลขเคส</th>
                <th className="px-3">หัวข้อ · หมวด</th>
                <th className="px-3">ผู้แจ้ง</th>
                <th className="px-3">Priority</th>
                <th className="px-3">สถานะ</th>
                <th className="px-3">ผู้รับผิดชอบ</th>
                <th className="px-3">SLA คงเหลือ</th>
                <th className="px-5">อัปเดต</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className={clsx('h-14 border-b border-divider last:border-0', r.sla.state === 'over' ? 'bg-critical-row' : 'hover:bg-row-hover')}>
                  <td className="px-5"><Link href={`/cases/${r.id}`} className="font-mono text-[13px] text-accent hover:underline">{r.caseNo}</Link></td>
                  <td className="max-w-[380px] px-3 py-2">
                    <Link href={`/cases/${r.id}`} className="flex items-start gap-2">
                      {r.unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-info" aria-label="มีข้อความใหม่" />}
                      <span className="min-w-0">
                        <span className={clsx('block truncate', r.unread && 'font-semibold')}>{r.title}</span>
                        <span className="block truncate text-[12px] text-muted">{r.categoryPath}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3">{r.reporter}</td>
                  <td className="px-3"><PriorityChip priority={r.priority} /></td>
                  <td className="px-3"><StatusChip status={r.status} /></td>
                  <td className="px-3">{r.assigneeName ?? <span className="font-medium text-warning">ยังไม่มอบหมาย</span>}</td>
                  <td className="px-3"><SlaCell sla={r.sla} status={r.status} /></td>
                  <td className="tabular px-5 text-muted">{shortWhen(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && <p className="px-6 py-12 text-center text-muted">ไม่พบเคสตามเงื่อนไขที่เลือก</p>}
          <footer className="flex items-center justify-between border-t border-divider px-5 py-3 text-[13px] text-muted">
            <span>แสดง {from}–{to} จาก {data.total} เคส</span>
            <span className="flex gap-2">
              {data.page > 1 ? <Link className={buttonClass('secondary', 'sm')} href={href({ page: String(data.page - 1) })}>ก่อนหน้า</Link> : <span className={clsx(buttonClass('secondary', 'sm'), 'opacity-40')}>ก่อนหน้า</span>}
              {to < data.total ? <Link className={buttonClass('secondary', 'sm')} href={href({ page: String(data.page + 1) })}>ถัดไป</Link> : <span className={clsx(buttonClass('secondary', 'sm'), 'opacity-40')}>ถัดไป</span>}
            </span>
          </footer>
        </div>
      </div>
    </>
  );
}
