/** In-memory failure throttle (one process, ADR 0001). */
export function makeThrottle(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  const recent = (k: string, now: number) => (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  return {
    blocked: (k: string, now = Date.now()) => recent(k, now).length >= max,
    fail: (k: string, now = Date.now()) => { hits.set(k, [...recent(k, now), now]); },
    clear: (k: string) => { hits.delete(k); },
  };
}

/** Wrong second-factor codes: 10 per user per 15 minutes, shared by login, disable and enrolment. */
export const mfaThrottle = makeThrottle(10, 15 * 60_000);
