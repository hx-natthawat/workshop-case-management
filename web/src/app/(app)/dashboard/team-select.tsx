'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/** Team scope picker for supervisors/admins; writes `?team=<id>|all` to the URL. */
export function TeamSelect({ teams, value }: { teams: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-[13px] text-text-2">
      ทีม
      <select
        value={value}
        disabled={pending}
        onChange={(e) => start(() => router.push(`/dashboard?team=${encodeURIComponent(e.target.value)}`))}
        className="h-9 rounded-md border border-border-strong bg-surface px-2.5 text-[13px] text-text focus:border-accent focus:outline-none disabled:opacity-60"
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
        <option value="all">ทุกทีม</option>
      </select>
    </label>
  );
}
