'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Empty, Field, Input, Textarea } from '@/components/ui';

interface Item { id: string; title: string; body: string }

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (res.ok) return null;
  return (await res.json().catch(() => ({}))).error ?? 'บันทึกไม่สำเร็จ';
}

export function TemplatesClient({ items, canEdit }: { items: Item[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <Card
      title={`ข้อความทั้งหมด (${items.length})`}
      action={canEdit && !adding ? <Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus size={16} aria-hidden />เพิ่มข้อความ</Button> : undefined}
    >
      {adding && <Editor onDone={() => setAdding(false)} />}
      {items.length === 0 && !adding ? <Empty>ยังไม่มีข้อความสำเร็จรูป</Empty> : (
        <ul className="divide-y divide-divider">
          {items.map((i) => <Row key={i.id} item={i} canEdit={canEdit} />)}
        </ul>
      )}
    </Card>
  );
}

function Row({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (editing) return <li><Editor item={item} onDone={() => setEditing(false)} /></li>;
  async function remove() {
    if (!confirm(`ลบข้อความ "${item.title}" ใช่หรือไม่`)) return;
    const err = await send(`/api/canned-replies/${item.id}`, 'DELETE');
    setError(err);
    if (!err) router.refresh();
  }
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{item.title}</div>
        <p className="mt-1 whitespace-pre-wrap text-[14px] text-text-2">{item.body}</p>
        {error && <p role="alert" className="mt-1 text-[13px] text-critical">{error}</p>}
      </div>
      {canEdit && (
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>แก้ไข</Button>
          <Button size="sm" variant="danger" onClick={remove}>ลบ</Button>
        </div>
      )}
    </li>
  );
}

function Editor({ item, onDone }: { item?: Item; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return setError('กรุณากรอกชื่อและข้อความ');
    setBusy(true);
    const err = item
      ? await send(`/api/canned-replies/${item.id}`, 'PATCH', { title, body })
      : await send('/api/canned-replies', 'POST', { title, body });
    setBusy(false);
    if (err) return setError(err);
    onDone();
    router.refresh();
  }
  const id = item?.id ?? 'new';
  return (
    <form onSubmit={save} className="space-y-3 border-b border-divider bg-surface-muted px-5 py-4">
      <Field label="ชื่อข้อความ" htmlFor={`t-${id}`}><Input id={`t-${id}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus /></Field>
      <Field label="ข้อความ" htmlFor={`b-${id}`} error={error}><Textarea id={`b-${id}`} rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} /></Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onDone}>ยกเลิก</Button>
        <Button size="sm" type="submit" variant="primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
      </div>
    </form>
  );
}
