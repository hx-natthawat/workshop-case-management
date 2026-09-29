import type { CaseStatus, Priority } from '@/server/db/schema';
import { addBusinessMinutes, businessMinutesBetween, type BusinessHours } from './business-time';

export interface SlaPolicyLike {
  priority: Priority;
  responseMinutes: number;
  resolveMinutes: number;
  businessHoursOnly: boolean;
}

export const PRIORITY_ORDER: Priority[] = ['P1', 'P2', 'P3', 'P4'];

/** SPEC §4: the impact answer can raise the category priority by at most one level. */
export function raisePriority(base: Priority, requested: Priority | undefined): Priority {
  if (!requested) return base;
  const b = PRIORITY_ORDER.indexOf(base);
  const r = PRIORITY_ORDER.indexOf(requested);
  if (r >= b) return base;
  return PRIORITY_ORDER[Math.max(r, b - 1)];
}

export function computeDues(createdAt: Date, policy: SlaPolicyLike, h: BusinessHours) {
  return {
    responseDue: addBusinessMinutes(createdAt, policy.responseMinutes, h, policy.businessHoursOnly),
    resolveDue: addBusinessMinutes(createdAt, policy.resolveMinutes, h, policy.businessHoursOnly),
  };
}

/**
 * Remaining minutes until `due`, measured on the SLA clock.
 * Once past the due time it is overdue by wall-clock minutes (a due time is absolute),
 * so a case due at 17:00 is already late at 17:05 even though office hours ended.
 */
export function remainingMinutes(now: Date, due: Date, policy: SlaPolicyLike, h: BusinessHours) {
  if (now.getTime() > due.getTime()) return -Math.max(1, Math.round((now.getTime() - due.getTime()) / 60_000));
  return businessMinutesBetween(now, due, h, policy.businessHoursOnly);
}

/** When the clock resumes after a pause, push the due date out by the paused time. */
export function resumeDue(pausedAt: Date, due: Date, now: Date, policy: SlaPolicyLike, h: BusinessHours): Date {
  const left = remainingMinutes(pausedAt, due, policy, h);
  if (left <= 0) {
    // Already overdue when paused: keep it overdue by the same amount.
    return new Date(now.getTime() + left * 60_000);
  }
  return addBusinessMinutes(now, left, h, policy.businessHoursOnly);
}

export type SlaState = 'over' | 'warn' | 'ok' | 'pause' | 'none' | 'met';

export interface SlaView {
  state: SlaState;
  remaining: number | null; // minutes on the SLA clock
  pct: number | null; // 0..1+ elapsed
  kind: 'response' | 'resolve' | null;
}

interface CaseSlaFields {
  status: CaseStatus;
  priority: Priority;
  createdAt: Date;
  slaResponseDue: Date | null;
  slaResolveDue: Date | null;
  slaPausedAt: Date | null;
  firstResponseAt: Date | null;
}

const CLOSED: CaseStatus[] = ['closed', 'cancelled'];

/** Which clock matters right now for list views: response until first reply, then resolve. */
export function slaView(c: CaseSlaFields, policy: SlaPolicyLike, h: BusinessHours, now: Date): SlaView {
  if (CLOSED.includes(c.status)) return { state: 'none', remaining: null, pct: null, kind: null };
  if (c.status === 'resolved') return { state: 'none', remaining: null, pct: null, kind: null };
  const clockAt = c.status === 'pending_customer' && c.slaPausedAt ? c.slaPausedAt : now;
  const useResponse = !c.firstResponseAt && c.slaResponseDue;
  const due = useResponse ? c.slaResponseDue : c.slaResolveDue;
  const total = useResponse ? policy.responseMinutes : policy.resolveMinutes;
  if (!due) return { state: 'none', remaining: null, pct: null, kind: null };
  const remaining = remainingMinutes(clockAt, due, policy, h);
  const pct = total > 0 ? (total - remaining) / total : 1;
  const kind = useResponse ? 'response' : 'resolve';
  if (c.status === 'pending_customer') return { state: 'pause', remaining, pct, kind };
  if (remaining < 0) return { state: 'over', remaining, pct, kind };
  if (pct >= 0.8) return { state: 'warn', remaining, pct, kind };
  return { state: 'ok', remaining, pct, kind };
}

/** "3 ชม. 40 นาที" style duration for SLA cells. */
export function formatMinutesTh(min: number): string {
  const m = Math.abs(Math.round(min));
  if (m < 60) return `${m} นาที`;
  const days = Math.floor(m / (60 * 24));
  const hours = Math.floor((m % (60 * 24)) / 60);
  const mins = m % 60;
  if (days > 0) return hours ? `${days} วัน ${hours} ชม.` : `${days} วัน`;
  return mins ? `${hours} ชม. ${mins} นาที` : `${hours} ชม.`;
}
