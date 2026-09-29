'use client';

import { Download, Eraser, Lock, LockOpen, PencilLine, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fullWhen } from '@/components/format';
import { Button, Card, Chip, Empty, Field, Input, Select, Textarea, buttonClass } from '@/components/ui';
import type { DsrStatus, DsrType } from '@/server/db/schema';
import { DSR_STATUS, DSR_TYPE } from '@/server/lib/dsr-labels';
import { Table, Td, Th } from '../../_admin/table';

export interface DsrItem {
  id: string;
  type: DsrType;
  receivedAt: Date;
  dueAt: Date;
  status: DsrStatus;
  overdue: boolean;
  note: string | null;
  createdByName: string | null;
  handledByName: string | null;
  handledAt: Date | null;
}

interface ContactInfo {
  id: string;
  fullName: string | null;
  customerRef: string | null;
  orgUnit: string | null;
  restricted: boolean;
  anonymised: boolean;
}

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.ok) return null;
  return (await res.json().catch(() => ({}))).error ?? 'ดำเนินการไม่สำเร็จ';
}

const todayIso = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/** Actions for a data-subject request: export, rectify, restrict, erase (supervisor, admin). */
export function PdpaActions({ contact, openCases }: { contact: ContactInfo; openCases: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ fullName: contact.fullName ?? '', phone: '', customerRef: contact.customerRef ?? '', orgUnit: contact.orgUnit ?? '' });

  async function run(url: string, body: unknown, done: string) {
    setBusy(true);
    setMsg(null);
    const err = await call(url, 'POST', body);
    setBusy(false);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: done });
    if (!err) router.refresh();
    return !err;
  }

  async function rectify(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, string | null> = {
      fullName: form.fullName.trim(),
      customerRef: form.customerRef.trim() || null,
      orgUnit: form.orgUnit.trim() || null,
    };
    if (form.phone.trim()) body.phone = form.phone.trim();
    if (await run(`/api/contacts/${contact.id}/rectify`, body, 'บันทึกการแก้ไขข้อมูลแล้ว')) {
      setEditing(false);
      setForm((f) => ({ ...f, phone: '' }));
    }
  }

  function restrict() {
    const on = !contact.restricted;
    const q = on
      ? 'ระงับการใช้ข้อมูลของผู้ติดต่อนี้ใช่หรือไม่ ระบบจะบล็อกผู้ติดต่อและไม่รับเรื่องใหม่จนกว่าจะยกเลิกการระงับ'
      : 'ยกเลิกการระงับการใช้ข้อมูลใช่หรือไม่ ผู้ติดต่อจะกลับมาแจ้งเรื่องได้ตามปกติ';
    if (!confirm(q)) return;
    void run(`/api/contacts/${contact.id}/restrict`, { restricted: on }, on ? 'ระงับการใช้ข้อมูลแล้ว' : 'ยกเลิกการระงับแล้ว');
  }

  function erase() {
    if (!confirm('ลบข้อมูลส่วนบุคคลของผู้ติดต่อนี้ใช่หรือไม่\n\nระบบจะลบชื่อ เบอร์โทร คำตอบในแบบฟอร์ม ข้อความ และไฟล์แนบของทุกเคส และกู้คืนไม่ได้ ข้อมูลสถิติของเคสยังคงอยู่สำหรับรายงาน')) return;
    void run(`/api/contacts/${contact.id}/erase`, undefined, 'ลบข้อมูลส่วนบุคคลแล้ว');
  }

  if (contact.anonymised) {
    return (
      <Card title="สิทธิของเจ้าของข้อมูล">
        <p className="px-5 py-4 text-[14px] text-muted">ข้อมูลส่วนบุคคลของผู้ติดต่อนี้ถูกลบแล้ว ไม่สามารถดำเนินการเพิ่มเติมได้</p>
      </Card>
    );
  }

  return (
    <Card title="สิทธิของเจ้าของข้อมูล">
      <div className="flex flex-wrap gap-2 px-5 py-4">
        <a className={buttonClass('secondary')} href={`/api/contacts/${contact.id}/export`} download onClick={() => setTimeout(() => router.refresh(), 1000)}>
          <Download size={16} aria-hidden />ส่งออกข้อมูล (JSON)
        </a>
        <Button onClick={() => { setEditing((v) => !v); setMsg(null); }} disabled={busy} aria-expanded={editing}>
          <PencilLine size={16} aria-hidden />แก้ไขข้อมูล
        </Button>
        <Button onClick={restrict} disabled={busy}>
          {contact.restricted ? <><LockOpen size={16} aria-hidden />ยกเลิกการระงับ</> : <><Lock size={16} aria-hidden />ระงับการใช้ข้อมูล</>}
        </Button>
        <Button variant="danger" onClick={erase} disabled={busy || openCases > 0} title={openCases > 0 ? 'ต้องปิดหรือยกเลิกเคสทั้งหมดก่อน' : undefined}>
          <Eraser size={16} aria-hidden />ลบข้อมูล
        </Button>
      </div>
      {openCases > 0 && (
        <p className="px-5 pb-3 text-[12px] text-muted">ลบข้อมูลได้เมื่อไม่มีเคสที่ยังไม่ปิด ขณะนี้มี {openCases} เคส</p>
      )}
      {editing && (
        <form onSubmit={rectify} className="grid gap-4 border-t border-divider px-5 py-4 md:grid-cols-2">
          <Field label="ชื่อ-นามสกุล" htmlFor="r-name"><Input id="r-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} maxLength={120} required /></Field>
          <Field label="เบอร์โทร" htmlFor="r-phone" hint="เว้นว่างไว้หากไม่ต้องการเปลี่ยน"><Input id="r-phone" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} pattern="[0-9+\-\s]*" /></Field>
          <Field label="รหัสลูกค้า / พนักงาน" htmlFor="r-ref"><Input id="r-ref" value={form.customerRef} onChange={(e) => setForm({ ...form, customerRef: e.target.value })} maxLength={60} /></Field>
          <Field label="หน่วยงาน" htmlFor="r-org"><Input id="r-org" value={form.orgUnit} onChange={(e) => setForm({ ...form, orgUnit: e.target.value })} maxLength={120} /></Field>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button onClick={() => setEditing(false)} disabled={busy}>ยกเลิก</Button>
            <Button type="submit" variant="primary" disabled={busy}>บันทึกการแก้ไข</Button>
          </div>
        </form>
      )}
      <div className="border-t border-divider px-5 py-3 text-[12px] text-muted">
        {msg ? <span role="status" className={msg.ok ? 'text-success' : 'text-critical'}>{msg.text}</span> : 'ทุกการดำเนินการจะถูกบันทึกใน Audit log'}
      </div>
    </Card>
  );
}

