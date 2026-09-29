import { z } from 'zod';
import { BOT_TEXTS, listBotTexts, MAX_BOT_TEXT, saveBotText, unknownVars, type BotTextKey } from '@/server/bot/bot-texts';
import { audit } from '@/server/lib/audit';
import { HttpError, requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';

export const GET = handle(async () => {
  const u = await requireApiUser(['supervisor', 'admin']);
  return { items: await listBotTexts(u.tenantId) };
});

/** Save an override, or reset to the default with `body: null`. Audit-logged. */
export const PUT = handle(async (req: Request) => {
  const u = await requireApiUser(['supervisor', 'admin']);
  const input = z.object({
    key: z.enum(Object.keys(BOT_TEXTS) as [BotTextKey, ...BotTextKey[]]),
    body: z.string().trim().min(1, 'กรุณาพิมพ์ข้อความ').max(MAX_BOT_TEXT).nullable(),
  }).parse(await req.json());
  if (input.body !== null) {
    const bad = unknownVars(input.key, input.body);
    if (bad.length) throw new HttpError(400, `ใช้ตัวแปรนี้ไม่ได้: ${bad.map((v) => `{${v}}`).join(' ')}`);
  }
  await saveBotText(u.tenantId, input.key, input.body, u.id);
  await audit({ tenantId: u.tenantId, actorId: u.id, action: input.body === null ? 'bot_text.reset' : 'bot_text.updated', entity: 'bot_text', entityId: input.key, diff: { body: input.body }, ip: clientIp(req) });
  return { ok: true };
});
