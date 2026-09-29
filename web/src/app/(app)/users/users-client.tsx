'use client';

import { Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { shortWhen } from '@/components/format';
import { Button, Card, Chip, Field, Input, Select } from '@/components/ui';
import { ROLE_LABEL, type Tone } from '@/server/lib/enums';
import { Table, Td, Th } from '../_admin/table';

type Role = 'agent' | 'supervisor' | 'admin';
interface User { id: string; name: string; email: string; role: Role; teamId: string | null; isActive: boolean; lastAssignedAt: string | null; mfaEnabledAt: string | null }
interface Team { id: string; name: string; autoAssign: boolean; memberCount: number }

const ROLE_TONE: Record<Role, Tone> = { admin: 'accent', supervisor: 'info', agent: 'neutral' };

async function send(url: string, method: string, body: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const j = await res.json().catch(() => ({}));
  return j.issues?.[0]?.message && j.issues[0].message.length < 80 && /[ก-๙]/.test(j.issues[0].message) ? j.issues[0].message : (j.error ?? 'บันทึกไม่สำเร็จ');
}

export function UsersClient({ meId, users, teams }: { meId: string; users: User[]; teams: Team[] }) {
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const router = useRouter();
  async function resetMfa(u: User) {
    if (!confirm(`รีเซ็ต MFA ของ ${u.name}? ผู้ใช้ต้องตั้งค่าใหม่เมื่อเข้าสู่ระบบครั้งถัดไป`)) return;
    const res = await fetch(`/api/users/${u.id}/mfa-reset`, { method: 'POST' });
    if (!res.ok) alert((await res.json().catch(() => ({}))).error ?? 'รีเซ็ตไม่สำเร็จ');
    router.refresh();
  }
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? '-';
  return (
    <>
      <Card
        title={`เจ้าหน้าที่ (${users.length})`}
        action={<Button variant="primary" size="sm" onClick={() => setEditing('new')}><Plus size={16} aria-hidden />เพิ่มผู้ใช้</Button>}
      >
        <Table className="rounded-none border-0">
          <thead>
            <tr><Th>ชื่อ</Th><Th>อีเมล</Th><Th>บทบาท</Th><Th>ทีม</Th><Th>สถานะ</Th><Th>MFA</Th><Th>มอบหมายล่าสุด</Th><Th className="w-24"><span className="sr-only">จัดการ</span></Th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.isActive ? 'hover:bg-row-hover' : 'text-muted hover:bg-row-hover'}>
                <Td className="font-medium">{u.name}{u.id === meId && <span className="ml-2 text-[12px] font-normal text-muted">(คุณ)</span>}</Td>
                <Td>{u.email}</Td>
                <Td><Chip tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Chip></Td>
                <Td>{teamName(u.teamId)}</Td>
                <Td>{u.isActive ? <Chip tone="success">ใช้งาน</Chip> : <Chip tone="neutral">ปิดใช้งาน</Chip>}</Td>
                <Td>{u.mfaEnabledAt ? <Chip tone="success">เปิดใช้</Chip> : <Chip tone={u.role === 'admin' ? 'warning' : 'neutral'}>{u.role === 'admin' ? 'ยังไม่ตั้งค่า' : 'ไม่ใช้'}</Chip>}</Td>
                <Td className="tabular text-muted">{u.lastAssignedAt ? shortWhen(u.lastAssignedAt) : '-'}</Td>
                <Td className="whitespace-nowrap text-right">
                  {u.mfaEnabledAt && u.id !== meId && <Button size="sm" variant="ghost" onClick={() => resetMfa(u)}>รีเซ็ต MFA</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>แก้ไข</Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <TeamsCard teams={teams} />
      {editing && <UserPanel key={editing === 'new' ? 'new' : editing.id} user={editing === 'new' ? null : editing} isMe={editing !== 'new' && editing.id === meId} teams={teams} onClose={() => setEditing(null)} />}
    </>
  );
}

function UserPanel({ user, isMe, teams, onClose }: { user: User | null; isMe: boolean; teams: Team[]; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isActive, setIsActive] = useState(user?.isActive ?? true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get('password') ?? '');
    if (password && password.length < 8) return setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    if (!user && !password) return setError('กรุณากำหนดรหัสผ่าน');
    const body = {
      name: String(f.get('name')),
      email: String(f.get('email')),
      role: String(f.get('role')),
      teamId: String(f.get('teamId')) || null,
      isActive,
      ...(password ? { password } : {}),
    };
    setBusy(true);
    setError(null);
    const err = user ? await send(`/api/users/${user.id}`, 'PATCH', body) : await send('/api/users', 'POST', body);
    setBusy(false);
    if (err) return setError(err);
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="user-panel-title" className="flex h-full w-full max-w-[420px] flex-col bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-divider px-6 py-4">
          <h2 id="user-panel-title" className="text-[18px] font-semibold">{user ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-muted hover:bg-hover" aria-label="ปิด"><X size={18} /></button>
        </header>
        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex-1 space-y-4 px-6 py-5">
            <Field label="ชื่อ" htmlFor="u-name"><Input id="u-name" name="name" defaultValue={user?.name} required maxLength={120} autoFocus /></Field>
            <Field label="อีเมล" htmlFor="u-email" hint="ใช้เป็นชื่อเข้าสู่ระบบ ต้องไม่ซ้ำกับผู้ใช้อื่น"><Input id="u-email" name="email" type="email" defaultValue={user?.email} required /></Field>
            <Field label="บทบาท" htmlFor="u-role" hint={isMe ? 'ไม่สามารถลดสิทธิ์บัญชีของตนเองได้' : undefined}>
              <Select id="u-role" name="role" defaultValue={user?.role ?? 'agent'} disabled={isMe}>
                <option value="agent">Agent</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </Select>
              {isMe && <input type="hidden" name="role" value="admin" />}
            </Field>
            <Field label="ทีม" htmlFor="u-team">
              <Select id="u-team" name="teamId" defaultValue={user?.teamId ?? ''}>
                <option value="">ไม่สังกัดทีม</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="สถานะบัญชี" hint={isMe ? 'ไม่สามารถปิดการใช้งานบัญชีของตนเองได้' : 'บัญชีที่ปิดใช้งานจะเข้าสู่ระบบไม่ได้และไม่ได้รับเคสอัตโนมัติ'}>
              <label className="flex h-9 items-center gap-2 text-[14px]">
                <input type="checkbox" className="size-4 accent-accent" checked={isActive} disabled={isMe} onChange={(e) => setIsActive(e.target.checked)} />
                เปิดใช้งาน
              </label>
            </Field>
            <Field label={user ? 'ตั้งรหัสผ่านใหม่' : 'รหัสผ่าน'} htmlFor="u-pw" hint={user ? 'เว้นว่างไว้หากไม่ต้องการเปลี่ยน (อย่างน้อย 8 ตัวอักษร)' : 'อย่างน้อย 8 ตัวอักษร'}>
              <Input id="u-pw" name="password" type="password" autoComplete="new-password" minLength={8} required={!user} />
            </Field>
            {error && <p role="alert" className="rounded-md bg-critical-tint px-3 py-2 text-[13px] text-critical">{error}</p>}
          </div>
          <footer className="flex justify-end gap-2 border-t border-divider px-6 py-4">
            <Button onClick={onClose}>ยกเลิก</Button>
            <Button type="submit" variant="primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
          </footer>
        </form>
      </aside>
    </div>
  );
}

function TeamsCard({ teams }: { teams: Team[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function toggle(t: Team, autoAssign: boolean) {
    setError(await send(`/api/teams/${t.id}`, 'PATCH', { autoAssign }));
    router.refresh();
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const err = await send('/api/teams', 'POST', { name: name.trim() });
    setBusy(false);
    setError(err);
    if (!err) { setName(''); router.refresh(); }
  }

  return (
    <Card title={`ทีม (${teams.length})`}>
      <ul className="divide-y divide-divider">
        {teams.map((t) => (
          <li key={t.id} className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-5 py-2">
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-[12px] text-muted">สมาชิก {t.memberCount} คน</div>
            </div>
            <label className="flex items-center gap-2 text-[14px] text-text-2">
              <input type="checkbox" className="size-4 accent-accent" checked={t.autoAssign} onChange={(e) => toggle(t, e.target.checked)} />
              มอบหมายอัตโนมัติแบบ round-robin
            </label>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-t border-divider px-5 py-4">
        <div className="min-w-[240px] flex-1">
          <Field label="เพิ่มทีม" htmlFor="team-name"><Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อทีม" maxLength={80} /></Field>
        </div>
        <Button type="submit" disabled={busy || !name.trim()}><Plus size={16} aria-hidden />เพิ่มทีม</Button>
      </form>
      {error && <p role="alert" className="px-5 pb-4 text-[13px] text-critical">{error}</p>}
    </Card>
  );
}
