/** Labels and tones from prototype/mock-data/enums.json. */
import type { CaseStatus, Priority } from '@/server/db/schema';

export type Tone = 'info' | 'neutral' | 'accent' | 'warning' | 'success' | 'critical';

export const STATUS: Record<CaseStatus, { label: string; tone: Tone }> = {
  new: { label: 'ใหม่', tone: 'info' },
  assigned: { label: 'รับเรื่อง', tone: 'neutral' },
  in_progress: { label: 'กำลังดำเนินการ', tone: 'accent' },
  pending_customer: { label: 'รอข้อมูลผู้แจ้ง', tone: 'warning' },
  resolved: { label: 'แก้ไขแล้ว', tone: 'success' },
  closed: { label: 'ปิด', tone: 'neutral' },
  reopened: { label: 'เปิดใหม่', tone: 'critical' },
  cancelled: { label: 'ยกเลิก', tone: 'neutral' },
};

export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  P1: { label: 'วิกฤต', tone: 'critical' },
  P2: { label: 'สูง', tone: 'warning' },
  P3: { label: 'ปกติ', tone: 'info' },
  P4: { label: 'ต่ำ', tone: 'neutral' },
};

export const ROLE_LABEL = { agent: 'Agent', supervisor: 'Supervisor', admin: 'Admin' } as const;

export const OPEN_STATUSES: CaseStatus[] = ['new', 'assigned', 'in_progress', 'pending_customer', 'reopened'];

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '-';
  const d = phone.replace(/\D/g, '');
  if (d.length < 6) return 'xxx';
  return `${d.slice(0, 2)}x-xxx-${d.slice(-4)}`;
}
