/**
 * Editable bot auto-reply texts (SPEC §5 Message Templates, G6 / #21).
 * Defaults are the approved copy; admins/supervisors can override per tenant.
 * Overrides are cached in memory and loaded at the start of each webhook batch or status change.
 * Single process, single tenant in the MVP (ADR 0001): the cache holds the last loaded tenant.
 */
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/server/db';

export const BOT_TEXTS = {
  welcome: { label: 'ต้อนรับเมื่อเพิ่มเพื่อน', vars: ['name', 'oa'], body: 'สวัสดีครับ{name} ยินดีต้อนรับสู่{oa}' },
  registered: { label: 'หลังลงทะเบียนสำเร็จ', vars: ['name'], body: 'ลงทะเบียนเรียบร้อยแล้วครับ คุณ{name}\nกด "แจ้งปัญหาใหม่" ที่เมนูด้านล่างเพื่อเริ่มแจ้งเรื่องได้เลยครับ' },
  greeting: { label: 'ก่อนเลือกหมวดหมู่', vars: ['name'], body: 'สวัสดีครับ{name} เลือกหัวข้อที่ต้องการแจ้งได้เลยครับ' },
  no_open_cases: { label: 'ไม่มีเคสเปิดอยู่', vars: [], body: 'ตอนนี้ไม่มีเคสที่ยังเปิดอยู่ครับ' },
  idle: { label: 'ข้อความนอกขั้นตอนเมื่อไม่มีเคส', vars: [], body: 'สวัสดีครับ ต้องการแจ้งปัญหาใหม่ หรือดูเคสของคุณครับ' },
  handoff_ack: { label: 'รับเรื่องขอคุยกับเจ้าหน้าที่', vars: ['caseNo'], body: 'ส่งเรื่องถึงเจ้าหน้าที่แล้วครับ เลขเคส {caseNo}\nเจ้าหน้าที่จะตอบกลับในแชทนี้ครับ' },
  pending_request: { label: 'ขอข้อมูลเพิ่มเติม (เมื่อไม่มีข้อความจากเจ้าหน้าที่)', vars: ['caseNo'], body: 'เจ้าหน้าที่ขอข้อมูลเพิ่มเติมสำหรับเคส {caseNo} ครับ พิมพ์หรือส่งรูปตอบในแชทนี้ได้เลยครับ' },
  auto_closed: { label: 'ปิดเคสอัตโนมัติ', vars: ['caseNo'], body: 'เคส {caseNo} ปิดอัตโนมัติแล้วครับ หากยังพบปัญหา แจ้งเคสใหม่ได้ที่เมนู "แจ้งปัญหาใหม่"' },
} as const;

export type BotTextKey = keyof typeof BOT_TEXTS;
export const MAX_BOT_TEXT = 1000;

let cache: { tenantId: string; at: number; map: Partial<Record<BotTextKey, string>> } | null = null;
const TTL_MS = 30_000;

export async function loadBotTexts(tenantId: string) {
  if (cache && cache.tenantId === tenantId && Date.now() - cache.at < TTL_MS) return;
  const rows = await db.select().from(schema.botText).where(eq(schema.botText.tenantId, tenantId));
  cache = { tenantId, at: Date.now(), map: Object.fromEntries(rows.filter((r) => r.key in BOT_TEXTS).map((r) => [r.key, r.body])) };
}

export const invalidateBotTexts = () => { cache = null; };

/** Fill `{var}` placeholders; unknown placeholders are left out. */
export function botText(key: BotTextKey, vars: Record<string, string> = {}): string {
  const body = cache?.map[key] ?? BOT_TEXTS[key].body;
  return body.replace(/\{(\w+)\}/g, (_, v: string) => vars[v] ?? '');
}

/** Placeholders a text uses that its key does not provide. */
export function unknownVars(key: BotTextKey, body: string): string[] {
  const allowed = new Set<string>(BOT_TEXTS[key].vars);
  return [...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((v) => !allowed.has(v));
}

export async function listBotTexts(tenantId: string) {
  const rows = await db.select().from(schema.botText).where(eq(schema.botText.tenantId, tenantId));
  return (Object.keys(BOT_TEXTS) as BotTextKey[]).map((key) => {
    const o = rows.find((r) => r.key === key);
    return { key, label: BOT_TEXTS[key].label, vars: [...BOT_TEXTS[key].vars], defaultBody: BOT_TEXTS[key].body, body: o?.body ?? BOT_TEXTS[key].body, custom: !!o };
  });
}

export async function saveBotText(tenantId: string, key: BotTextKey, body: string | null, userId: string) {
  if (body === null) {
    await db.delete(schema.botText).where(and(eq(schema.botText.tenantId, tenantId), eq(schema.botText.key, key)));
  } else {
    await db.insert(schema.botText).values({ tenantId, key, body, updatedBy: userId })
      .onConflictDoUpdate({ target: [schema.botText.tenantId, schema.botText.key], set: { body, updatedBy: userId, updatedAt: new Date() } });
  }
  invalidateBotTexts();
}
