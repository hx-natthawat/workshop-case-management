'use client';

import clsx from 'clsx';
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Calendar, Camera, ChevronLeft, Image as ImageIcon, Inbox, Keyboard, MapPin, Menu, MessageSquare, Plus, RotateCcw, Search, SendHorizontal, X,
} from 'lucide-react';
import type { LineAction, LineMessage } from '@/server/bot/line-types';
import { FlexContents } from './flex';
import type { Persona } from './simulator';

type UserPayload =
  | { type: 'text'; text: string }
  | { type: 'postback'; displayText: string }
  | { type: 'image'; attachmentId: string; url?: string }
  | { type: 'location'; title: string; address?: string }
  | { type: 'follow' }
  | { type: 'unfollow' };

type SimMsg =
  | { id: number; direction: 'bot'; payload: LineMessage; createdAt: string }
  | { id: number; direction: 'user'; payload: UserPayload; createdAt: string };

type SendEvent =
  | { type: 'text'; text: string }
  | { type: 'postback'; data: string; displayText?: string; params?: { datetime?: string; date?: string; time?: string } }
  | { type: 'location'; title: string; address: string; latitude: number; longitude: number }
  | { type: 'follow' }
  | { type: 'unfollow' };

type Sheet =
  | { kind: 'datetime'; action: Extract<LineAction, { type: 'datetimepicker' }> }
  | { kind: 'location' }
  | { kind: 'register'; src: string }
  | null;

const POLL_MS = 1500;

const LOCATIONS = [
  { title: 'สำนักงานใหญ่ อาคาร A ชั้น 5', address: '123 ถนนสาทร แขวงยานนาวา เขตสาทร กรุงเทพฯ 10120', latitude: 13.7208, longitude: 100.5292 },
  { title: 'สาขาสีลม', address: '191 ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพฯ 10500', latitude: 13.7262, longitude: 100.5234 },
  { title: 'สาขาลาดพร้าว', address: '1693 ถนนพหลโยธิน แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900', latitude: 13.8166, longitude: 100.5613 },
  { title: 'คลังสินค้าบางนา', address: '88 ถนนบางนา-ตราด กม. 5 เขตบางนา กรุงเทพฯ 10260', latitude: 13.6682, longitude: 100.6341 },
];

const RICH_MENU: { label: string; data: string; icon: typeof Plus; primary?: boolean }[] = [
  { label: 'แจ้งปัญหาใหม่', data: 'menu:start', icon: Plus, primary: true },
  { label: 'ติดตามสถานะ', data: 'menu:track', icon: Search },
  { label: 'เคสของฉัน', data: 'menu:my_cases', icon: Inbox },
  { label: 'ติดต่อเจ้าหน้าที่', data: 'menu:handoff', icon: MessageSquare },
];

const timeFmt = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' });
const fmtTime = (iso: string) => timeFmt.format(new Date(iso));

