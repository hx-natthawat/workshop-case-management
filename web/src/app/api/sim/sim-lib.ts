/** Shared helpers for the LINE simulator API (user testing only, ADR 0005). */
import { randomUUID } from 'node:crypto';
import { handleEvents } from '@/server/bot/handler';
import type { LineEvent } from '@/server/bot/line-types';
import { db, schema } from '@/server/db';
import { HttpError } from '@/server/lib/auth';
import { config, isSimUser } from '@/server/lib/config';
import { defaultTenant } from '@/server/lib/tenant';
import { hasSimulatorAccess } from '@/server/lib/sim-access';

export async function requireSimulator() {
  if (!config.simulatorEnabled()) throw new HttpError(404, 'Not found');
  if (!(await hasSimulatorAccess())) throw new HttpError(401, 'กรุณาเข้าสู่ระบบหรือใส่รหัสผู้ทดสอบก่อนใช้ Simulator');
}

export function requireSimUserId(userId: unknown): string {
  if (typeof userId !== 'string' || !isSimUser(userId) || userId.length > 64) {
    throw new HttpError(400, 'userId ต้องขึ้นต้นด้วย Usim');
  }
  return userId;
}

export async function recordUserAction(tenantId: string, lineUserId: string, payload: Record<string, unknown>) {
  await db.insert(schema.simMessage).values({ tenantId, lineUserId, direction: 'user', payload });
}

/** Build a LINE-shaped webhook event and run it through the bot synchronously. */
export async function dispatch(userId: string, partial: Pick<LineEvent, 'type'> & Partial<LineEvent>) {
  const tenant = await defaultTenant();
  const ev: LineEvent = {
    webhookEventId: `sim-${randomUUID()}`,
    timestamp: Date.now(),
    replyToken: 'sim',
    mode: 'active',
    deliveryContext: { isRedelivery: false },
    source: { type: 'user', userId },
    ...partial,
  };
  await handleEvents(tenant, [ev]);
  return tenant;
}
