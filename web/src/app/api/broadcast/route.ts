import { z } from 'zod';
import { broadcastHistory, MAX_BROADCAST_CHARS, previewBroadcast, sendBroadcast } from '@/server/case/broadcast';
import { HttpError, requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';

export const GET = handle(async () => {
  const u = await requireApiUser(['supervisor', 'admin']);
  return { preview: await previewBroadcast(u), history: await broadcastHistory(u.tenantId) };
});

/** Two-step: without `confirm` it only returns the recipient count; with `confirm: true` it sends. */
export const POST = handle(async (req: Request) => {
  const u = await requireApiUser(['supervisor', 'admin']);
  const body = z.object({ text: z.string().max(MAX_BROADCAST_CHARS), confirm: z.boolean().optional() }).parse(await req.json());
  if (!body.confirm) return { preview: await previewBroadcast(u) };
  // D-022: a broadcast reaches every reporter, so the sender needs a second factor
  if (!u.mfaEnabled) throw new HttpError(403, 'ต้องเปิดใช้ MFA ก่อนส่งประกาศ (เมนูชื่อผู้ใช้ › ความปลอดภัยของบัญชี)');
  return sendBroadcast(u, body.text, clientIp(req));
});
