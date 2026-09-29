import { describe, expect, it } from 'vitest';
import { addBusinessMinutes, businessMinutesBetween, DEFAULT_HOURS as H } from './business-time';
import { raisePriority, resumeDue, slaView, type SlaPolicyLike } from './sla';

// 2026-09-29 is a Tuesday. Times are Bangkok (+07:00).
const bkk = (s: string) => new Date(`${s}+07:00`);

describe('addBusinessMinutes', () => {
  it('adds within the same business day', () => {
    expect(addBusinessMinutes(bkk('2026-09-29T10:00:00'), 60, H, true)).toEqual(bkk('2026-09-29T11:00:00'));
  });
  it('rolls over to the next morning after 17:00', () => {
    expect(addBusinessMinutes(bkk('2026-09-29T16:30:00'), 60, H, true)).toEqual(bkk('2026-09-30T09:30:00'));
  });
  it('starts counting at 09:00 when created before office hours', () => {
    expect(addBusinessMinutes(bkk('2026-09-29T06:00:00'), 15, H, true)).toEqual(bkk('2026-09-29T09:15:00'));
  });
  it('skips the weekend', () => {
    // Friday 2026-10-02 16:00 + 2h → Monday 10:00
    expect(addBusinessMinutes(bkk('2026-10-02T16:00:00'), 120, H, true)).toEqual(bkk('2026-10-05T10:00:00'));
  });
  it('treats a created-on-Saturday case as starting Monday 09:00', () => {
    expect(addBusinessMinutes(bkk('2026-10-03T11:00:00'), 60, H, true)).toEqual(bkk('2026-10-05T10:00:00'));
  });
  it('counts 3 business days (P3 resolve = 1440 min at 8h/day)', () => {
    expect(addBusinessMinutes(bkk('2026-09-29T10:00:00'), 1440, H, true)).toEqual(bkk('2026-10-02T10:00:00'));
  });
  it('uses wall-clock time for P1 (24/7)', () => {
    expect(addBusinessMinutes(bkk('2026-10-03T23:50:00'), 15, H, false)).toEqual(bkk('2026-10-04T00:05:00'));
  });
});

describe('businessMinutesBetween', () => {
  it('ignores nights and weekends', () => {
    expect(businessMinutesBetween(bkk('2026-10-02T16:00:00'), bkk('2026-10-05T10:00:00'), H, true)).toBe(120);
  });
  it('is negative when reversed', () => {
    expect(businessMinutesBetween(bkk('2026-09-29T11:00:00'), bkk('2026-09-29T10:00:00'), H, true)).toBe(-60);
  });
  it('is zero across a weekend with no office time in between', () => {
    expect(businessMinutesBetween(bkk('2026-10-02T18:00:00'), bkk('2026-10-05T08:00:00'), H, true)).toBe(0);
  });
});

describe('raisePriority', () => {
  it('raises by at most one level', () => {
    expect(raisePriority('P4', 'P2')).toBe('P3');
    expect(raisePriority('P3', 'P2')).toBe('P2');
    expect(raisePriority('P2', 'P1')).toBe('P1');
  });
  it('lets a P1 rule (organisation-wide impact) go straight to P1 (D-010)', () => {
    expect(raisePriority('P3', 'P1')).toBe('P1');
    expect(raisePriority('P4', 'P1')).toBe('P1');
  });
  it('never lowers', () => {
    expect(raisePriority('P2', 'P4')).toBe('P2');
    expect(raisePriority('P3', undefined)).toBe('P3');
  });
});

const P3: SlaPolicyLike = { priority: 'P3', responseMinutes: 240, resolveMinutes: 1440, businessHoursOnly: true };

describe('resumeDue', () => {
  it('extends the due date by the paused business time', () => {
    const due = bkk('2026-09-29T15:00:00');
    // paused at 11:00 with 4h left; resumed next day 10:00 → due 14:00
    expect(resumeDue(bkk('2026-09-29T11:00:00'), due, bkk('2026-09-30T10:00:00'), P3, H)).toEqual(bkk('2026-09-30T14:00:00'));
  });
});

describe('slaView', () => {
  const base = {
    status: 'in_progress' as const, priority: 'P3' as const, createdAt: bkk('2026-09-29T09:00:00'),
    slaResponseDue: bkk('2026-09-29T13:00:00'), slaResolveDue: bkk('2026-10-02T09:00:00'),
    slaPausedAt: null, firstResponseAt: null,
  };
  it('warns at 80% of the response clock', () => {
    expect(slaView(base, P3, H, bkk('2026-09-29T12:20:00')).state).toBe('warn');
    expect(slaView(base, P3, H, bkk('2026-09-29T11:00:00')).state).toBe('ok');
  });
  it('does not breach a business-hour SLA outside office hours; the clock carries over (D-011)', () => {
    const late = { ...base, slaResponseDue: bkk('2026-09-29T17:00:00') };
    const evening = slaView(late, P3, H, bkk('2026-09-29T20:00:00'));
    expect(evening.state).not.toBe('over');
    expect(evening.remaining).toBe(0);
    const nextMorning = slaView(late, P3, H, bkk('2026-09-30T09:20:00'));
    expect(nextMorning.state).toBe('over');
    expect(nextMorning.remaining).toBe(-20);
  });
  it('breaches P1 on the wall clock, 24/7', () => {
    const P1: SlaPolicyLike = { priority: 'P1', responseMinutes: 15, resolveMinutes: 240, businessHoursOnly: false };
    const v = slaView({ ...base, priority: 'P1', slaResponseDue: bkk('2026-10-03T23:00:00') }, P1, H, bkk('2026-10-03T23:10:00'));
    expect(v.state).toBe('over');
    expect(v.remaining).toBe(-10);
  });
  it('is over after the due date', () => {
    const v = slaView(base, P3, H, bkk('2026-09-29T13:12:00'));
    expect(v.state).toBe('over');
    expect(v.remaining).toBe(-12);
  });
  it('switches to the resolve clock after first response', () => {
    const v = slaView({ ...base, firstResponseAt: bkk('2026-09-29T09:10:00') }, P3, H, bkk('2026-09-29T13:30:00'));
    expect(v.kind).toBe('resolve');
    expect(v.state).toBe('ok');
  });
  it('pauses in pending_customer', () => {
    const v = slaView({ ...base, status: 'pending_customer', slaPausedAt: bkk('2026-09-29T10:00:00') }, P3, H, bkk('2026-09-30T10:00:00'));
    expect(v.state).toBe('pause');
    expect(v.remaining).toBe(180);
  });
});
