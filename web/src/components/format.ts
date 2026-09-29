const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const local = (d: Date) => new Date(d.getTime() + 7 * 3600_000);
const hm = (d: Date) => { const l = local(d); return `${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}`; };

/** "10:42" today, "เมื่อวาน" yesterday, else "28 ก.ย." (Bangkok time). */
export function shortWhen(d: Date | string, now = new Date()): string {
  const x = new Date(d);
  const dayOf = (v: Date) => Math.floor(local(v).getTime() / 86_400_000);
  const diff = dayOf(now) - dayOf(x);
  if (diff === 0) return hm(x);
  if (diff === 1) return 'เมื่อวาน';
  const l = local(x);
  return `${l.getUTCDate()} ${TH_MONTHS[l.getUTCMonth()]}`;
}

export function fullWhen(d: Date | string): string {
  const l = local(new Date(d));
  return `${l.getUTCDate()} ${TH_MONTHS[l.getUTCMonth()]} ${l.getUTCFullYear() + 543} · ${hm(new Date(d))} น.`;
}

export const timeOnly = (d: Date | string) => hm(new Date(d));