/** Request log with the 30-day deadline (PDPA s.30) and overdue highlight. */
export function DsrRequests({ contactId, items }: { contactId: string; items: DsrItem[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<DsrType>('access');
  const [receivedAt, setReceivedAt] = useState(todayIso());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await call(`/api/contacts/${contactId}/dsr`, 'POST', { type, receivedAt: `${receivedAt}T00:00:00+07:00`, note: note.trim() || undefined });
    setBusy(false);
    setError(err);
    if (err) return;
    setAdding(false);
    setNote('');
    router.refresh();
  }

  async function setStatus(id: string, status: DsrStatus) {
    let reason: string | undefined;
    if (status === 'rejected') {
      const r = prompt('ระบุเหตุผลที่ปฏิเสธคำขอ');
      if (!r?.trim()) return;
      reason = r.trim();
    }
    setBusy(true);
    const err = await call(`/api/contacts/${contactId}/dsr/${id}`, 'PATCH', { status, note: reason });
    setBusy(false);
    setError(err);
    if (!err) router.refresh();
  }

  const overdue = items.filter((i) => i.overdue).length;

  return (
    <Card
      title={<span className="flex items-center gap-2">คำขอของเจ้าของข้อมูล{overdue > 0 && <Chip tone="critical">เกินกำหนด {overdue}</Chip>}</span>}
      action={!adding && <Button size="sm" onClick={() => setAdding(true)}><Plus size={14} aria-hidden />บันทึกคำขอ</Button>}
      className="overflow-hidden"
    >
      {adding && (
        <form onSubmit={add} className="grid gap-4 border-b border-divider px-5 py-4 md:grid-cols-[1fr_180px]">
          <Field label="ประเภทคำขอ" htmlFor="d-type">
            <Select id="d-type" value={type} onChange={(e) => setType(e.target.value as DsrType)}>
              {(Object.keys(DSR_TYPE) as DsrType[]).map((k) => <option key={k} value={k}>{DSR_TYPE[k].label} ({DSR_TYPE[k].section})</option>)}
            </Select>
          </Field>
          <Field label="วันที่รับคำขอ" htmlFor="d-date" hint="ครบกำหนด 30 วันนับจากวันที่รับ">
            <Input id="d-date" type="date" value={receivedAt} max={todayIso()} onChange={(e) => setReceivedAt(e.target.value)} required />
          </Field>
          <div className="md:col-span-2">
            <Field label="รายละเอียด" htmlFor="d-note"><Textarea id="d-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="ช่องทางที่ได้รับคำขอ และการยืนยันตัวตน" /></Field>
          </div>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button onClick={() => setAdding(false)} disabled={busy}>ยกเลิก</Button>
            <Button type="submit" variant="primary" disabled={busy}>บันทึกคำขอ</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="border-b border-divider px-5 py-2 text-[12px] text-critical">{error}</p>}
      {items.length === 0 ? <Empty>ยังไม่มีคำขอ</Empty> : (
        <Table className="rounded-none border-0">
          <thead>
            <tr><Th>ประเภท</Th><Th>รับคำขอ</Th><Th>ครบกำหนด</Th><Th>สถานะ</Th><Th>ผู้ดำเนินการ</Th><Th><span className="sr-only">การดำเนินการ</span></Th></tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className={r.overdue ? 'bg-critical-tint/40' : undefined}>
                <Td className="min-w-[220px]">
                  <div>{DSR_TYPE[r.type].label}</div>
                  <div className="text-[12px] text-muted">{DSR_TYPE[r.type].section}{r.note ? ` · ${r.note}` : ''}</div>
                </Td>
                <Td className="tabular whitespace-nowrap text-muted">{fullWhen(r.receivedAt)}</Td>
                <Td className="tabular whitespace-nowrap">
                  <span className={r.overdue ? 'font-semibold text-critical' : undefined}>{fullWhen(r.dueAt)}</span>
                  {r.overdue && <div><Chip tone="critical">เกินกำหนด</Chip></div>}
                </Td>
                <Td><Chip tone={DSR_STATUS[r.status].tone}>{DSR_STATUS[r.status].label}</Chip></Td>
                <Td className="whitespace-nowrap text-muted">
                  {r.handledByName ? <>{r.handledByName}<div className="text-[12px]">{r.handledAt ? fullWhen(r.handledAt) : ''}</div></> : (r.createdByName ? `บันทึกโดย ${r.createdByName}` : '-')}
                </Td>
                <Td className="whitespace-nowrap text-right">
                  {r.status === 'open' ? (
                    <span className="inline-flex gap-1">
                      <Button size="sm" onClick={() => setStatus(r.id, 'completed')} disabled={busy}>ดำเนินการแล้ว</Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, 'rejected')} disabled={busy}>ปฏิเสธ</Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, 'open')} disabled={busy}>เปิดคำขออีกครั้ง</Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
