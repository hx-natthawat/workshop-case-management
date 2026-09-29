import clsx from 'clsx';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ChevronLeft, MapPin } from 'lucide-react';
import { Avatar, Chip, PriorityChip, StatusChip } from '@/components/ui';
import { fullWhen, timeOnly } from '@/components/format';
import { db, schema } from '@/server/db';
import { answerText } from '@/server/bot/dialog';
import { formatMinutesTh, remainingMinutes } from '@/server/case/sla';
import { businessMinutesBetween } from '@/server/case/business-time';
import { HttpError, requirePageUser } from '@/server/lib/auth';
import { PRIORITY, STATUS } from '@/server/lib/enums';
import { caseDetail } from '@/server/queries/cases';
import { AutoRefresh, CaseSidePanel, Composer, HeaderActions, PhoneReveal } from './client';

type Detail = Awaited<ReturnType<typeof caseDetail>>;

export default async function CaseDetailPage({ params }: PageProps<'/cases/[id]'>) {
  const user = await requirePageUser();
  const { id } = await params;
  let d: Detail;
  try {
    d = await caseDetail(user, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    if (e instanceof HttpError && e.status === 403) redirect('/inbox?denied=1');
    throw e;
  }
  const c = d.case;
  const canned = await db.select().from(schema.cannedReply).where(eq(schema.cannedReply.tenantId, user.tenantId));
  const closed = c.status === 'closed' || c.status === 'cancelled';

  return (
    <div className="flex h-screen flex-col">
      <AutoRefresh seconds={10} />
      <header className="flex items-center gap-4 border-b border-border bg-surface px-6 py-4">
        <Link href="/inbox" className="flex size-10 items-center justify-center rounded-md border border-border-strong hover:bg-row-hover" aria-label="กลับไปกล่องเคส">
          <ChevronLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] text-muted">{c.caseNo}</span>
            <PriorityChip priority={c.priority} withLabel />
            <StatusChip status={c.status} />
            {c.reopenCount > 0 && <Chip tone="critical">เปิดใหม่ {c.reopenCount} ครั้ง</Chip>}
          </div>
          <h1 className="truncate text-[20px] font-semibold">{c.title}</h1>
        </div>
        <HeaderActions caseId={c.id} allowed={d.allowed} canSelfAssign={!closed && c.assigneeId !== user.id && (user.role !== 'agent' || !c.assigneeId)} userId={user.id} canReassign={!closed && user.role !== 'agent'} />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_300px]">
        <AnswersPanel d={d} />

        <section className="flex min-h-0 flex-col bg-bg">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6" id="timeline">
            {d.timeline.map((t) => <TimelineItem key={t.id} t={t} />)}
          </div>
          <div className="border-t border-border bg-bg px-6 py-4">
            {closed ? (
              <p className="rounded-xl border border-border bg-surface px-4 py-3 text-[14px] text-muted">เคสนี้{STATUS[c.status].label}แล้ว ส่งข้อความถึงผู้แจ้งไม่ได้</p>
            ) : (
              <Composer caseId={c.id} reporterName={d.contact.name} canned={canned.map((x) => ({ id: x.id, title: x.title, body: x.body }))}
                afterOptions={d.allowed.filter((s) => s === 'in_progress' || s === 'pending_customer' || s === 'resolved')}
                contactActive={d.contact.status === 'active'} />
            )}
          </div>
        </section>

        <aside className="space-y-5 overflow-y-auto border-l border-border bg-surface px-5 py-5">
          <CaseSidePanel
            caseId={c.id} status={c.status} priority={c.priority} assigneeId={c.assigneeId}
            allowed={d.allowed} role={user.role} userId={user.id}
            assignees={d.assignees.map((a) => ({ id: a.id, name: a.teamName ? `${a.name} · ${a.teamName}` : a.name, role: a.role }))}
            priorities={Object.entries(PRIORITY).map(([code, p]) => ({ code, label: `${code} ${p.label}` }))}
            statuses={Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label]))}
          />
          <SlaBlock d={d} />
          <ContactBlock d={d} />
          {d.related.length > 0 && (
            <div className="border-t border-divider pt-5">
              <h2 className="mb-2 text-[12px] font-semibold text-text-2">เคสที่เกี่ยวข้อง</h2>
              <ul className="space-y-2">
                {d.related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/cases/${r.id}`} className="block rounded-lg border border-border px-3 py-2 hover:bg-row-hover">
                      <span className="flex items-center justify-between gap-2"><span className="font-mono text-[12px] text-accent">{r.caseNo}</span><StatusChip status={r.status} /></span>
                      <span className="mt-0.5 block truncate text-[13px]">{r.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function AnswersPanel({ d }: { d: Detail }) {
  return (
    <aside className="overflow-y-auto border-r border-border bg-surface px-6 py-6">
      <h2 className="text-[16px] font-semibold">คำตอบจากผู้แจ้ง</h2>
      <p className="mt-1 text-[12px] text-muted">{d.form ? `แบบฟอร์ม "${d.form.name}" version ${d.form.version}` : 'ไม่มีแบบฟอร์ม (แจ้งผ่านเจ้าหน้าที่)'}</p>
      <dl className="mt-5 space-y-4">
        <div>
          <dt className="text-[12px] font-semibold text-text-2">หมวด</dt>
          <dd className="mt-0.5">{d.categoryPath}</dd>
        </div>
        {d.answers.map((a) => (
          <div key={a.key}>
            <dt className="text-[12px] font-semibold text-text-2">{a.label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words">
              {a.value.kind === 'files' ? (
                a.files.length ? (
                  <span className="mt-1 grid grid-cols-2 gap-2">
                    {a.files.map((f) => (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt="ไฟล์แนบจากผู้แจ้ง" className="h-24 w-full object-cover" />
                      </a>
                    ))}
                  </span>
                ) : <span className="text-muted">ไม่มีไฟล์แนบ</span>
              ) : a.value.kind === 'location' && a.value.latitude != null ? (
                <a className="inline-flex items-center gap-1 text-accent underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${a.value.latitude},${a.value.longitude}`}>
                  <MapPin size={14} aria-hidden />{answerText(a.value)}
                </a>
              ) : a.value.kind === 'skipped' ? <span className="text-muted">ไม่ระบุ</span>
                : a.key.includes('error') ? <span className="font-mono text-[13px]">{answerText(a.value)}</span>
                : <>{answerText(a.value)}{a.priorityNote && <span className="text-muted"> ({a.priorityNote})</span>}</>}
            </dd>
          </div>
        ))}
      </dl>
      {d.attachments.length > 0 && d.answers.every((a) => a.value.kind !== 'files') && (
        <div className="mt-5">
          <h3 className="text-[12px] font-semibold text-text-2">ไฟล์แนบ</h3>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {d.attachments.map((f) => (
              <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="ไฟล์แนบ" className="h-24 w-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

const EVENT_TEXT: Record<string, (t: Extract<Detail['timeline'][number], { kind: 'event' }>) => string> = {
  created: (t) => `สร้างเคสจาก LINE${t.toName ? ` · มอบหมายอัตโนมัติให้ ${t.toName} (กฎ: ${t.from} · round-robin)` : ''}`,
  assigned: (t) => `มอบหมายให้ ${t.toName ?? '-'}${t.note === 'round-robin' ? ' (อัตโนมัติ · round-robin)' : ` โดย ${t.actorName}`}`,
  status_changed: (t) => `สถานะเปลี่ยนเป็น "${STATUS[t.to as keyof typeof STATUS]?.label ?? t.to}" โดย ${t.actorName}${t.to === 'pending_customer' ? ' · หยุดนับ SLA' : ''}${t.note ? ` · ${t.note}` : ''}`,
  priority_changed: (t) => `เปลี่ยน priority ${t.from} → ${t.to} โดย ${t.actorName}${t.note ? ` · เหตุผล: ${t.note}` : ''}`,
  first_response: (t) => t.note ?? 'ตอบรับครั้งแรก',
  sla_breached: (t) => `${t.note ?? 'เกิน SLA'} · แจ้งหัวหน้าทีมแล้ว`,
  csat_submitted: (t) => `ผู้แจ้งให้คะแนนความพึงพอใจ ${t.to}/5`,
  pending_reminder: () => 'ระบบเตือนผู้แจ้งให้ส่งข้อมูลเพิ่มเติม',
  delivery_failed: (t) => `ส่งข้อความทาง LINE ไม่สำเร็จ${t.note ? ` · ${t.note}` : ''}`,
  delivery_skipped: (t) => t.note ?? 'ส่งข้อความไม่ได้',
};

function TimelineItem({ t }: { t: Detail['timeline'][number] }) {
  if (t.kind === 'event') {
    const txt = EVENT_TEXT[t.eventType]?.(t) ?? t.eventType;
    const bad = t.eventType === 'sla_breached' || t.eventType.startsWith('delivery_');
    return (
      <p className={clsx('flex items-start gap-2 text-[13px]', bad ? 'text-critical' : 'text-muted')}>
        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
        <span><span className="tabular">{timeOnly(t.at)}</span> · {txt}</span>
      </p>
    );
  }
  const inbound = t.direction === 'in';
  const internal = t.direction === 'internal';
  const c = t.content;
  const body = c.type === 'text' ? c.text
    : c.type === 'form_submitted' ? `ส่งแบบฟอร์มแจ้งเคส ${c.answerCount} ข้อ${c.attachmentCount ? ` พร้อมภาพหน้าจอ ${c.attachmentCount} รูป` : ''}`
    : c.type === 'location' ? `📍 ${[c.title, c.address].filter(Boolean).join(' · ') || 'ตำแหน่ง'}`
    : null;
  return (
    <div className={clsx('flex gap-3', !inbound && 'flex-row-reverse')}>
      <Avatar name={t.senderName ?? '?'} className={inbound ? 'bg-success-tint text-success' : ''} />
      <div className={clsx('max-w-[75%]', !inbound && 'text-right')}>
        <p className="mb-1 text-[12px] text-muted">
          {t.senderName} · {inbound ? 'LINE' : internal ? 'บันทึกภายใน' : 'ส่งทาง LINE'} · <span title={fullWhen(t.at)}>{timeOnly(t.at)}</span>
        </p>
        <div className={clsx('inline-block whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-[14px]',
          inbound && 'border border-border bg-surface',
          t.direction === 'out' && 'bg-accent-tint',
          internal && 'border border-dashed border-note-border bg-note-tint text-note')}>
          {c.type === 'image' && t.imageUrl ? (
            <a href={t.imageUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.imageUrl} alt="รูปจากผู้แจ้ง" className="max-h-60 rounded-lg" />
            </a>
          ) : c.type === 'location' ? (
            <a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}>{body}</a>
          ) : body}
        </div>
        {t.deliveryError && <p className="mt-1 text-[12px] text-critical">ส่งไม่สำเร็จ: {t.deliveryError}</p>}
      </div>
    </div>
  );
}

const sameDay = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10) === new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

function Bar({ pct, tone }: { pct: number; tone: 'ok' | 'warn' | 'over' | 'pause' }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-tint" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={clsx('h-full rounded-full', tone === 'ok' && 'bg-accent', tone === 'warn' && 'bg-warning', tone === 'over' && 'bg-critical', tone === 'pause' && 'bg-disabled')}
        style={{ width: `${Math.min(100, Math.max(2, pct * 100))}%` }} />
    </div>
  );
}

function SlaBlock({ d }: { d: Detail }) {
  const c = d.case;
  const p = d.sla.policy;
  const h = d.sla.hours;
  const unit = p.businessHoursOnly ? ' ทำการ' : '';
  const now = new Date();
  const stopped = c.status === 'closed' || c.status === 'cancelled' || c.status === 'resolved';

  // Response clock
  let respText: string; let respTone: 'ok' | 'warn' | 'over' | 'pause'; let respPct: number;
  if (c.firstResponseAt) {
    const used = businessMinutesBetween(c.createdAt, c.firstResponseAt, h, p.businessHoursOnly);
    const wall = Math.round((c.firstResponseAt.getTime() - c.createdAt.getTime()) / 60_000);
    const met = !c.slaResponseDue || c.firstResponseAt <= c.slaResponseDue;
    respText = `${met ? 'ผ่าน' : 'เกิน'} · ${formatMinutesTh(wall)}`; respTone = met ? 'ok' : 'over'; respPct = Math.min(1, Math.max(used, 1) / p.responseMinutes);
  } else if (c.slaResponseDue && !stopped) {
    const at = c.status === 'pending_customer' && c.slaPausedAt ? c.slaPausedAt : now;
    const left = remainingMinutes(at, c.slaResponseDue, p, h);
    respPct = (p.responseMinutes - left) / p.responseMinutes;
    respTone = left < 0 ? 'over' : respPct >= 0.8 ? 'warn' : 'ok';
    respText = left < 0 ? `เกิน ${formatMinutesTh(left)}` : `เหลือ ${formatMinutesTh(left)}`;
  } else { respText = '-'; respTone = 'pause'; respPct = 0; }

  // Resolve clock
  let resText: string; let resTone: 'ok' | 'warn' | 'over' | 'pause'; let resPct = 0;
  const due = c.slaResolveDue;
  if (c.resolvedAt && stopped) {
    const met = !due || c.resolvedAt <= due;
    resText = met ? 'แก้ไขทันกำหนด' : 'แก้ไขเกินกำหนด'; resTone = met ? 'ok' : 'over'; resPct = 1;
  } else if (due) {
    const paused = c.status === 'pending_customer' && c.slaPausedAt;
    const left = remainingMinutes(paused ? c.slaPausedAt! : now, due, p, h);
    resPct = (p.resolveMinutes - left) / p.resolveMinutes;
    resTone = paused ? 'pause' : left < 0 ? 'over' : resPct >= 0.8 ? 'warn' : 'ok';
    resText = paused ? 'หยุดนับ' : left < 0 ? `เกิน ${formatMinutesTh(left)}` : `เหลือ ${formatMinutesTh(left)}`;
  } else { resText = '-'; resTone = 'pause'; }

  const toneText = { ok: 'text-success', warn: 'text-warning', over: 'text-critical', pause: 'text-muted' };
  return (
    <div className="border-t border-divider pt-5">
      <h2 className="mb-3 text-[12px] font-semibold text-text-2">SLA</h2>
      <div className="space-y-4 text-[14px]">
        <div className="space-y-1.5">
          <div className="flex justify-between"><span>ตอบรับ ({formatMinutesTh(p.responseMinutes)}{unit})</span><span className={clsx('font-semibold', toneText[respTone])}>{respText}</span></div>
          <Bar pct={respPct} tone={respTone} />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span>แก้ไข ({formatMinutesTh(p.resolveMinutes)}{unit})</span><span className={clsx('font-semibold', toneText[resTone])}>{resText}</span></div>
          <Bar pct={resPct} tone={resTone} />
          {due && !stopped && (
            <p className="text-[12px] text-muted">
              ใช้ไป {formatMinutesTh(Math.max(0, Math.round(p.resolveMinutes * resPct)))} · ครบกำหนด {sameDay(due) ? `${timeOnly(due)} น.` : fullWhen(due)}{c.status === 'pending_customer' ? ' หากไม่หยุดนับ' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactBlock({ d }: { d: Detail }) {
  const ct = d.contact;
  return (
    <div className="border-t border-divider pt-5">
      <h2 className="mb-3 text-[12px] font-semibold text-text-2">ผู้แจ้ง</h2>
      <Link href={`/contacts/${ct.id}`} className="flex items-center gap-3 hover:underline">
        <Avatar name={ct.name} className="bg-success-tint text-success" />
        <span className="min-w-0">
          <span className="block font-semibold">{ct.name}</span>
          <span className="block text-[12px] text-muted">{[ct.orgUnit, ct.consentVersion ? `ยินยอม PDPA ${ct.consentVersion}` : 'ยังไม่ยินยอม PDPA'].filter(Boolean).join(' · ')}</span>
        </span>
      </Link>
      <dl className="mt-3 space-y-2 text-[14px]">
        <div className="flex justify-between gap-2"><dt className="text-muted">โทรศัพท์</dt><dd><PhoneReveal caseId={d.case.id} masked={ct.phoneMasked} /></dd></div>
        {ct.customerRef && <div className="flex justify-between gap-2"><dt className="text-muted">รหัสลูกค้า</dt><dd>{ct.customerRef}</dd></div>}
        <div className="flex justify-between gap-2"><dt className="text-muted">เคสทั้งหมด</dt><dd>{ct.totalCases} เคส · เปิดอยู่ {ct.openCases}</dd></div>
        {ct.status !== 'active' && <div className="text-critical">ผู้แจ้ง{ct.status === 'unfollowed' ? 'เลิกติดตาม OA แล้ว' : 'ถูกบล็อก'} ส่งข้อความไม่ได้</div>}
      </dl>
    </div>
  );
}

