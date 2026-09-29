/** Labels for PDPA data-subject requests (#19); client-safe (no server imports). */
import type { DsrStatus, DsrType } from '@/server/db/schema';
import type { Tone } from './enums';

export const DSR_TYPE: Record<DsrType, { label: string; section: string }> = {
  access: { label: 'ขอเข้าถึงและขอสำเนา', section: 'มาตรา 30' },
  portability: { label: 'ขอรับหรือโอนย้ายข้อมูล', section: 'มาตรา 31' },
  object: { label: 'คัดค้านการประมวลผล', section: 'มาตรา 32' },
  erase: { label: 'ขอลบหรือทำให้ไม่ระบุตัวตน', section: 'มาตรา 33' },
  restrict: { label: 'ขอระงับการใช้ข้อมูล', section: 'มาตรา 34' },
  rectify: { label: 'ขอแก้ไขข้อมูลให้ถูกต้อง', section: 'มาตรา 35–36' },
};

export const DSR_STATUS: Record<DsrStatus, { label: string; tone: Tone }> = {
  open: { label: 'รอดำเนินการ', tone: 'warning' },
  completed: { label: 'ดำเนินการแล้ว', tone: 'success' },
  rejected: { label: 'ปฏิเสธคำขอ', tone: 'neutral' },
};
