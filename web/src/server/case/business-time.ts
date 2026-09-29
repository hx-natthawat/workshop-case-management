/**
 * Business-hours arithmetic for SLA (SPEC §4, analysis A3).
 * Asia/Bangkok has no DST, so a fixed +07:00 offset is exact.
 * Business days are Mon–Fri; public holidays are Phase 2.
 */
const OFFSET_MS = 7 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const DAY_MIN = 24 * 60;

export interface BusinessHours {
  startMin: number; // minutes from local midnight
  endMin: number;
}

export const DEFAULT_HOURS: BusinessHours = { startMin: 9 * 60, endMin: 17 * 60 };

/** Minutes since epoch in local (Bangkok) wall-clock time. */
const toLocalMin = (d: Date) => Math.floor((d.getTime() + OFFSET_MS) / MIN_MS);
const fromLocalMin = (m: number) => new Date(m * MIN_MS - OFFSET_MS);

function isBusinessDay(localMin: number): boolean {
  // Epoch day 0 (1970-01-01) was a Thursday.
  const dow = (Math.floor(localMin / DAY_MIN) + 4) % 7; // 0 = Sunday
  return dow !== 0 && dow !== 6;
}

/** Move to the next moment that is inside business hours (or stay if already inside). */
function alignToBusiness(localMin: number, h: BusinessHours): number {
  let m = localMin;
  for (let i = 0; i < 14; i++) {
    const dayStart = Math.floor(m / DAY_MIN) * DAY_MIN;
    const minOfDay = m - dayStart;
    if (isBusinessDay(m) && minOfDay < h.endMin) {
      return minOfDay < h.startMin ? dayStart + h.startMin : m;
    }
    m = dayStart + DAY_MIN; // next local midnight
  }
  return m;
}

export function addBusinessMinutes(start: Date, minutes: number, h: BusinessHours, businessOnly: boolean): Date {
  if (!businessOnly) return new Date(start.getTime() + minutes * MIN_MS);
  let m = alignToBusiness(toLocalMin(start), h);
  let left = minutes;
  for (let i = 0; i < 10_000; i++) {
    const dayStart = Math.floor(m / DAY_MIN) * DAY_MIN;
    const available = dayStart + h.endMin - m;
    if (left <= available) return fromLocalMin(m + left);
    left -= available;
    m = alignToBusiness(dayStart + DAY_MIN, h);
  }
  throw new Error('addBusinessMinutes: runaway loop');
}

/** Business minutes from a to b. Negative when b is before a. */
export function businessMinutesBetween(a: Date, b: Date, h: BusinessHours, businessOnly: boolean): number {
  if (b < a) return -businessMinutesBetween(b, a, h, businessOnly) || 0; // avoid -0
  if (!businessOnly) return Math.floor((b.getTime() - a.getTime()) / MIN_MS);
  const end = toLocalMin(b);
  let m = alignToBusiness(toLocalMin(a), h);
  let total = 0;
  for (let i = 0; i < 10_000 && m < end; i++) {
    const dayStart = Math.floor(m / DAY_MIN) * DAY_MIN;
    const dayEnd = dayStart + h.endMin;
    total += Math.min(dayEnd, end) - m;
    m = alignToBusiness(dayStart + DAY_MIN, h);
  }
  return total;
}
