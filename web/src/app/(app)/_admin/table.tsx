/** Table + pager primitives for the admin pages (Inbox visual language: 56px rows, muted header). */
import clsx from 'clsx';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { buttonClass } from '@/components/ui';

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto rounded-xl border border-border bg-surface', className)}>
      <table className="w-full border-collapse text-[13.5px]">{children}</table>
    </div>
  );
}

export const Th = ({ className, ...p }: ComponentProps<'th'>) => (
  <th scope="col" {...p} className={clsx('h-11 whitespace-nowrap bg-surface-muted px-4 text-left text-[12px] font-semibold text-muted first:pl-5', className)} />
);

export const Td = ({ className, ...p }: ComponentProps<'td'>) => (
  <td {...p} className={clsx('h-14 border-t border-divider px-4 align-middle first:pl-5', className)} />
);

export function Pager({ page, pageSize, total, href, unit }: { page: number; pageSize: number; total: number; href: (page: number) => string; unit: string }) {
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 border-t border-divider px-5 py-3 text-[13px] text-muted">
      <span className="tabular">แสดง {from}–{to} จาก {total} {unit}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className={buttonClass('secondary', 'sm')} href={href(page - 1)}>ก่อนหน้า</Link> : <span className={clsx(buttonClass('secondary', 'sm'), 'opacity-50')} aria-disabled>ก่อนหน้า</span>}
        {page < last ? <Link className={buttonClass('secondary', 'sm')} href={href(page + 1)}>ถัดไป</Link> : <span className={clsx(buttonClass('secondary', 'sm'), 'opacity-50')} aria-disabled>ถัดไป</span>}
      </div>
    </div>
  );
}

export const pageBody = 'space-y-6 px-8 py-6';