function thaiDateTimeLabel(value: string, mode: 'datetime' | 'date' | 'time'): string {
  if (mode === 'time') return value;
  const d = new Date(mode === 'date' ? `${value}T00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', ...(mode === 'datetime' ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(d);
}

function localRegisterSrc(uri: string): string | null {
  try {
    const u = new URL(uri, window.location.origin);
    return u.pathname.startsWith('/liff/register') ? `${u.pathname}${u.search}` : null;
  } catch {
    return null;
  }
}

export function Phone({ persona, oaName, onChanged }: { persona: Persona; oaName: string; onChanged: () => void }) {
  const userId = persona.lineUserId;
  const [messages, setMessages] = useState<SimMsg[]>([]);
  const [pending, setPending] = useState<{ label: string } | null>(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [richMenu, setRichMenu] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrDismissed, setQrDismissed] = useState<number | null>(null);
  const [hideBefore, setHideBefore] = useState(0);

  const lastId = useRef(0);
  const polling = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrolledOnce = useRef(false);

  const poll = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const res = await fetch(`/api/sim/messages?userId=${encodeURIComponent(userId)}&after=${lastId.current}`, { cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as { messages: SimMsg[] };
      if (body.messages.length) {
        lastId.current = body.messages[body.messages.length - 1].id;
        setMessages((m) => [...m, ...body.messages]);
      }
    } catch {
      /* network blip: next tick retries */
    } finally {
      polling.current = false;
    }
  }, [userId]);

  useEffect(() => {
    void poll();
    const t = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: scrolledOnce.current ? 'smooth' : 'auto' });
    if (el.scrollHeight > el.clientHeight) scrolledOnce.current = true;
  }, [messages, pending, typing]);

  // The register page (iframe) tells us when it is done.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if ((e.data as { type?: string })?.type === 'registered') {
        setTimeout(() => setSheet(null), 1200);
        void poll();
        onChanged();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [poll, onChanged]);

  const visible = messages.filter((m) => m.id > hideBefore);
  const last = visible[visible.length - 1];
  const quickReply = last && last.direction === 'bot' && last.id !== qrDismissed && !pending && !typing ? last.payload.quickReply : undefined;

  async function send(event: SendEvent | FormData, label: string | null) {
    if (last) setQrDismissed(last.id);
    setError(null);
    if (label) setPending({ label });
    setTyping(true);
    try {
      const isForm = event instanceof FormData;
      const res = await fetch('/api/sim/send', {
        method: 'POST',
        ...(isForm ? { body: event } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, event }) }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? 'ส่งไม่สำเร็จ');
      }
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
      await poll();
      setPending(null);
      setTyping(false);
      onChanged();
    }
  }

  function act(a: LineAction) {
    switch (a.type) {
      case 'postback':
        void send({ type: 'postback', data: a.data, displayText: a.displayText }, a.displayText ?? null);
        break;
      case 'message':
        void send({ type: 'text', text: a.text }, a.text);
        break;
      case 'uri': {
        const src = localRegisterSrc(a.uri);
        if (src) setSheet({ kind: 'register', src });
        else window.open(a.uri, '_blank', 'noopener,noreferrer');
        break;
      }
      case 'datetimepicker':
        setSheet({ kind: 'datetime', action: a });
        break;
      case 'location':
        setSheet({ kind: 'location' });
        break;
      case 'camera':
      case 'cameraRoll':
        fileRef.current?.click();
        break;
    }
  }

  function submitText(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    void send({ type: 'text', text: t }, t);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError('รองรับเฉพาะไฟล์รูปภาพ');
    if (f.size > 10 * 1024 * 1024) return setError('ไฟล์ใหญ่เกิน 10 MB');
    const fd = new FormData();
    fd.set('userId', userId);
    fd.set('file', f);
    void send(fd, '📷 รูปภาพ');
  }

  function resetView() {
    setHideBefore(lastId.current);
    setQrDismissed(null);
  }

  const unfollowed = persona.status === 'unfollowed';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex h-[800px] max-h-[calc(100dvh-96px)] min-h-[560px] w-[390px] max-w-full flex-col overflow-hidden rounded-[36px] border-[10px] border-[#1d1f21] bg-white shadow-xl">
        {/* LINE header */}
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-white px-3 py-2.5">
          <ChevronLeft aria-hidden className="size-6 text-text" />
          <BotAvatar />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold leading-tight">{oaName}</p>
            <p className="truncate text-[12px] text-muted">บัญชีทางการ · ตอบกลับทันที</p>
          </div>
        </header>

        {/* Chat */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-line-chat px-3 py-4" aria-live="polite" aria-label="ข้อความในแชท">
          {visible.length === 0 && !pending && (
            <p className="mt-10 text-center text-[13px] text-muted">ยังไม่มีข้อความ ลองกด &quot;เมนู&quot; แล้วเลือก &quot;แจ้งปัญหาใหม่&quot;</p>
          )}
          <div className="flex flex-col gap-2.5">
            {visible.map((m, i) => {
              const prev = visible[i - 1];
              const showAvatar = m.direction === 'bot' && (!prev || prev.direction !== 'bot');
              return (
                <Fragment key={m.id}>
                  {m.direction === 'bot'
                    ? <BotRow msg={m.payload} time={fmtTime(m.createdAt)} showAvatar={showAvatar} onAction={act} disabled={typing} />
                    : <UserRow payload={m.payload} time={fmtTime(m.createdAt)} />}
                </Fragment>
              );
            })}
            {pending && <UserRow payload={{ type: 'text', text: pending.label }} time="" sending />}
            {typing && (
              <div className="flex items-end gap-2">
                <BotAvatar small />
                <div className="flex h-9 items-center gap-1 rounded-[16px] bg-white px-3" aria-label="บอทกำลังพิมพ์">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="size-1.5 animate-bounce rounded-full bg-disabled" style={{ animationDelay: `${d * 120}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick reply */}
        {quickReply && !richMenu && (
          <div className="shrink-0 bg-line-chat">
            <div className="flex gap-2 overflow-x-auto px-3 pb-2.5 pt-1 [scrollbar-width:none]" role="group" aria-label="ตัวเลือกด่วน">
              {quickReply.items.map((it, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => act(it.action)}
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-accent bg-white px-4 text-[14px] font-medium text-accent hover:bg-accent-tint"
                >
                  <ActionIcon a={it.action} />
                  {it.action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="flex shrink-0 items-center justify-between gap-2 bg-critical-tint px-3 py-1.5 text-[12px] text-critical">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="ปิดข้อความผิดพลาด" className="p-1"><X className="size-3.5" /></button>
          </div>
        )}

        {/* Input bar / rich menu */}
        {richMenu ? (
          <div className="shrink-0 border-t border-border bg-white">
            <div className="flex items-center justify-between px-3 py-2">
              <button type="button" onClick={() => setRichMenu(false)} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-[13px]">
                <Keyboard aria-hidden className="size-4" /> แป้นพิมพ์
              </button>
              <span className="text-[13px] text-muted">เมนูหลัก ▾</span>
              <span className="w-[92px]" />
            </div>
            <div className="grid grid-cols-2">
              {RICH_MENU.map((r) => (
                <button
                  key={r.data}
                  type="button"
                  disabled={typing}
                  onClick={() => { setRichMenu(false); void send({ type: 'postback', data: r.data, displayText: r.label }, r.label); }}
                  className={clsx(
                    'flex h-[92px] flex-col items-center justify-center gap-1.5 border-t border-border text-[14px] font-medium odd:border-r disabled:opacity-60',
                    r.primary ? 'bg-accent text-white' : 'bg-white text-text hover:bg-row-hover',
                  )}
                >
                  <r.icon aria-hidden className={clsx('size-6', !r.primary && 'text-accent')} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={submitText} className="flex shrink-0 items-center gap-2 border-t border-border bg-white px-2.5 py-2">
            <button type="button" onClick={() => setRichMenu(true)} className="inline-flex h-11 items-center gap-1 rounded-lg border border-border-strong px-2.5 text-[14px]" aria-label="เปิดเมนู">
              <Menu aria-hidden className="size-4" /> เมนู
            </button>
            <label htmlFor="sim-text" className="sr-only">พิมพ์ข้อความ</label>
            <input
              id="sim-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={unfollowed ? 'เพิ่มเพื่อนก่อนจึงจะแชทได้' : 'พิมพ์ข้อความ'}
              disabled={unfollowed}
              autoComplete="off"
              className="h-11 min-w-0 flex-1 rounded-full bg-field px-4 text-[15px] placeholder:text-disabled focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            {text.trim() ? (
              <button type="submit" aria-label="ส่งข้อความ" className="inline-flex size-11 items-center justify-center rounded-full text-accent hover:bg-accent-tint">
                <SendHorizontal className="size-5" />
              </button>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} aria-label="ส่งรูปภาพ" className="inline-flex size-11 items-center justify-center rounded-full text-text-2 hover:bg-hover">
                <ImageIcon className="size-5" />
              </button>
            )}
          </form>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} aria-hidden tabIndex={-1} />

        {/* Sheets inside the phone */}
        {sheet?.kind === 'register' && (
          <div className="absolute inset-0 z-20 flex flex-col bg-black/40">
            <div className="mt-8 flex flex-1 flex-col overflow-hidden rounded-t-2xl bg-white">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
                <span className="text-[14px] font-semibold">ลงทะเบียน</span>
                <button type="button" onClick={() => setSheet(null)} aria-label="ปิดหน้าลงทะเบียน" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-hover">
                  <X className="size-5" />
                </button>
              </div>
              <iframe src={sheet.src} title="หน้าลงทะเบียน (LIFF)" className="w-full flex-1 border-0" />
            </div>
          </div>
        )}
        {sheet?.kind === 'datetime' && (
          <DateTimeSheet
            action={sheet.action}
            onCancel={() => setSheet(null)}
            onPick={(value) => {
              const mode = sheet.action.mode;
              setSheet(null);
              const params = mode === 'datetime' ? { datetime: value } : mode === 'date' ? { date: value } : { time: value };
              const label = thaiDateTimeLabel(value, mode);
              void send({ type: 'postback', data: sheet.action.data, params, displayText: label }, label);
            }}
          />
        )}
        {sheet?.kind === 'location' && (
          <BottomSheet title="ส่งตำแหน่งที่ตั้ง" onClose={() => setSheet(null)}>
            <ul className="divide-y divide-divider">
              {LOCATIONS.map((l) => (
                <li key={l.title}>
                  <button
                    type="button"
                    onClick={() => { setSheet(null); void send({ type: 'location', ...l }, `📍 ${l.title}`); }}
                    className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left hover:bg-row-hover"
                  >
                    <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-critical" />
                    <span>
                      <span className="block text-[14px] font-medium">{l.title}</span>
                      <span className="block text-[12px] text-muted">{l.address}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </BottomSheet>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-[12px]">
        <button type="button" onClick={resetView} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 hover:bg-hover">
          <RotateCcw aria-hidden className="size-3.5" /> รีเซ็ตแชท
        </button>
        {unfollowed ? (
          <button type="button" onClick={() => void send({ type: 'follow' }, null)} className="inline-flex h-8 items-center rounded-md border border-border-strong bg-surface px-3 hover:bg-hover">
            เพิ่มเพื่อนอีกครั้ง (follow)
          </button>
        ) : (
          <button type="button" onClick={() => void send({ type: 'unfollow' }, null)} className="inline-flex h-8 items-center rounded-md border border-border-strong bg-surface px-3 text-muted hover:bg-hover">
            บล็อก / เลิกติดตาม (unfollow)
          </button>
        )}
        <span className="text-muted">รีเซ็ตแชทล้างเฉพาะหน้าจอ ไม่ลบข้อมูล</span>
      </div>
    </div>
  );
}

function BotAvatar({ small }: { small?: boolean }) {
  return (
    <span aria-hidden className={clsx('inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-white', small ? 'size-8 text-[11px]' : 'size-10 text-[13px]')}>
      CS
    </span>
  );
}

function ActionIcon({ a }: { a: LineAction }) {
  const cls = 'size-4';
  if (a.type === 'camera') return <Camera aria-hidden className={cls} />;
  if (a.type === 'cameraRoll') return <ImageIcon aria-hidden className={cls} />;
  if (a.type === 'location') return <MapPin aria-hidden className={cls} />;
  if (a.type === 'datetimepicker') return <Calendar aria-hidden className={cls} />;
  return null;
}

function BotRow({ msg, time, showAvatar, onAction, disabled }: { msg: LineMessage; time: string; showAvatar: boolean; onAction: (a: LineAction) => void; disabled?: boolean }) {
  // A message with a custom sender (agent reply) shows that name and an initials avatar, as in LineTrack.png.
  const sender = msg.sender?.name;
  const initials = sender ? sender.replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') : '';
  return (
    <div className="flex items-start gap-2">
      {sender ? (
        <span aria-hidden className="mt-5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral text-[11px] font-semibold text-white">{initials}</span>
      ) : showAvatar ? <BotAvatar small /> : <span className="w-8 shrink-0" />}
      <div className="min-w-0 flex-1">
        {sender && <p className="mb-1 truncate text-[12px] text-text-2">{sender}</p>}
        <div className="flex min-w-0 items-end gap-1.5">
          {msg.type === 'text' ? (
            <p className="max-w-[250px] whitespace-pre-wrap break-words rounded-[16px] bg-white px-3.5 py-2.5 text-[15px] leading-relaxed">{msg.text}</p>
          ) : (
            <div className={clsx('min-w-0', msg.contents.type === 'carousel' && 'flex-1')}>
              <FlexContents contents={msg.contents} onAction={onAction} disabled={disabled} />
            </div>
          )}
          {msg.type === 'text' || msg.contents.type === 'bubble' ? <span className="shrink-0 pb-0.5 text-[10.5px] text-muted">{time}</span> : null}
        </div>
      </div>
    </div>
  );
}

function UserRow({ payload, time, sending }: { payload: UserPayload; time: string; sending?: boolean }) {
  if (payload.type === 'follow' || payload.type === 'unfollow') {
    return (
      <p className="mx-auto rounded-full bg-black/10 px-3 py-1 text-[11.5px] text-text-2">
        {payload.type === 'follow' ? 'คุณเพิ่มบัญชีนี้เป็นเพื่อนแล้ว' : 'คุณบล็อก/เลิกติดตามบัญชีนี้'}
      </p>
    );
  }
  return (
    <div className={clsx('flex items-end justify-end gap-1.5', sending && 'opacity-60')}>
      <span className="shrink-0 pb-0.5 text-right text-[10.5px] leading-tight text-muted">
        {sending ? 'กำลังส่ง' : <>อ่านแล้ว<br />{time}</>}
      </span>
      {payload.type === 'image' ? (
        payload.url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={payload.url} alt="รูปที่ส่ง" className="max-h-60 max-w-[200px] rounded-[14px] object-cover" />
          : <p className="rounded-[16px] bg-line-user px-3.5 py-2.5 text-[15px]">รูปภาพ</p>
      ) : payload.type === 'location' ? (
        <div className="max-w-[240px] overflow-hidden rounded-[16px] bg-white">
          <div className="flex h-20 items-center justify-center bg-[#E8EEF1]"><MapPin aria-hidden className="size-7 text-critical" /></div>
          <div className="px-3 py-2">
            <p className="text-[14px] font-medium">{payload.title}</p>
            {payload.address && <p className="text-[11.5px] text-muted">{payload.address}</p>}
          </div>
        </div>
      ) : (
        <p className="max-w-[250px] whitespace-pre-wrap break-words rounded-[16px] bg-line-user px-3.5 py-2.5 text-[15px] leading-relaxed">
          {payload.type === 'text' ? payload.text : payload.displayText}
        </p>
      )}
    </div>
  );
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="flex-1 cursor-default" aria-label="ปิด" onClick={onClose} tabIndex={-1} />
      <div className="rounded-t-2xl bg-white pb-3">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-[15px] font-semibold">{title}</span>
          <button type="button" onClick={onClose} aria-label="ปิด" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-hover">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DateTimeSheet({ action, onPick, onCancel }: { action: Extract<LineAction, { type: 'datetimepicker' }>; onPick: (v: string) => void; onCancel: () => void }) {
  const type = action.mode === 'datetime' ? 'datetime-local' : action.mode;
  const [value, setValue] = useState(action.initial ?? '');
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    el?.focus();
    try { el?.showPicker?.(); } catch { /* needs user gesture in some browsers */ }
  }, []);

  function confirm() {
    if (!value) return setErr('กรุณาเลือกวันเวลา');
    if (action.max && value > action.max) return setErr('เลือกเวลาในอนาคตไม่ได้');
    onPick(action.mode === 'datetime' ? value.slice(0, 16) : value);
  }

  return (
    <BottomSheet title={action.label} onClose={onCancel}>
      <div className="space-y-3 px-4 pt-3">
        <label htmlFor="sim-dt" className="block text-[13px] text-text-2">เลือกวันและเวลา</label>
        <input
          id="sim-dt"
          ref={inputRef}
          type={type}
          value={value}
          max={action.max}
          onChange={(e) => { setValue(e.target.value); setErr(null); }}
          className="h-11 w-full rounded-md border border-border-strong px-3 text-[15px] focus:border-accent focus:outline-none"
        />
        {err && <p className="text-[12px] text-critical">{err}</p>}
        <button type="button" onClick={confirm} className="h-11 w-full rounded-lg bg-accent text-[15px] font-semibold text-white hover:bg-accent-hover">
          ตกลง
        </button>
      </div>
    </BottomSheet>
  );
}
