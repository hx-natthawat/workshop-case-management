'use client';

import { QR_OPTION_MAX, type Q } from './types';

const polite = (s: string) => (/(ครับ|คะ|ค่ะ)$/.test(s.trim()) ? s.trim() : `${s.trim()}ครับ`);
const qrLabel = (s: string) => s.slice(0, 20); // LINE truncates Quick Reply labels at 20 chars

const HINT: Partial<Record<Q['type'], string>> = {
  phone: '(ตัวอย่าง 0812345678)', email: '(ตัวอย่าง name@example.com)', number: '(ตัวเลขเท่านั้น)',
  location: '(กดส่งตำแหน่ง หรือพิมพ์ชื่อสาขา/สถานที่)',
};

/** Mirrors promptQuestion() in src/server/bot/dialog.ts. */
export function LinePreview({ q, index, total }: { q: Q | null; index: number; total: number }) {
  let chips: string[] = [];
  let list: string[] | null = null;
  let hint = q ? HINT[q.type] : undefined;
  if (q) {
    const skip = q.required ? [] : ['ข้าม'];
    switch (q.type) {
      case 'single_choice': {
        const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
        if (opts.length <= QR_OPTION_MAX) chips = [...opts, ...skip, 'ย้อนกลับ'];
        else { list = opts; chips = [...skip, 'ย้อนกลับ']; }
        break;
      }
      case 'datetime': chips = ['เลือกวันและเวลา', 'เพิ่งเกิดเมื่อสักครู่', ...skip, 'ย้อนกลับ']; break;
      case 'location': chips = ['ส่งตำแหน่ง', ...skip, 'ย้อนกลับ']; break;
      case 'attachment':
        hint = `(ส่งรูป วิดีโอ เสียง หรือไฟล์ได้สูงสุด ${q.validation?.maxFiles ?? 5} ไฟล์ เมื่อครบแล้วกด "เสร็จ")`;
        chips = ['เลือกรูป/วิดีโอ', 'ถ่ายรูป', ...skip, 'ย้อนกลับ'];
        break;
      default: chips = [...skip, 'ย้อนกลับ'];
    }
  }

  return (
    <div className="flex min-h-[440px] flex-1 flex-col gap-3">
      <h2 className="text-[14px] font-semibold">ตัวอย่างใน LINE</h2>
      <div className="flex flex-1 flex-col justify-end gap-2.5 rounded-[16px] bg-line-chat px-3 py-3.5">
        {!q ? (
          <p className="m-auto text-center text-[13px] text-muted">เลือกคำถามเพื่อดูตัวอย่าง</p>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[10.5px] font-bold text-white">CS</span>
              <div className="flex max-w-[85%] flex-col gap-[3px] whitespace-pre-line rounded-[16px_16px_16px_4px] bg-white px-3 py-[9px] text-[13.5px] leading-[1.55]">
                <span className="text-[11.5px] font-semibold text-muted">ข้อ {index} จาก {total}</span>
                <span>{polite(q.label || '(ยังไม่มีข้อความคำถาม)')}</span>
                {hint && <span className="text-[12.5px] text-muted">{hint}</span>}
              </div>
            </div>
            {list && (
              <div className="ml-9 w-[85%] overflow-hidden rounded-[16px] bg-white text-[13px]">
                <p className="border-b border-divider px-3 py-2 font-semibold">{q.label}</p>
                <ul className="max-h-56 overflow-y-auto">
                  {list.map((o, i) => <li key={i} className="border-b border-divider px-3 py-2 text-accent last:border-0">{o}</li>)}
                </ul>
              </div>
            )}
            {list && (
              <div className="ml-9 max-w-[85%] rounded-[16px] bg-white px-3 py-[9px] text-[13.5px]">เลือกจากรายการด้านบนครับ</div>
            )}
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.map((c, i) => (
                  <span key={i} className="flex h-[30px] items-center rounded-full border border-accent bg-white px-3 text-[12.5px] font-medium text-accent">{qrLabel(c)}</span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <p className="text-[12px] leading-[1.5] text-muted">
        ตัวอย่างแสดงคำถามที่เลือกอยู่ {q?.type === 'single_choice' && (q.options?.filter(Boolean).length ?? 0) > QR_OPTION_MAX ? `ตัวเลือกเกิน ${QR_OPTION_MAX} รายการจะแสดงเป็นรายการแทน Quick Reply ` : ''}
        การเปลี่ยนแปลงมีผลกับบทสนทนาใหม่หลัง publish เท่านั้น
      </p>
    </div>
  );
}
