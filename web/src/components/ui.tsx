import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ComponentProps, ReactNode } from 'react';
import type { CaseStatus, Priority } from '@/server/db/schema';
import { PRIORITY, STATUS, type Tone } from '@/server/lib/enums';

/** clsx + tailwind-merge so a caller's class (e.g. h-8) overrides the component default. */
export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

export const TONE: Record<Tone, string> = {
  info: 'bg-info-tint text-info',
  neutral: 'bg-neutral-tint text-neutral',
  accent: 'bg-accent-tint text-accent',
  warning: 'bg-warning-tint text-warning',
  success: 'bg-success-tint text-success',
  critical: 'bg-critical-tint text-critical',
};

export function Chip({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[12px] font-medium', TONE[tone], className)}>
      {children}
    </span>
  );
}

export const StatusChip = ({ status }: { status: CaseStatus }) => <Chip tone={STATUS[status].tone}>{STATUS[status].label}</Chip>;
export const PriorityChip = ({ priority, withLabel }: { priority: Priority; withLabel?: boolean }) => (
  <Chip tone={PRIORITY[priority].tone}>{priority}{withLabel ? ` ${PRIORITY[priority].label}` : ''}</Chip>
);

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover border border-accent',
  secondary: 'bg-surface text-text border border-border-strong hover:bg-row-hover',
  ghost: 'text-text-2 hover:bg-hover border border-transparent',
  danger: 'bg-surface text-critical border border-critical/40 hover:bg-critical-tint',
};
export function buttonClass(variant: BtnVariant = 'secondary', size: 'md' | 'sm' = 'md') {
  return cn(
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none',
    size === 'md' ? 'h-9 px-3.5 text-[14px]' : 'h-8 px-3 text-[13px]',
    BTN[variant],
  );
}
export function Button({ variant = 'secondary', size = 'md', className, ...p }: ComponentProps<'button'> & { variant?: BtnVariant; size?: 'md' | 'sm' }) {
  return <button type="button" {...p} className={cn(buttonClass(variant, size), className)} />;
}

export function Card({ className, children, title, action }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cn('rounded-xl border border-border bg-surface', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-divider px-5 py-3.5">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="border-b border-border bg-surface px-8 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4">
        <div>
          <h1 className="text-[24px] font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export const inputClass = 'h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-[14px] placeholder:text-disabled focus:border-accent focus:outline-none';
export const Input = ({ className, ...p }: ComponentProps<'input'>) => <input {...p} className={cn(inputClass, className)} />;
export const Select = ({ className, ...p }: ComponentProps<'select'>) => <select {...p} className={cn(inputClass, 'pr-8', className)} />;
export const Textarea = ({ className, ...p }: ComponentProps<'textarea'>) => (
  <textarea {...p} className={cn('w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-[14px] placeholder:text-disabled focus:border-accent focus:outline-none', className)} />
);

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12px] font-semibold text-text-2">{label}</label>
      {children}
      {hint && !error && <p className="text-[12px] text-muted">{hint}</p>}
      {error && <p className="text-[12px] text-critical">{error}</p>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-6 py-12 text-center text-[14px] text-muted">{children}</div>;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  return (
    <span aria-hidden className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral text-[12px] font-semibold text-white', className)}>
      {initials || '?'}
    </span>
  );
}
