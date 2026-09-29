/** Dashboard read model (SPEC §5, analysis S2). Dates are Asia/Bangkok (+07:00, no DST). */
import { eq } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import type { Priority } from '@/server/db/schema';
import { canView, hoursOf, policies } from '@/server/case/service';
import { PRIORITY_ORDER, slaView } from '@/server/case/sla';
import type { SessionUser } from '@/server/lib/auth';
import { OPEN_STATUSES } from '@/server/lib/enums';

const OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

/** "2026-09-29" for the Bangkok calendar day containing `d`. */
export const bkkDayKey = (d: Date) => new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
/** Instant of Bangkok midnight for a "yyyy-mm-dd" key. */
export const bkkDayStart = (key: string) => new Date(`${key}T00:00:00+07:00`);
export const addDaysKey = (key: string, n: number) => bkkDayKey(new Date(bkkDayStart(key).getTime() + n * DAY_MS));

/** Response and resolution both met their due dates (null due = no target = met). */
export function slaMet(c: { firstResponseAt: Date | null; resolvedAt: Date | null; slaResponseDue: Date | null; slaResolveDue: Date | null }) {
  const resp = !c.slaResponseDue || (!!c.firstResponseAt && c.firstResponseAt <= c.slaResponseDue);
  const res = !c.slaResolveDue || (!!c.resolvedAt && c.resolvedAt <= c.slaResolveDue);
  return resp && res;
}

export interface DashboardData {
  now: Date;
  open: number;
  newToday: number;
  unassigned: number;
  oldestUnassignedMin: number | null;
  warn: number;
  over: number;
  overByPriority: { priority: Priority; n: number }[];
  slaPassPct: number | null;
  slaResolvedN: number;
  csatAvg: number | null;
  csatN: number;
  daily: { key: string; day: number; weekday: number; n: number; today: boolean }[];
  openByCategory: { name: string; n: number }[];
  /** Ids of every case counted above (visibility + team scope), for filtering other lists. */
  scopeIds: Set<string>;
}

/** Default SLA pass-rate target shown on the KPI tile (not configurable in the MVP). */
export const SLA_TARGET_PCT = 90;

/**
 * Team scope for the dashboard. Supervisors/admins may pick any team (`?team=<id>`) or
 * all teams (`?team=all`); the default is their own team. Agents always see their own
 * visibility set (canView) and the scope is ignored.
 */
export function resolveTeamScope(u: SessionUser, param: string | undefined, teamIds: string[]): string | null {
  if (u.role === 'agent') return null;
  if (param === 'all') return null;
  if (param && teamIds.includes(param)) return param;
  return u.teamId && teamIds.includes(u.teamId) ? u.teamId : null;
}

export async function dashboardData(u: SessionUser, now = new Date(), teamId: string | null = null): Promise<DashboardData> {
  const [allCases, cats, pol, hours] = await Promise.all([
    db.select({
      id: schema.kase.id, status: schema.kase.status, priority: schema.kase.priority, createdAt: schema.kase.createdAt,
      assigneeId: schema.kase.assigneeId, teamId: schema.kase.teamId, categoryId: schema.kase.categoryId,
      slaResponseDue: schema.kase.slaResponseDue, slaResolveDue: schema.kase.slaResolveDue, slaPausedAt: schema.kase.slaPausedAt,
      firstResponseAt: schema.kase.firstResponseAt, resolvedAt: schema.kase.resolvedAt, closedAt: schema.kase.closedAt,
      updatedAt: schema.kase.updatedAt, csatScore: schema.kase.csatScore,
    }).from(schema.kase).where(eq(schema.kase.tenantId, u.tenantId)),
    db.select().from(schema.category).where(eq(schema.category.tenantId, u.tenantId)),
    policies(u.tenantId),
    hoursOf(u.tenantId),
  ]);
  // Same rule as listCases: agents only count what they can see. Team scope applies to supervisors/admins only.
  const scopeTeam = u.role === 'agent' ? null : teamId;
  const cases = allCases.filter((c) => canView(u, c) && (!scopeTeam || c.teamId === scopeTeam));
  const todayKey = bkkDayKey(now);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);

  const open = cases.filter((c) => OPEN_STATUSES.includes(c.status));
  const unassigned = open.filter((c) => !c.assigneeId);
  const oldest = unassigned.reduce<Date | null>((m, c) => (!m || c.createdAt < m ? c.createdAt : m), null);

  const views = open.map((c) => ({ c, v: slaView(c, pol[c.priority], hours, now) }));
  const overCases = views.filter((x) => x.v.state === 'over');

  const resolved30 = cases.filter((c) => c.resolvedAt && c.resolvedAt >= since30 && c.resolvedAt <= now);
  const met = resolved30.filter(slaMet).length;

  const csat = cases.filter((c) => c.csatScore != null && (c.closedAt ?? c.resolvedAt ?? c.updatedAt) >= since30);
  const csatAvg = csat.length ? csat.reduce((s, c) => s + (c.csatScore ?? 0), 0) / csat.length : null;

  const counts = new Map<string, number>();
  for (const c of cases) {
    const k = bkkDayKey(c.createdAt);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const daily = Array.from({ length: 14 }, (_, i) => {
    const key = addDaysKey(todayKey, i - 13);
    const d = bkkDayStart(key);
    const local = new Date(d.getTime() + OFFSET_MS);
    return { key, day: local.getUTCDate(), weekday: local.getUTCDay(), n: counts.get(key) ?? 0, today: key === todayKey };
  });

  const parentOf = (id: string) => {
    const c = cats.find((x) => x.id === id);
    return c?.parentId ? cats.find((x) => x.id === c.parentId) ?? c : c;
  };
  const byCat = new Map<string, { name: string; n: number; sort: number }>();
  for (const c of open) {
    const p = parentOf(c.categoryId);
    const key = p?.id ?? 'none';
    const e = byCat.get(key) ?? { name: p?.name ?? 'ไม่ระบุหมวด', n: 0, sort: p?.sortOrder ?? 999 };
    e.n++;
    byCat.set(key, e);
  }

  return {
    now,
    open: open.length,
    newToday: cases.filter((c) => bkkDayKey(c.createdAt) === todayKey).length,
    unassigned: unassigned.length,
    oldestUnassignedMin: oldest ? Math.round((now.getTime() - oldest.getTime()) / 60_000) : null,
    warn: views.filter((x) => x.v.state === 'warn').length,
    over: overCases.length,
    overByPriority: PRIORITY_ORDER.map((p) => ({ priority: p, n: overCases.filter((x) => x.c.priority === p).length })).filter((x) => x.n > 0),
    slaPassPct: resolved30.length ? Math.round((met / resolved30.length) * 100) : null,
    slaResolvedN: resolved30.length,
    csatAvg,
    csatN: csat.length,
    daily,
    openByCategory: [...byCat.values()].sort((a, b) => b.n - a.n || a.sort - b.sort).map(({ name, n }) => ({ name, n })),
    scopeIds: new Set(cases.map((c) => c.id)),
  };
}
