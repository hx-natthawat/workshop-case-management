/**
 * LINE message builders. Layout and copy follow the approved prototype
 * (prototype/screens/Main.png, LineConfirm.png, LineTrack.png; source/*.dc.html).
 * Bot copy: polite register ending in "ครับ" (CLAUDE.md).
 */
import { config } from '@/server/lib/config';
import { botText } from './bot-texts';
import type { FlexBubble, FlexComponent, LineAction, LineMessage, LineSender, QuickReply } from './line-types';

// Colours from prototype/tokens.css (LINE needs literal hex values).
export const ACCENT = '#0B6B5D';
const TEXT = '#1A1C1E';
const MUTED = '#5A6066';
const BORDER = '#E2E0DA';
const DIVIDER = '#EEEDEA';
const CRITICAL = '#B42318';

export type ToneName = 'info' | 'neutral' | 'accent' | 'warning' | 'success' | 'critical';
export const TONE_HEX: Record<ToneName, { bg: string; fg: string }> = {
  info: { bg: '#E8F0FB', fg: '#1F5AA6' },
  neutral: { bg: '#EEEDEA', fg: '#3F4449' },
  accent: { bg: '#E3F1EE', fg: '#0B6B5D' },
  warning: { bg: '#FDF0E1', fg: '#B54708' },
  success: { bg: '#E6F4EC', fg: '#17744A' },
  critical: { bg: '#FDECEA', fg: '#B42318' },
};
const CATEGORY_TONES: ToneName[] = ['accent', 'warning', 'info', 'success'];

const QR_MAX = 13; // LINE Quick Reply limit
const CAROUSEL_MAX = 12; // LINE Flex carousel limit

export const CMD = {
  back: 'ย้อนกลับ',
  restart: 'เริ่มใหม่',
  cancel: 'ยกเลิก',
  handoff: 'คุยกับเจ้าหน้าที่',
  skip: 'ข้าม',
  done: 'เสร็จ',
} as const;

export const MENU_TEXT = {
  start: 'แจ้งปัญหาใหม่',
  track: 'ติดตามสถานะ',
  myCases: 'เคสของฉัน',
  handoff: 'ติดต่อเจ้าหน้าที่',
} as const;

export const pb = (label: string, data: string, displayText: string | undefined = label): LineAction => ({
  type: 'postback', label: label.slice(0, 20), data, displayText,
});

export function quickReply(actions: LineAction[]): QuickReply | undefined {
  if (!actions.length) return undefined;
  return { items: actions.slice(0, QR_MAX).map((action) => ({ type: 'action', action })) };
}

export const text = (t: string, actions: LineAction[] = [], sender?: LineSender): LineMessage => ({
  type: 'text', text: t, quickReply: quickReply(actions), ...(sender ? { sender } : {}),
});

export const menuActions = (): LineAction[] => [
  pb(MENU_TEXT.start, 'menu:start'),
  pb(MENU_TEXT.myCases, 'menu:my_cases'),
  pb(MENU_TEXT.handoff, 'menu:handoff'),
];

// ── Flex helpers ──────────────────────────────────────────────

type Box = Extract<FlexComponent, { type: 'box' }>;
const t = (s: string, o: Partial<Extract<FlexComponent, { type: 'text' }>> = {}): FlexComponent => ({
  type: 'text', text: s || '-', wrap: true, color: TEXT, ...o,
});
const vbox = (contents: FlexComponent[], o: Partial<Box> = {}): Box => ({ type: 'box', layout: 'vertical', contents, ...o });
const hbox = (contents: FlexComponent[], o: Partial<Box> = {}): Box => ({ type: 'box', layout: 'horizontal', contents, ...o });
const link = (action: LineAction, color = ACCENT): FlexComponent => ({ type: 'button', action, style: 'link', height: 'md', color });
const primary = (action: LineAction): FlexComponent => ({ type: 'button', action, style: 'primary', height: 'md', color: ACCENT });
const vsep: FlexComponent = { type: 'separator' };

/** Label/value rows as in the summary and success cards. */
const kvRows = (rows: { label: string; value: string; color?: string; bold?: boolean }[]): FlexComponent[] =>
  rows.map((r, i) => hbox([
    t(r.label, { size: 'sm', color: MUTED, flex: 2 }),
    t(r.value, { size: 'sm', flex: 4, color: r.color ?? TEXT, weight: r.bold ? 'bold' : 'regular' }),
  ], { spacing: 'md', ...(i ? { margin: 'md' } : {}) }));

