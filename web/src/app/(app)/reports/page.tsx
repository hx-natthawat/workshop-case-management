import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, Empty, Field, Input, PageHeader, buttonClass } from '@/components/ui';
import { formatMinutesTh } from '@/server/case/sla';
import { requirePageUser } from '@/server/lib/auth';
import { csatReport, parseRange, slaReport, timesReport, volumeReport, type DateRange, type ReportType } from '@/server/queries/reports';

const exportHref = (type: ReportType, r: DateRange) => `/api/reports/${type}?from=${r.from}&to=${r.to}&format=csv`;

function ExportLink({ type, range }: { type: ReportType; range: DateRange }) {
  return <a href={exportHref(type, range)} download className={buttonClass('secondary', 'sm')}>Export CSV</a>;
}

const fmtPct = (v: number | null) => (v == null ? '-' : `${v}%`);
const fmtMin = (v: number | null) => (v == null ? '-' : formatMinutesTh(v));

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th className={clsx('px-4 py-2.5 font-semibold', right ? 'text-right' : 'text-left')}>{children}</th>;
}
function Td({ children, right, className }: { children: ReactNode; right?: boolean; className?: string }) {
  return <td className={clsx('px-4 py-2.5', right && 'tabular text-right', className)}>{children}</td>;
}
function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13.5px]">
        <thead className="bg-surface-muted text-[12px] text-text-2"><tr>{head}</tr></thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-divider">{children}</tbody>
      </table>
    </div>
  );
}
function Bar({ pct, tone = 'accent' }: { pct: number | null; tone?: 'accent' | 'warning' | 'critical' }) {
  return (
    <div className="h-1.5 w-full min-w-16 rounded-full bg-neutral-tint">
      <div className={clsx('h-1.5 rounded-full', tone === 'accent' ? 'bg-accent' : tone === 'warning' ? 'bg-warning' : 'bg-critical')} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
    </div>
  );
}
const slaTone = (v: number | null) => (v == null || v >= 90 ? 'accent' : v >= 75 ? 'warning' : 'critical');

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser(['supervisor', 'admin']);
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  let range: DateRange;
  let rangeError: string | null = null;
  try {
    range = parseRange(one(sp.from), one(sp.to));
  } catch (e) {
    range = parseRange();
    rangeError = e instanceof Error ? e.message : 'ช่วงวันที่ไม่ถูกต้อง';
  }
  const [volume, sla, times, csat] = await Promise.all([
    volumeReport(user.tenantId, range),
    slaReport(user.tenantId, range),
    timesReport(user.tenantId, range),
    csatReport(user.tenantId, range),
  ]);
  const totalCases = volume.reduce((s, x) => s + x.cases, 0);
  const byPriority = times.filter((x) => x.group === 'priority');
  const byAgent = times.filter((x) => x.group === 'agent');
  const maxDist = Math.max(1, ...csat.summary.distribution.map((d) => d.n));

  return (
    <>
      <PageHeader title="รายงาน" subtitle={`เคสที่สร้างระหว่างวันที่ ${range.from} ถึง ${range.to} · ทั้งหมด ${totalCases} เคส`} />
      <div className="space-y-6 px-8 py-6">
        <Card>
          <form method="get" className="flex flex-wrap items-end gap-4 px-5 py-4">
            <div className="w-44"><Field label="ตั้งแต่วันที่" htmlFor="from"><Input id="from" type="date" name="from" defaultValue={range.from} /></Field></div>
            <div className="w-44"><Field label="ถึงวันที่" htmlFor="to"><Input id="to" type="date" name="to" defaultValue={range.to} /></Field></div>
            <button type="submit" className={buttonClass('primary')}>แสดงรายงาน</button>
            <Link href="/reports" className={buttonClass('ghost')}>30 วันล่าสุด</Link>
            {rangeError && <p className="w-full text-[12px] text-critical">{rangeError} ระบบแสดงข้อมูล 30 วันล่าสุดแทน</p>}
          </form>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="ปริมาณเคสตามหมวด" action={<ExportLink type="volume" range={range} />}>
            {volume.length === 0 ? <Empty>ไม่มีเคสในช่วงเวลานี้</Empty> : (
              <Table head={<><Th>หมวด</Th><Th right>จำนวนเคส</Th><Th right>สัดส่วน</Th><Th>{' '}</Th></>}>
                {volume.map((v) => (
                  <tr key={`${v.parent}-${v.child}`}>
                    <Td>{v.parent}{v.child !== '-' && <span className="text-muted"> › {v.child}</span>}</Td>
                    <Td right>{v.cases}</Td>
                    <Td right>{fmtPct(v.sharePct)}</Td>
                    <Td className="w-32"><Bar pct={v.sharePct} /></Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="อัตราผ่าน SLA" action={<ExportLink type="sla" range={range} />}>
            <Table head={<><Th>Priority</Th><Th right>จำนวนเคส</Th><Th right>ตอบรับทัน SLA</Th><Th right>แก้ไขทัน SLA</Th></>}>
              {sla.map((s) => (
                <tr key={s.priority} className={clsx(s.priority === 'ALL' && 'bg-surface-muted font-semibold')}>
                  <Td>{s.label}</Td>
                  <Td right>{s.cases}</Td>
                  <Td right><div>{fmtPct(s.responseMetPct)} <span className="text-[12px] font-normal text-muted">({s.responseMet}/{s.responseMeasured})</span></div><Bar pct={s.responseMetPct} tone={slaTone(s.responseMetPct)} /></Td>
                  <Td right><div>{fmtPct(s.resolveMetPct)} <span className="text-[12px] font-normal text-muted">({s.resolveMet}/{s.resolveMeasured})</span></div><Bar pct={s.resolveMetPct} tone={slaTone(s.resolveMetPct)} /></Td>
                </tr>
              ))}
            </Table>
            <p className="border-t border-divider px-5 py-2.5 text-[12px] text-muted">นับเฉพาะเคสที่ครบกำหนดหรือดำเนินการแล้ว เคสที่ยังไม่ถึงกำหนดและเคสที่ยกเลิกไม่นำมาคำนวณ</p>
          </Card>

          <Card title="เวลาตอบรับและแก้ไขเฉลี่ย" action={<ExportLink type="times" range={range} />}>
            <Table head={<><Th>Priority</Th><Th right>จำนวนเคส</Th><Th right>ตอบรับเฉลี่ย</Th><Th right>แก้ไขเฉลี่ย</Th></>}>
              {byPriority.map((t) => (
                <tr key={t.key}><Td>{t.key}</Td><Td right>{t.cases}</Td><Td right>{fmtMin(t.avgResponseMin)}</Td><Td right>{fmtMin(t.avgResolveMin)}</Td></tr>
              ))}
            </Table>
            <div className="border-t border-border" />
            <Table head={<><Th>ผู้รับผิดชอบ</Th><Th right>จำนวนเคส</Th><Th right>ตอบรับเฉลี่ย</Th><Th right>แก้ไขเฉลี่ย</Th></>}>
              {byAgent.map((t) => (
                <tr key={t.key}><Td>{t.key}</Td><Td right>{t.cases}</Td><Td right>{fmtMin(t.avgResponseMin)}</Td><Td right>{fmtMin(t.avgResolveMin)}</Td></tr>
              ))}
            </Table>
            <p className="border-t border-divider px-5 py-2.5 text-[12px] text-muted">คำนวณจากเวลาจริงนับจากสร้างเคส (ไม่หักนอกเวลาทำการหรือช่วงรอข้อมูลผู้แจ้ง)</p>
          </Card>

          <Card title="ความพึงพอใจ (CSAT)" action={<ExportLink type="csat" range={range} />}>
            <div className="grid grid-cols-3 gap-4 px-5 py-4">
              <div><div className="text-[12px] text-muted">คะแนนเฉลี่ย</div><div className="tabular text-[26px] font-semibold">{csat.summary.avg?.toFixed(2) ?? '-'}<span className="text-[13px] font-normal text-muted"> / 5</span></div></div>
              <div><div className="text-[12px] text-muted">จำนวนผู้ตอบ</div><div className="tabular text-[26px] font-semibold">{csat.summary.responses}</div></div>
              <div><div className="text-[12px] text-muted">อัตราการตอบ</div><div className="tabular text-[26px] font-semibold">{fmtPct(csat.summary.responseRatePct)}</div><div className="text-[12px] text-muted">จาก {csat.summary.eligible} เคสที่แก้ไขแล้ว</div></div>
            </div>
            <div className="space-y-1.5 px-5 pb-4">
              {csat.summary.distribution.map((d) => (
                <div key={d.score} className="flex items-center gap-3 text-[13px]">
                  <span className="w-14 text-text-2">{d.score} คะแนน</span>
                  <div className="h-2 flex-1 rounded-full bg-neutral-tint"><div className="h-2 rounded-full bg-accent" style={{ width: `${(d.n / maxDist) * 100}%` }} /></div>
                  <span className="tabular w-20 text-right text-muted">{d.n} ({fmtPct(d.pct)})</span>
                </div>
              ))}
            </div>
            <Table head={<><Th>ผู้รับผิดชอบ</Th><Th right>เคสที่แก้ไขแล้ว</Th><Th right>ผู้ตอบ</Th><Th right>คะแนนเฉลี่ย</Th></>}>
              {csat.byAgent.map((a) => (
                <tr key={a.agent}><Td>{a.agent}</Td><Td right>{a.eligible}</Td><Td right>{a.responses}</Td><Td right>{a.avg?.toFixed(2) ?? '-'}</Td></tr>
              ))}
            </Table>
          </Card>
        </div>

        <Card title="ส่งออกรายการเคส">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <p className="max-w-2xl text-[13px] text-text-2">
              ไฟล์นี้มีข้อมูลส่วนบุคคลของผู้แจ้ง (ชื่อและเบอร์โทรศัพท์แบบเต็ม) ระบบจะบันทึกการส่งออกทุกครั้งใน Audit log
              กรุณาใช้งานและจัดเก็บตามนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)
            </p>
            <a href={exportHref('cases', range)} download className={buttonClass('danger')}>Export รายการเคส (มีข้อมูลส่วนบุคคล)</a>
          </div>
        </Card>
      </div>
    </>
  );
}
