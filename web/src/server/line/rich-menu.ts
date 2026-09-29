/**
 * The 4-button rich menu from SPEC §3 and prototype LineTrack.png, provisioned on a real LINE OA (G5, #21).
 * Limits verified in docs/po/01-research-r1.md Q9.
 */
import { config } from '@/server/lib/config';
import { MENU_TEXT } from '@/server/bot/messages';

export const RICH_MENU_SIZE = { width: 2500, height: 1686 } as const; // ratio 1.48 ≥ 1.45
const MAX_IMAGE_BYTES = 1024 * 1024;

export interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number };
  action: { type: 'postback'; data: string; displayText: string; label: string };
}
export interface RichMenu {
  size: { width: number; height: number };
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: RichMenuArea[];
}

export const RICH_MENU_BUTTONS = [
  { data: 'menu:start', label: MENU_TEXT.start, icon: 'plus' },
  { data: 'menu:track', label: MENU_TEXT.track, icon: 'search' },
  { data: 'menu:my_cases', label: MENU_TEXT.myCases, icon: 'inbox' },
  { data: 'menu:handoff', label: MENU_TEXT.handoff, icon: 'message-square' },
] as const;

export function buildRichMenu(): RichMenu {
  const w = RICH_MENU_SIZE.width / 2;
  const h = RICH_MENU_SIZE.height / 2;
  return {
    size: { ...RICH_MENU_SIZE },
    selected: true,
    name: 'case-bot-main-v1',
    chatBarText: 'เมนูหลัก',
    areas: RICH_MENU_BUTTONS.map((b, i) => ({
      bounds: { x: (i % 2) * w, y: Math.floor(i / 2) * h, width: w, height: h },
      action: { type: 'postback', data: b.data, displayText: b.label, label: b.label },
    })),
  };
}

/** Thai messages for every rule broken; empty when LINE should accept the object. */
export function richMenuProblems(m: RichMenu): string[] {
  const p: string[] = [];
  const { width, height } = m.size;
  if (width < 800 || width > 2500) p.push('ความกว้างต้องอยู่ระหว่าง 800–2500 px');
  if (height < 250) p.push('ความสูงต้องไม่น้อยกว่า 250 px');
  if (width / height < 1.45) p.push('อัตราส่วนกว้าง/สูงต้องไม่น้อยกว่า 1.45');
  if ([...m.chatBarText].length > 14) p.push('chatBarText ยาวเกิน 14 ตัวอักษร');
  if (m.name.length > 300) p.push('name ยาวเกิน 300 ตัวอักษร');
  if (m.areas.length === 0 || m.areas.length > 20) p.push('ต้องมีพื้นที่กดได้ 1–20 ส่วน');
  for (const a of m.areas) {
    const b = a.bounds;
    if (b.x < 0 || b.y < 0 || b.x + b.width > width || b.y + b.height > height) p.push(`พื้นที่ "${a.action.label}" อยู่นอกขอบเขตรูป`);
  }
  return p;
}

async function line(path: string, init: RequestInit & { data?: boolean } = {}) {
  const host = init.data ? 'https://api-data.line.me' : 'https://api.line.me';
  const res = await fetch(`${host}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.line.accessToken()}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LINE ${path} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/**
 * Create the menu, upload its image and make it the default for all users.
 * LINE cannot replace an image on an existing menu, so every run creates a new menu (research Q9).
 */
export async function provisionRichMenu(image: { data: Buffer; type: 'image/png' | 'image/jpeg' }) {
  if (!config.line.accessToken()) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN');
  const menu = buildRichMenu();
  const problems = richMenuProblems(menu);
  if (problems.length) throw new Error(problems.join(' · '));
  if (image.data.length > MAX_IMAGE_BYTES) throw new Error('รูป rich menu ใหญ่เกิน 1 MB');
  const json = { 'Content-Type': 'application/json' };
  await line('/v2/bot/richmenu/validate', { method: 'POST', headers: json, body: JSON.stringify(menu) });
  const { richMenuId } = (await line('/v2/bot/richmenu', { method: 'POST', headers: json, body: JSON.stringify(menu) })) as { richMenuId: string };
  await line(`/v2/bot/richmenu/${richMenuId}/content`, { method: 'POST', data: true, headers: { 'Content-Type': image.type }, body: new Uint8Array(image.data) });
  await line(`/v2/bot/user/all/richmenu/${richMenuId}`, { method: 'POST' });
  return { richMenuId };
}
