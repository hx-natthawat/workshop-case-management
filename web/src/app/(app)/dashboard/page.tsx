import clsx from 'clsx';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { Chip, Empty, PriorityChip, StatusChip, buttonClass } from '@/components/ui';
import { timeOnly } from '@/components/format';
import { db, schema } from '@/server/db';
import { formatMinutesTh, type SlaView } from '@/server/case/sla';
import { requirePageUser } from '@/server/lib/auth';
import { SLA_TARGET_PCT, dashboardData, resolveTeamScope } from '@/server/queries/dashboard';
import { listCases } from '@/server/queries/cases';
import { TeamSelect } from './team-select';

const TH_DAYS_LONG = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** Columns of the "cases to handle first" table (prototype grid). */
const RISK_COLS = 'grid grid-cols-[150px_minmax(0,1fr)_70px_150px_150px_130px] gap-3';

function thaiDate(d: Date) {
  const l = new Date(d.getTime() + 7 * 3600_000);
  return `${TH_DAYS_LONG[l.getUTCDay()]} ${l.getUTCDate()} ${TH_MONTHS[l.getUTCMonth()]} ${l.getUTCFullYear() + 543}`;
}

type KpiTone = 'warning' | 'critical' | undefined;
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: KpiTone }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={clsx('tabular text-[30px] font-semibold leading-[1.2]', tone === 'warning' && 'text-warning', tone === 'critical' && 'text-critical')}>{value}</span>
      <span className="text-[12px] text-muted">{sub}</span>
    </div>
  );
}

