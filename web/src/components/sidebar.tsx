'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell, ChartNoAxesColumn, CircleHelp, Clock, FileClock, Inbox, LayoutGrid, LogOut, MessageSquare, Settings, Smartphone, Split, User, UserRound,
} from 'lucide-react';
import type { Role } from '@/server/lib/auth';
import { Avatar } from './ui';

/** Order, labels and icons follow the approved prototype sidebar (prototype/screens/*.png). */
const NAV: { href: string; label: string; icon: typeof Inbox; roles?: Role[]; badge?: 'inbox'; phase2?: boolean }[] = [
  { href: '/dashboard', label: 'แดชบอร์ด', icon: LayoutGrid },
  { href: '/inbox', label: 'กล่องเคส', icon: Inbox, badge: 'inbox' },
  { href: '/contacts', label: 'ผู้ติดต่อ', icon: User },
  { href: '/flow', label: 'Bot Flow', icon: Split, roles: ['admin'] },
  { href: '/templates', label: 'ข้อความสำเร็จรูป', icon: MessageSquare },
  { href: '/faq', label: 'FAQ', icon: CircleHelp, phase2: true },
  { href: '/settings#sla', label: 'SLA และการมอบหมาย', icon: Clock, roles: ['admin'] },
  { href: '/reports', label: 'รายงาน', icon: ChartNoAxesColumn, roles: ['supervisor', 'admin'] },
  { href: '/users', label: 'ผู้ใช้และสิทธิ์', icon: UserRound, roles: ['admin'] },
  { href: '/settings', label: 'ตั้งค่า', icon: Settings, roles: ['admin'] },
  { href: '/audit', label: 'Audit log', icon: FileClock, roles: ['admin'] },
];

const ROLE_LABEL: Record<Role, string> = { agent: 'Agent', supervisor: 'Supervisor', admin: 'Admin' };

export function Sidebar({ user, teamName, counts, simulator }: {
  user: { name: string; role: Role };
  teamName: string | null;
  counts: { inbox: number; notif: number };
  simulator: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };
  return (
    <aside className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col border-r border-border bg-surface-muted">
      <div className="flex items-center gap-3 px-5 pt-5 pb-6">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-[14px] font-bold text-white">TM</span>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold">Tools Management</div>
          <div className="text-[12px] text-muted">ศูนย์แจ้งปัญหา</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="เมนูหลัก">
        {NAV.filter((n) => !n.roles || n.roles.includes(user.role)).map((n) => {
          if (n.phase2) {
            return (
              <span key={n.href} aria-disabled="true" title="เปิดใช้ใน Phase 2"
                className="flex h-9 cursor-not-allowed items-center gap-3 rounded-md px-3 text-[14px] text-disabled">
                <n.icon size={18} strokeWidth={1.75} aria-hidden />
                <span className="flex-1">{n.label}</span>
                <span className="text-[11px]">Phase 2</span>
              </span>
            );
          }
          const base = n.href.split('#')[0];
          const active = !n.href.includes('#') && (path === base || path.startsWith(`${base}/`) || (base === '/inbox' && path.startsWith('/cases')));
          const count = n.badge ? counts[n.badge] : 0;
          return (
            <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}
              className={clsx('flex h-9 items-center gap-3 rounded-md px-3 text-[14px]', active ? 'bg-accent-tint font-semibold text-accent' : 'text-text-2 hover:bg-hover')}>
              <n.icon size={18} strokeWidth={1.75} aria-hidden />
              <span className="flex-1">{n.label}</span>
              {count > 0 && <span className="tabular text-[12px] font-semibold text-critical">{count}</span>}
            </Link>
          );
        })}
        {simulator && (
          <a href="/simulator" target="_blank" rel="noreferrer" className="mt-4 flex h-9 items-center gap-3 rounded-md border border-dashed border-border-strong px-3 text-[14px] text-text-2 hover:bg-hover">
            <Smartphone size={18} strokeWidth={1.75} aria-hidden />
            <span>LINE Simulator</span>
          </a>
        )}
      </nav>
      <div className="mx-3 flex items-center gap-2 border-t border-border px-2 py-4">
        <Avatar name={user.name} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14px] font-semibold">{user.name}</div>
          <div className="truncate text-[12px] text-muted">{ROLE_LABEL[user.role]}{teamName ? ` · ${teamName}` : ''}</div>
        </div>
        <Link href="/notifications" className="relative rounded-md p-2 text-muted hover:bg-hover" aria-label={`การแจ้งเตือน${counts.notif ? ` ${counts.notif} รายการใหม่` : ''}`} title="การแจ้งเตือน">
          <Bell size={16} />
          {counts.notif > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-critical" aria-hidden />}
        </Link>
        <button type="button" onClick={logout} className="rounded-md p-2 text-muted hover:bg-hover" aria-label="ออกจากระบบ" title="ออกจากระบบ">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
