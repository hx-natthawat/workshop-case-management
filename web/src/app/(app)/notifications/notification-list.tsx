'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Bell, Clock, Inbox, MessageSquare, RotateCcw, TriangleAlert, UserPlus } from 'lucide-react';
import { Button, Card, Empty, TONE } from '@/components/ui';
import { fullWhen, shortWhen } from '@/components/format';
import type { Tone } from '@/server/lib/enums';

export interface NotificationItem { id: string; type: string; caseId: string | null; text: string; read: boolean; createdAt: string }

const TYPES: Record<string, { icon: typeof Bell; tone: Tone; label: string }> = {
  sla_breached: { icon: TriangleAlert, tone: 'critical', label: 'เกิน SLA' },
  sla_warning: { icon: Clock, tone: 'warning', label: 'ใกล้เกิน SLA' },
  case_assigned: { icon: UserPlus, tone: 'info', label: 'มอบหมายเคส' },
  case_unassigned: { icon: Inbox, tone: 'info', label: 'เคสยังไม่มีผู้รับผิดชอบ' },
  customer_replied: { icon: MessageSquare, tone: 'accent', label: 'ผู้แจ้งตอบกลับ' },
  case_reopened: { icon: RotateCcw, tone: 'accent', label: 'เปิดเคสใหม่' },
};
const fallback = { icon: Bell, tone: 'neutral' as Tone, label: 'การแจ้งเตือน' };

async function markRead(payload: { ids: string[] } | { all: true }) {
  const res = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error('mark read failed');
}

export function NotificationList({ items: initial, unread }: { items: NotificationItem[]; unread: number }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const unreadNow = items.filter((i) => !i.read).length;

  const open = async (n: NotificationItem) => {
    setError(null);
    if (!n.read) {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      try { await markRead({ ids: [n.id] }); } catch { /* navigation still proceeds */ }
    }
    if (n.caseId) router.push(`/cases/${n.caseId}`);
    else router.refresh();
  };

  const markAll = () => startTransition(async () => {
    setError(null);
    try {
      await markRead({ all: true });
      setItems((xs) => xs.map((x) => ({ ...x, read: true })));
      router.refresh();
    } catch {
      setError('ไม่สามารถทำเครื่องหมายได้ กรุณาลองใหม่อีกครั้ง');
    }
  });

  return (
    <Card
      title={`รายการแจ้งเตือน${unread || unreadNow ? ` · ยังไม่อ่าน ${unreadNow}` : ''}`}
      action={<Button size="sm" onClick={markAll} disabled={pending || unreadNow === 0}>ทำเครื่องหมายว่าอ่านแล้วทั้งหมด</Button>}
    >
      {error && <p className="border-b border-divider px-5 py-2 text-[12px] text-critical">{error}</p>}
      {items.length === 0 ? <Empty>ยังไม่มีการแจ้งเตือน</Empty> : (
        <ul>
          {items.map((n) => {
            const t = TYPES[n.type] ?? fallback;
            const Icon = t.icon;
            return (
              <li key={n.id} className="border-t border-divider first:border-t-0">
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={clsx('flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-row-hover', !n.read && 'bg-accent-tint/40')}
                >
                  <span className={clsx('mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full', TONE[t.tone])}><Icon size={16} aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-muted">{t.label}</span>
                    <span className={clsx('block text-[14px]', !n.read ? 'font-semibold text-text' : 'text-text-2')}>{n.text}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[12px] text-muted" title={fullWhen(n.createdAt)} suppressHydrationWarning>
                    {shortWhen(n.createdAt)}
                    {!n.read && <span className="size-2 rounded-full bg-accent" aria-label="ยังไม่อ่าน" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
