/**
 * MVP reports (SPEC §5, §9 Phase 1 item 6). One function per report, each returning rows.
 * Range = cases created within [from, to] (Bangkok calendar days, inclusive).
 */
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import type { Priority } from '@/server/db/schema';
import { PRIORITY_ORDER } from '@/server/case/sla';
import { HttpError } from '@/server/lib/auth';
import { PRIORITY, STATUS } from '@/server/lib/enums';
import { addDaysKey, bkkDayKey, bkkDayStart } from './dashboard';

export interface DateRange { from: string; to: string }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (s: string | undefined | null): s is string => !!s && DAY_RE.test(s) && bkkDayKey(bkkDayStart(s)) === s;

/** Default: the last 30 days including today. */
export function parseRange(from?: string | null, to?: string | null, now = new Date()): DateRange {
  const today = bkkDayKey(now);
  const t = validDay(to) ? to : today;
  const f = validDay(from) ? from : addDaysKey(t, -29);
  if (f > t) throw new HttpError(400, 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
  return { from: f, to: t };
}

type CaseRow = typeof schema.kase.$inferSelect;

async function load(tenantId: string, r: DateRange) {
  const [cases, cats, users] = await Promise.all([
    db.select().from(schema.kase).where(and(
      eq(schema.kase.tenantId, tenantId),
      gte(schema.kase.createdAt, bkkDayStart(r.from)),
      lt(schema.kase.createdAt, bkkDayStart(addDaysKey(r.to, 1))),
    )).orderBy(asc(schema.kase.createdAt)),
    db.select().from(schema.category).where(eq(schema.category.tenantId, tenantId)),
    db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).where(eq(schema.user.tenantId, tenantId)),
  ]);
  const cat = (id: string) => cats.find((c) => c.id === id);
  const parentName = (id: string) => { const c = cat(id); return c?.parentId ? cat(c.parentId)?.name ?? '-' : c?.name ?? '-'; };
  const childName = (id: string) => { const c = cat(id); return c?.parentId ? c.name : '-'; };
  const userName = (id: string | null) => (id ? users.find((u) => u.id === id)?.name ?? '-' : null);
  return { cases, parentName, childName, userName };
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const mins = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;

// (a) Volume by category ───────────────────────────────────────
export interface VolumeRow { parent: string; child: string; cases: number; sharePct: number | null }
export async function volumeReport(tenantId: string, r: DateRange): Promise<VolumeRow[]> {
  const L = await load(tenantId, r);
  const m = new Map<string, VolumeRow>();
  for (const c of L.cases) {
    const parent = L.parentName(c.categoryId);
    const child = L.childName(c.categoryId);
    const k = `${parent}\u0000${child}`;
    const e = m.get(k) ?? { parent, child, cases: 0, sharePct: null };
    e.cases++;
    m.set(k, e);
  }
  const total = L.cases.length;
  const parentTotals = new Map<string, number>();
  for (const e of m.values()) parentTotals.set(e.parent, (parentTotals.get(e.parent) ?? 0) + e.cases);
  return [...m.values()]
    .map((e) => ({ ...e, sharePct: pct(e.cases, total) }))
    .sort((a, b) => (parentTotals.get(b.parent)! - parentTotals.get(a.parent)!) || a.parent.localeCompare(b.parent, 'th') || b.cases - a.cases);
}

// (b) SLA compliance by priority ───────────────────────────────
type Met = 'met' | 'missed' | 'pending' | 'na';
function responseMet(c: CaseRow, now: Date): Met {
  if (!c.slaResponseDue) return 'na';
  if (c.firstResponseAt) return c.firstResponseAt <= c.slaResponseDue ? 'met' : 'missed';
  if (c.status === 'cancelled') return 'na';
  return now > c.slaResponseDue ? 'missed' : 'pending';
}
function resolveMet(c: CaseRow, now: Date): Met {
  if (!c.slaResolveDue || c.status === 'cancelled') return 'na';
  if (c.resolvedAt) return c.resolvedAt <= c.slaResolveDue ? 'met' : 'missed';
  if (c.status === 'pending_customer') return 'pending'; // clock paused
  return now > c.slaResolveDue ? 'missed' : 'pending';
}

export interface SlaRow { priority: Priority | 'ALL'; label: string; cases: number; responseMet: number; responseMeasured: number; responseMetPct: number | null; resolveMet: number; resolveMeasured: number; resolveMetPct: number | null }
export async function slaReport(tenantId: string, r: DateRange, now = new Date()): Promise<SlaRow[]> {
  const L = await load(tenantId, r);
  const row = (priority: Priority | 'ALL', cs: CaseRow[]): SlaRow => {
    const rs = cs.map((c) => responseMet(c, now));
    const vs = cs.map((c) => resolveMet(c, now));
    const rm = rs.filter((x) => x === 'met').length;
    const rd = rs.filter((x) => x === 'met' || x === 'missed').length;
    const vm = vs.filter((x) => x === 'met').length;
    const vd = vs.filter((x) => x === 'met' || x === 'missed').length;
    return {
      priority, label: priority === 'ALL' ? 'รวมทั้งหมด' : `${priority} ${PRIORITY[priority].label}`, cases: cs.length,
      responseMet: rm, responseMeasured: rd, responseMetPct: pct(rm, rd), resolveMet: vm, resolveMeasured: vd, resolveMetPct: pct(vm, vd),
    };
  };
  return [...PRIORITY_ORDER.map((p) => row(p, L.cases.filter((c) => c.priority === p))), row('ALL', L.cases)];
}

// (c) Average times (wall clock) ───────────────────────────────
export interface TimesRow { group: 'priority' | 'agent'; key: string; cases: number; responded: number; avgResponseMin: number | null; resolved: number; avgResolveMin: number | null }
export async function timesReport(tenantId: string, r: DateRange): Promise<TimesRow[]> {
  const L = await load(tenantId, r);
  const row = (group: TimesRow['group'], key: string, cs: CaseRow[]): TimesRow => {
    const resp = cs.filter((c) => c.firstResponseAt).map((c) => mins(c.createdAt, c.firstResponseAt!));
    const res = cs.filter((c) => c.resolvedAt).map((c) => mins(c.createdAt, c.resolvedAt!));
    return { group, key, cases: cs.length, responded: resp.length, avgResponseMin: avg(resp), resolved: res.length, avgResolveMin: avg(res) };
  };
  const byPriority = PRIORITY_ORDER.map((p) => row('priority', `${p} ${PRIORITY[p].label}`, L.cases.filter((c) => c.priority === p)));
  const agentIds = [...new Set(L.cases.map((c) => c.assigneeId))];
  const byAgent = agentIds
    .map((id) => row('agent', L.userName(id) ?? 'ยังไม่มอบหมาย', L.cases.filter((c) => c.assigneeId === id)))
    .sort((a, b) => b.cases - a.cases);
  return [...byPriority, ...byAgent];
}

// (d) CSAT ─────────────────────────────────────────────────────
export interface CsatSummary { avg: number | null; responses: number; eligible: number; responseRatePct: number | null; distribution: { score: number; n: number; pct: number | null }[] }
export interface CsatAgentRow { agent: string; eligible: number; responses: number; avg: number | null }
export async function csatReport(tenantId: string, r: DateRange): Promise<{ summary: CsatSummary; byAgent: CsatAgentRow[] }> {
  const L = await load(tenantId, r);
  // A survey is sent when a case is resolved; count resolved/closed cases (or any that already have a score) as eligible.
  const eligible = L.cases.filter((c) => c.csatScore != null || c.resolvedAt != null || c.status === 'resolved' || c.status === 'closed');
  const scored = eligible.filter((c) => c.csatScore != null);
  const mean = (cs: CaseRow[]) => (cs.length ? Math.round((cs.reduce((s, c) => s + (c.csatScore ?? 0), 0) / cs.length) * 100) / 100 : null);
  const agentIds = [...new Set(eligible.map((c) => c.assigneeId))];
  return {
    summary: {
      avg: mean(scored), responses: scored.length, eligible: eligible.length, responseRatePct: pct(scored.length, eligible.length),
      distribution: [5, 4, 3, 2, 1].map((score) => { const n = scored.filter((c) => c.csatScore === score).length; return { score, n, pct: pct(n, scored.length) }; }),
    },
    byAgent: agentIds.map((id) => {
      const e = eligible.filter((c) => c.assigneeId === id);
      const s = e.filter((c) => c.csatScore != null);
      return { agent: L.userName(id) ?? 'ยังไม่มอบหมาย', eligible: e.length, responses: s.length, avg: mean(s) };
    }).sort((a, b) => b.responses - a.responses),
  };
}

// Case list export (contains personal data — SPEC §8) ─────────
export interface CaseExportRow { caseNo: string; createdAt: Date; category: string; priority: Priority; status: string; assignee: string; reporterName: string; reporterPhone: string; firstResponseAt: Date | null; resolvedAt: Date | null; csat: number | null }
export async function caseExport(tenantId: string, r: DateRange): Promise<CaseExportRow[]> {
  const L = await load(tenantId, r);
  const contactIds = [...new Set(L.cases.map((c) => c.contactId))];
  const contacts = contactIds.length
    ? await db.select({ id: schema.contact.id, fullName: schema.contact.fullName, displayName: schema.contact.displayName, phone: schema.contact.phone }).from(schema.contact).where(and(eq(schema.contact.tenantId, tenantId), inArray(schema.contact.id, contactIds)))
    : [];
  const byId = new Map(contacts.map((c) => [c.id, c]));
  return L.cases.map((c) => {
    const ct = byId.get(c.contactId);
    const child = L.childName(c.categoryId);
    return {
      caseNo: c.caseNo, createdAt: c.createdAt,
      category: child === '-' ? L.parentName(c.categoryId) : `${L.parentName(c.categoryId)} › ${child}`,
      priority: c.priority, status: STATUS[c.status].label, assignee: L.userName(c.assigneeId) ?? 'ยังไม่มอบหมาย',
      reporterName: ct?.fullName ?? ct?.displayName ?? '-', reporterPhone: ct?.phone ?? '',
      firstResponseAt: c.firstResponseAt, resolvedAt: c.resolvedAt, csat: c.csatScore,
    };
  });
}

// Tabular form for CSV/JSON export ─────────────────────────────
export const REPORT_TYPES = ['volume', 'sla', 'times', 'csat', 'cases'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export interface Table { columns: string[]; rows: (string | number | null)[][] }

/** "2026-09-29 10:45" Bangkok time. */
const bkkDateTime = (d: Date | null) => (d ? new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '');

export async function reportTable(type: ReportType, tenantId: string, r: DateRange): Promise<Table> {
  switch (type) {
    case 'volume': {
      const rows = await volumeReport(tenantId, r);
      return { columns: ['หมวดหลัก', 'หมวดย่อย', 'จำนวนเคส', 'สัดส่วน (%)'], rows: rows.map((x) => [x.parent, x.child, x.cases, x.sharePct]) };
    }
    case 'sla': {
      const rows = await slaReport(tenantId, r);
      return {
        columns: ['Priority', 'จำนวนเคส', 'ตอบรับทันเวลา', 'ตอบรับที่วัดผลได้', 'ตอบรับทัน SLA (%)', 'แก้ไขทันเวลา', 'แก้ไขที่วัดผลได้', 'แก้ไขทัน SLA (%)'],
        rows: rows.map((x) => [x.label, x.cases, x.responseMet, x.responseMeasured, x.responseMetPct, x.resolveMet, x.resolveMeasured, x.resolveMetPct]),
      };
    }
    case 'times': {
      const rows = await timesReport(tenantId, r);
      return {
        columns: ['กลุ่ม', 'รายการ', 'จำนวนเคส', 'ตอบรับแล้ว', 'เวลาตอบรับเฉลี่ย (นาที, เวลาจริง)', 'แก้ไขแล้ว', 'เวลาแก้ไขเฉลี่ย (นาที, เวลาจริง)'],
        rows: rows.map((x) => [x.group === 'priority' ? 'Priority' : 'ผู้รับผิดชอบ', x.key, x.cases, x.responded, x.avgResponseMin, x.resolved, x.avgResolveMin]),
      };
    }
    case 'csat': {
      const { summary: s, byAgent } = await csatReport(tenantId, r);
      return {
        columns: ['กลุ่ม', 'รายการ', 'เคสที่ส่งแบบประเมิน', 'จำนวนผู้ตอบ', 'คะแนนเฉลี่ย', 'อัตราการตอบ (%)'],
        rows: [
          ['รวม', 'ทั้งหมด', s.eligible, s.responses, s.avg, s.responseRatePct],
          ...s.distribution.map((d) => ['การกระจายคะแนน', `${d.score} คะแนน`, null, d.n, null, d.pct]),
          ...byAgent.map((a) => ['ผู้รับผิดชอบ', a.agent, a.eligible, a.responses, a.avg, pct(a.responses, a.eligible)]),
        ],
      };
    }
    case 'cases': {
      const rows = await caseExport(tenantId, r);
      return {
        columns: ['เลขเคส', 'วันที่สร้าง', 'หมวด', 'Priority', 'สถานะ', 'ผู้รับผิดชอบ', 'ชื่อผู้แจ้ง', 'เบอร์โทรผู้แจ้ง', 'ตอบรับครั้งแรก', 'แก้ไขเสร็จ', 'CSAT'],
        rows: rows.map((x) => [x.caseNo, bkkDateTime(x.createdAt), x.category, x.priority, x.status, x.assignee, x.reporterName, x.reporterPhone, bkkDateTime(x.firstResponseAt), bkkDateTime(x.resolvedAt), x.csat]),
      };
    }
  }
}

function csvCell(v: string | number | null): string {
  if (v == null) return '';
  let s = String(v);
  // Neutralise spreadsheet formula injection from user-supplied text.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 with BOM so Excel renders Thai correctly. */
export function toCsv(t: Table): string {
  return '﻿' + [t.columns, ...t.rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