function SlaCell({ sla }: { sla: SlaView }) {
  if (sla.remaining == null) return <span className="text-muted">-</span>;
  if (sla.state === 'over') return <span className="font-semibold text-critical">เกิน {formatMinutesTh(sla.remaining)}</span>;
  if (sla.state === 'pause') return <span className="font-medium text-muted">{formatMinutesTh(sla.remaining)}</span>;
  const prefix = sla.kind === 'response' ? 'ตอบรับใน ' : '';
  return <span className={clsx('font-semibold', sla.state === 'warn' ? 'text-warning' : 'text-text-2')}>{prefix}{formatMinutesTh(sla.remaining)}</span>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const now = new Date();
  const teams = await db.select({ id: schema.team.id, name: schema.team.name }).from(schema.team).where(eq(schema.team.tenantId, user.tenantId)).orderBy(asc(schema.team.createdAt));
  const teamParam = typeof sp.team === 'string' ? sp.team : undefined;
  const scopeTeamId = resolveTeamScope(user, teamParam, teams.map((t) => t.id));
  const canPickTeam = user.role !== 'agent';

  const [d, risk] = await Promise.all([
    dashboardData(user, now, scopeTeamId),
    listCases(user, { tab: user.role === 'agent' ? 'mine' : 'all', sla: 'risk' }, now),
  ]);
  const ownTeamName = teams.find((t) => t.id === user.teamId)?.name;
  const scopeTeamName = canPickTeam ? (scopeTeamId ? teams.find((t) => t.id === scopeTeamId)?.name : null) : ownTeamName;
  const scopeLabel = scopeTeamName ? `ทีม ${scopeTeamName}` : canPickTeam ? 'ทุกทีม' : null;
  const maxDaily = Math.max(1, ...d.daily.map((x) => x.n));
  const maxCat = Math.max(1, ...d.openByCategory.map((x) => x.n));
  const riskItems = risk.items.filter((r) => d.scopeIds.has(r.id));
  const riskRows = riskItems.slice(0, 8);
  const inboxTab = user.role === 'agent' ? 'mine' : 'all';

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 grow flex-col">
          <h1 className="text-[24px] font-semibold leading-[1.3]">ภาพรวมวันนี้</h1>
          <span className="text-[13px] text-muted">
            {thaiDate(now)} · ข้อมูล ณ {timeOnly(now)} น.{scopeLabel ? ` · ${scopeLabel}` : ''}
            {user.role === 'agent' ? ' · เฉพาะเคสที่คุณเข้าถึงได้' : ''}
          </span>
        </div>
        {canPickTeam && <TeamSelect teams={teams} value={scopeTeamId ?? 'all'} />}
        <Link href="/inbox" className={clsx(buttonClass('primary'), 'px-4 font-semibold')}>เปิดกล่องเคส</Link>
      </div>

      {sp.denied === '1' && (
        <div role="status" className="rounded-md border border-warning/30 bg-warning-tint px-4 py-2.5 text-[13px] text-warning">
          คุณไม่มีสิทธิ์เข้าถึงหน้านั้น
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="เคสเปิดอยู่" value={String(d.open)} sub={`ใหม่วันนี้ ${d.newToday} เคส`} />
        <Kpi label="ยังไม่มอบหมาย" value={String(d.unassigned)} sub={d.oldestUnassignedMin != null ? `เก่าสุด ${formatMinutesTh(d.oldestUnassignedMin)}` : 'ไม่มีเคสค้าง'} />
        <Kpi label="ใกล้เกิน SLA" value={String(d.warn)} sub="ใช้เวลาเกิน 80%" tone="warning" />
        <Kpi label="เกิน SLA" value={String(d.over)} sub={d.overByPriority.length ? d.overByPriority.map((x) => `${x.priority} ${x.n} เคส`).join(' · ') : 'ไม่มีเคสเกิน SLA'} tone="critical" />
        <Kpi label="ผ่าน SLA · 30 วัน" value={d.slaPassPct != null ? `${d.slaPassPct}%` : '-'} sub={`เป้าหมาย ${SLA_TARGET_PCT}%`} />
        <Kpi label="CSAT · 30 วัน" value={d.csatAvg != null ? d.csatAvg.toFixed(1) : '-'} sub={`จาก 5 · ตอบ ${d.csatN} ครั้ง`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-5 py-4 lg:col-span-2">
          <div className="flex items-baseline gap-2.5">
            <h2 className="grow text-[16px] font-semibold">เคสใหม่รายวัน · 14 วันล่าสุด</h2>
            <span className="text-[12px] text-muted">แยกตามช่องทาง: LINE ทั้งหมด</span>
          </div>
          <div className="flex h-[168px] items-end gap-2.5 border-b border-border-strong px-1" role="img" aria-label="กราฟจำนวนเคสใหม่รายวัน 14 วันล่าสุด">
            {d.daily.map((x) => (
              <div key={x.key} className="flex grow basis-0 flex-col items-center gap-1" title={`${x.key}: ${x.n} เคส`}>
                <span className="tabular text-[11.5px] text-text-2">{x.n}</span>
                <div className={clsx('w-full rounded-t', x.today ? 'bg-accent' : 'bg-accent-soft')} style={{ height: `${Math.round((x.n / maxDaily) * 140)}px` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-2.5 px-1">
            {d.daily.map((x) => (
              <span key={x.key} className={clsx('tabular grow basis-0 text-center text-[11.5px]', x.today ? 'font-semibold text-text' : 'text-muted')}>{x.day}</span>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3.5 rounded-xl border border-border bg-surface px-5 py-4">
          <h2 className="text-[16px] font-semibold">เคสเปิดอยู่ตามหมวด</h2>
          {d.openByCategory.length === 0 && <p className="text-[13px] text-muted">ไม่มีเคสเปิดอยู่</p>}
          {d.openByCategory.map((c) => (
            <div key={c.name} className="flex flex-col gap-1.5">
              <div className="flex text-[13px]">
                <span className="grow">{c.name}</span>
                <span className="tabular font-semibold">{c.n}</span>
              </div>
              <div className="h-2 rounded bg-neutral-tint">
                <div className="h-2 rounded bg-accent" style={{ width: `${(c.n / maxCat) * 100}%` }} />
              </div>
            </div>
          ))}
          <div className="mt-auto flex justify-between border-t border-border pt-3 text-[13px]">
            <span className="text-muted">ยังไม่มอบหมาย</span>
            <Link href="/inbox?tab=unassigned" className="font-semibold text-accent hover:underline">{d.unassigned} เคส</Link>
          </div>
        </section>
      </div>

      <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center border-b border-border px-5 py-3.5">
          <h2 className="grow text-[16px] font-semibold">เคสที่ต้องจัดการก่อน · เกินหรือใกล้เกิน SLA</h2>
          <Link href={`/inbox?tab=${inboxTab}&sla=risk`} className="text-[13px] font-semibold text-accent hover:underline">ดูทั้งหมด</Link>
        </div>
        {riskRows.length === 0 ? (
          <Empty>ไม่มีเคสที่เกินหรือใกล้เกิน SLA</Empty>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[860px]" role="table" aria-label="เคสที่ต้องจัดการก่อน">
              <div role="row" className={clsx(RISK_COLS, 'border-b border-border bg-surface-muted px-5 py-2.5 text-[12px] font-semibold text-muted')}>
                <span role="columnheader">เลขเคส</span>
                <span role="columnheader">หัวข้อ</span>
                <span role="columnheader">Priority</span>
                <span role="columnheader">สถานะ</span>
                <span role="columnheader">ผู้รับผิดชอบ</span>
                <span role="columnheader">SLA คงเหลือ</span>
              </div>
              {riskRows.map((r) => (
                <Link
                  key={r.id}
                  href={`/cases/${r.id}`}
                  role="row"
                  className={clsx(RISK_COLS, 'items-center border-b border-divider px-5 py-[11px] text-[13.5px] text-text hover:bg-row-hover', r.sla.state === 'over' && 'bg-critical-row')}
                >
                  <span role="cell" className="font-mono text-[13px] text-accent">{r.caseNo}</span>
                  <span role="cell" className="truncate">{r.title}</span>
                  <span role="cell"><PriorityChip priority={r.priority} /></span>
                  <span role="cell"><StatusChip status={r.status} /></span>
                  <span role="cell">{r.assigneeName ?? 'ยังไม่มอบหมาย'}</span>
                  <span role="cell"><SlaCell sla={r.sla} /></span>
                </Link>
              ))}
            </div>
            {riskItems.length > riskRows.length && (
              <div className="px-5 py-2.5 text-[12px] text-muted">
                แสดง {riskRows.length} จาก {riskItems.length} เคส <Chip tone="neutral" className="ml-1">เรียงตามเวลา SLA คงเหลือ</Chip>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
