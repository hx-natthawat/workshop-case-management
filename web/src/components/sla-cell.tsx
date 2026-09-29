import clsx from 'clsx';
import type { SlaView } from '@/server/case/sla';
import { formatMinutesTh } from '@/server/case/sla';

/** SLA remaining cell: over / warn / ok / pause / none (prototype/mock-data/enums.json slaDisplay). */
export function SlaCell({ sla, status }: { sla: SlaView; status: string }) {
  if (status === 'resolved') return <span className="text-disabled">รอผู้แจ้งยืนยัน</span>;
  if (sla.state === 'none' || sla.remaining == null) return <span className="text-disabled">-</span>;
  if (sla.state === 'pause') return <span className="font-medium text-muted">หยุดนับ</span>;
  const text = sla.state === 'over' ? `เกิน ${formatMinutesTh(sla.remaining)}` : formatMinutesTh(sla.remaining);
  return (
    <span className={clsx('tabular', sla.state === 'over' && 'font-semibold text-critical', sla.state === 'warn' && 'font-semibold text-warning', sla.state === 'ok' && 'font-medium text-text-2')}
      title={sla.kind === 'response' ? 'เวลาตอบรับที่เหลือ' : 'เวลาแก้ไขที่เหลือ'}>
      {text}
    </span>
  );
}
