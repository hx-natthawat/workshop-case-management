'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Chip, Textarea } from '@/components/ui';

interface Item { key: string; label: string; vars: string[]; defaultBody: string; body: string; custom: boolean }

/** Bot auto-reply texts (SPEC §5 Message Templates). Changes apply to the next message the bot sends. */
export function BotTextsCard({ items }: { items: Item[] }) {
  return (
    <Card title="ข้อความอัตโนมัติของ bot" className="mt-6">
      <p className="border-b border-divider px-5 py-3 text-[13px] text-muted">แก้ไขข้อความที่ bot ส่งถึงผู้แจ้ง ใช้ตัวแปรในวงเล็บปีกกาตามที่ระบุ มีผลกับข้อความถัดไปทันที</p>
      <ul className="divide-y divide-divider">
        {items.map((i) => <Row key={i.key} item={i} />)}
      </ul>
    </Card>
  );
}

function Row({ item }: { item: Item }) {
  const router = useRouter();
  const [body, setBody] = useState(item.body);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (value: string | null) => {
    setBusy(true); setMsg(null);
    const res = await fetch('/api/bot-texts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: item.key, body: value }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? 'บันทึกไม่สำเร็จ' });
    if (value === null) setBody(item.defaultBody);
    setMsg({ ok: true, text: value === null ? 'คืนค่าเริ่มต้นแล้ว' : 'บันทึกแล้ว' });
    router.refresh();
  };
  const id = `bt-${item.key}`;
  return (
    <li className="space-y-2 px-5 py-4">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-[14px] font-semibold">{item.label}</label>
        {item.custom && <Chip tone="accent">แก้ไขแล้ว</Chip>}
        {item.vars.length > 0 && <span className="text-[12px] text-muted">ตัวแปร: {item.vars.map((v) => `{${v}}`).join(' ')}</span>}
      </div>
      <Textarea id={id} rows={2} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy || body.trim() === item.body} onClick={() => save(body)}>บันทึก</Button>
        {item.custom && <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(null)}>คืนค่าเริ่มต้น</Button>}
        {msg && <span className={msg.ok ? 'text-[13px] text-success' : 'text-[13px] text-critical'} role="status">{msg.text}</span>}
      </div>
    </li>
  );
}