/** Pill chip (status). */
const chip = (label: string, tone: ToneName): Box => vbox(
  [t(label, { size: 'xs', color: TONE_HEX[tone].fg, weight: 'bold', wrap: false, align: 'center' })],
  { backgroundColor: TONE_HEX[tone].bg, cornerRadius: '12px', paddingStart: '10px', paddingEnd: '10px', paddingTop: '3px', paddingBottom: '3px', flex: 0 },
);

const iconUrl = (icon: string, fg: string) => `${config.baseUrl()}/api/flex-icon/${encodeURIComponent(icon)}?c=${fg.slice(1)}`;

// ── Registration ──────────────────────────────────────────────

export function welcome(oaName: string, registerUrl: string, displayName?: string | null): LineMessage[] {
  return [
    text(botText('welcome', { name: displayName ? ` คุณ${displayName}` : '', oa: oaName })),
    registerCard('ลงทะเบียนก่อนแจ้งปัญหา', 'กรอกชื่อ เบอร์โทร และรหัสลูกค้าเพียงครั้งเดียว พร้อมอ่านประกาศความเป็นส่วนตัวครับ', registerUrl),
  ];
}

export const registerFirst = (registerUrl: string): LineMessage[] => [
  registerCard('กรุณาลงทะเบียนก่อนใช้งานครับ', 'ใช้เวลาไม่ถึง 1 นาที', registerUrl),
];

function registerCard(title: string, body: string, url: string): LineMessage {
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      body: vbox([t(title, { weight: 'bold', size: 'md' }), t(body, { size: 'sm', color: MUTED, margin: 'md' })], { paddingAll: '20px' }),
      footer: vbox([primary({ type: 'uri', label: 'ลงทะเบียน', uri: url })], { paddingAll: '0px' }),
    },
  };
}

export const registered = (name: string): LineMessage[] => [
  text(botText('registered', { name }), menuActions()),
];

// ── Categories (Main.png) ─────────────────────────────────────

export interface CategoryCard { id: string; name: string; hint?: string | null; icon?: string | null }

export function categoryCarousel(greetingName: string | null, parents: CategoryCard[]): LineMessage[] {
  const bubbles: FlexBubble[] = parents.slice(0, CAROUSEL_MAX).map((c, i) => {
    const tone = TONE_HEX[CATEGORY_TONES[i % CATEGORY_TONES.length]];
    return {
      type: 'bubble',
      size: 'micro',
      hero: vbox([{ type: 'image', url: iconUrl(c.icon ?? 'circle-help', tone.fg), size: '40px', aspectRatio: '1:1', aspectMode: 'fit' }], {
        backgroundColor: tone.bg, paddingTop: '20px', paddingBottom: '20px', alignItems: 'center',
      }),
      body: vbox([
        t(c.name, { weight: 'bold', size: 'md' }),
        t(c.hint ?? ' ', { size: 'xs', color: MUTED, margin: 'md' }),
      ], { paddingAll: '16px' }),
      footer: vbox([link(pb('เลือก', `cat:${c.id}`, c.name))], { paddingAll: '0px' }),
      styles: { footer: { separator: true, separatorColor: BORDER } },
    };
  });
  return [
    text(botText('greeting', { name: greetingName ? ` คุณ${greetingName}` : '' })),
    { type: 'flex', altText: 'เลือกหมวดหมู่ที่ต้องการแจ้ง', contents: { type: 'carousel', contents: bubbles }, quickReply: quickReply([pb(CMD.cancel, 'cmd:cancel')]) },
  ];
}

export function subcategoryPrompt(parentName: string, children: CategoryCard[]): LineMessage[] {
  const actions = children.map((c) => pb(c.name, `cat:${c.id}`, c.name));
  const prompt = `${parentName} · เลือกหัวข้อย่อยครับ`;
  if (actions.length <= QR_MAX - 1) return [text(prompt, [...actions, pb(CMD.back, 'cmd:back')])];
  return [optionList(prompt, actions), text('หรือกดย้อนกลับครับ', [pb(CMD.back, 'cmd:back')])];
}

/** Long option lists: bubbles of up to 10 buttons each, max 12 bubbles. */
export function optionList(title: string, actions: LineAction[]): LineMessage {
  const pages: LineAction[][] = [];
  for (let i = 0; i < actions.length && pages.length < CAROUSEL_MAX; i += 10) pages.push(actions.slice(i, i + 10));
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'carousel',
      contents: pages.map((page, i) => ({
        type: 'bubble',
        body: vbox([
          t(pages.length > 1 ? `${title} (${i + 1}/${pages.length})` : title, { weight: 'bold', size: 'sm' }),
          ...page.map((a): FlexComponent => ({ type: 'button', action: a, style: 'secondary', height: 'sm', margin: 'sm' })),
        ], { paddingAll: '16px' }),
      })),
    },
  };
}

// ── Questions (Main.png "ข้อ 1 จาก 5 · เข้าระบบไม่ได้") ─────────

export function questionBubble(head: string, question: string, actions: LineAction[]): LineMessage {
  return {
    type: 'flex',
    altText: question,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: vbox([t(head, { size: 'xs', color: MUTED, weight: 'bold' }), t(question, { size: 'md', margin: 'sm' })], { paddingAll: '16px' }),
    },
    quickReply: quickReply(actions),
  };
}

// ── Summary / success (LineConfirm.png) ───────────────────────

export function summary(categoryPath: string, rows: { label: string; value: string }[]): LineMessage {
  return {
    type: 'flex',
    altText: 'ตรวจสอบข้อมูลก่อนส่ง',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: vbox([t('ตรวจสอบข้อมูลก่อนส่ง', { weight: 'bold', size: 'lg' }), t(categoryPath, { size: 'sm', color: MUTED, margin: 'sm' })], { paddingAll: '20px' }),
      body: vbox(kvRows(rows), { paddingAll: '20px' }),
      footer: vbox([
        primary(pb('ยืนยันและส่งเรื่อง', 'sum:confirm')),
        hbox([link(pb('แก้ไขบางข้อ', 'sum:edit')), vsep, link(pb('ยกเลิก', 'sum:cancel'), MUTED)]),
      ], { paddingAll: '0px' }),
      styles: { body: { separator: true, separatorColor: DIVIDER }, footer: { separator: false } },
    },
  };
}

export function caseCreated(input: { caseNo: string; priorityLabel: string; priorityTone: ToneName; etaText: string; teamName: string | null }): LineMessage {
  const rows = [
    { label: 'ความเร่งด่วน', value: input.priorityLabel, color: TONE_HEX[input.priorityTone].fg, bold: true },
    { label: 'ตอบรับภายใน', value: input.etaText },
    ...(input.teamName ? [{ label: 'ทีมที่ดูแล', value: input.teamName }] : []),
  ];
  return {
    type: 'flex',
    altText: `รับเรื่องเรียบร้อย เลขเคส ${input.caseNo}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: vbox([
        t('✓ รับเรื่องเรียบร้อย', { size: 'sm', weight: 'bold', color: ACCENT }),
        t(input.caseNo, { size: 'xxl', weight: 'bold', margin: 'md', wrap: false }),
      ], { paddingAll: '20px' }),
      body: vbox(kvRows(rows), { paddingAll: '20px' }),
      footer: vbox([link(pb(MENU_TEXT.track, `case:${input.caseNo}`, input.caseNo))], { paddingAll: '0px' }),
      styles: { header: { backgroundColor: TONE_HEX.accent.bg }, footer: { separator: true, separatorColor: BORDER } },
    },
  };
}

// ── My cases / detail (LineTrack.png) ─────────────────────────

export interface CaseCard {
  id: string;
  caseNo: string;
  title: string;
  statusLabel: string;
  statusTone: ToneName;
  assigneeName: string | null;
  updatedText: string;
}

const MY_CASES_MAX = 10;

export function myCases(cards: CaseCard[]): LineMessage[] {
  if (!cards.length) return [text(botText('no_open_cases'), menuActions())];
  const shown = cards.slice(0, MY_CASES_MAX);
  const items: FlexComponent[] = shown.map((c) => vbox([
    hbox([t(c.caseNo, { size: 'md', wrap: false, flex: 1, gravity: 'center' }), chip(c.statusLabel, c.statusTone)], { alignItems: 'center' }),
    t(c.title, { size: 'sm', margin: 'md' }),
    t(`ผู้ดูแล ${c.assigneeName ?? 'รอมอบหมาย'} · อัปเดต ${c.updatedText}`, { size: 'xs', color: MUTED, margin: 'sm' }),
  ], { borderWidth: '1px', borderColor: BORDER, cornerRadius: '12px', paddingAll: '14px', margin: 'lg', action: pb('ดูรายละเอียด', `case:${c.caseNo}`, c.caseNo) }));
  const more = cards.length > MY_CASES_MAX ? [t(`และอีก ${cards.length - MY_CASES_MAX} เคส`, { size: 'xs', color: MUTED, margin: 'md' })] : [];
  return [{
    type: 'flex',
    altText: `เคสของฉัน · เปิดอยู่ ${cards.length} เคส`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: vbox([t(`เคสของฉัน · เปิดอยู่ ${cards.length} เคส`, { weight: 'bold', size: 'md' }), ...items, ...more], { paddingAll: '20px' }),
    },
    quickReply: quickReply(menuActions()),
  }];
}

export function caseDetail(c: CaseCard & { categoryPath: string; createdText: string; answers: { label: string; value: string }[] }): LineMessage {
  return {
    type: 'flex',
    altText: `รายละเอียดเคส ${c.caseNo}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: vbox([
        hbox([t(c.caseNo, { size: 'md', weight: 'bold', wrap: false, flex: 1, gravity: 'center' }), chip(c.statusLabel, c.statusTone)], { alignItems: 'center' }),
        t(c.title, { size: 'sm', margin: 'md' }),
      ], { paddingAll: '20px' }),
      body: vbox(kvRows([
        { label: 'หมวด', value: c.categoryPath },
        { label: 'แจ้งเมื่อ', value: c.createdText },
        { label: 'ผู้ดูแล', value: c.assigneeName ?? 'รอมอบหมาย' },
        ...c.answers.slice(0, 8),
      ]), { paddingAll: '20px' }),
      styles: { body: { separator: true, separatorColor: DIVIDER } },
    },
    quickReply: quickReply(menuActions()),
  };
}

// ── After resolution (LineTrack.png) ──────────────────────────

export function resolvedCard(caseId: string, caseNo: string): LineMessage {
  const scoreBox = (n: number): FlexComponent => vbox([t(String(n), { weight: 'bold', size: 'md', align: 'center', wrap: false })], {
    borderWidth: '1px', borderColor: '#D4D2CC', cornerRadius: '8px', height: '44px', justifyContent: 'center', flex: 1,
    action: pb(String(n), `score:${caseId}:${n}`, `ให้คะแนน ${n}`),
  });
  return {
    type: 'flex',
    altText: `แก้ไขแล้ว · ${caseNo} ปัญหาได้รับการแก้ไขเรียบร้อยหรือไม่`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: vbox([
        t(`✓ แก้ไขแล้ว · ${caseNo}`, { size: 'sm', weight: 'bold', color: ACCENT }),
        t('ปัญหาได้รับการแก้ไขเรียบร้อยหรือไม่', { size: 'md', weight: 'bold', margin: 'md' }),
      ], { paddingAll: '20px' }),
      body: vbox([
        t('ให้คะแนนความพึงพอใจ (1 = น้อยที่สุด)', { size: 'sm', color: MUTED }),
        hbox([1, 2, 3, 4, 5].map(scoreBox), { spacing: 'sm', margin: 'md' }),
      ], { paddingAll: '20px' }),
      footer: vbox([hbox([link(pb('เรียบร้อยแล้ว', `csat:ok:${caseId}`)), vsep, link(pb('ยังไม่เรียบร้อย', `csat:notyet:${caseId}`), CRITICAL)])], { paddingAll: '0px' }),
      styles: { body: { separator: true, separatorColor: DIVIDER }, footer: { separator: true, separatorColor: BORDER } },
    },
  };
}

export function askScore(caseId: string): LineMessage {
  const labels = ['1 ไม่พอใจมาก', '2 ไม่พอใจ', '3 พอใช้', '4 พอใจ', '5 พอใจมาก'];
  return text('ขอบคุณครับ ช่วยให้คะแนนความพึงพอใจกับการบริการครั้งนี้ด้วยครับ (1–5)', labels.map((l, i) => pb(l, `score:${caseId}:${i + 1}`, l)));
}

/**
 * Agent reply as it appears in LINE: plain text with the agent's name as sender (LineTrack.png).
 * `sender.name` is capped at 20 characters, so when the reporter has several open cases the case
 * number goes at the top of the text instead (D-016).
 */
export function agentReply(body: string, agentName: string, caseNo?: string): LineMessage {
  return text(caseNo ? `เคส ${caseNo}\n${body}` : body, [], { name: agentName.slice(0, 20) });
}
