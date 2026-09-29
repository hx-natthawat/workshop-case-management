import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, schema } from '@/server/db';
import { HttpError } from '@/server/lib/auth';
import { handle } from '@/server/lib/http';
import { putObject } from '@/server/lib/storage';
import { defaultTenant } from '@/server/lib/tenant';
import { dispatch, recordUserAction, requireSimulator, requireSimUserId } from '../sim-lib';

const MAX_IMAGE = 10 * 1024 * 1024;

const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().trim().min(1).max(5000) }),
  z.object({
    type: z.literal('postback'),
    data: z.string().min(1).max(300),
    displayText: z.string().max(300).optional(),
    params: z.object({ datetime: z.string().optional(), date: z.string().optional(), time: z.string().optional() }).optional(),
  }),
  z.object({
    type: z.literal('location'),
    title: z.string().max(100).optional(),
    address: z.string().max(200).optional(),
    latitude: z.number(),
    longitude: z.number(),
  }),
  z.object({ type: z.literal('follow') }),
  z.object({ type: z.literal('unfollow') }),
]);

const bodySchema = z.object({ userId: z.string(), event: eventSchema });

const msgId = () => randomUUID().replace(/-/g, '').slice(0, 18);

export const POST = handle(async (req: Request) => {
  requireSimulator();
  const tenant = await defaultTenant();

  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const form = await req.formData();
    const userId = requireSimUserId(form.get('userId'));
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'กรุณาเลือกไฟล์รูปภาพ');
    if (!file.type.startsWith('image/')) throw new HttpError(400, 'รองรับเฉพาะไฟล์รูปภาพครับ');
    if (file.size > MAX_IMAGE) throw new HttpError(413, 'ไฟล์ใหญ่เกิน 10 MB');
    const obj = await putObject(Buffer.from(await file.arrayBuffer()), file.type);
    const [att] = await db.insert(schema.attachment).values({
      tenantId: tenant.id, storageKey: obj.key, mimeType: file.type, size: obj.size, checksum: obj.checksum,
    }).returning();
    await recordUserAction(tenant.id, userId, { type: 'image', attachmentId: att.id });
    await dispatch(userId, { type: 'message', message: { type: 'image', id: `simatt:${att.id}`, contentProvider: { type: 'line' } } });
    return { ok: true };
  }

  const { userId: rawUserId, event } = bodySchema.parse(await req.json());
  const userId = requireSimUserId(rawUserId);

  switch (event.type) {
    case 'text':
      await recordUserAction(tenant.id, userId, { type: 'text', text: event.text });
      await dispatch(userId, { type: 'message', message: { type: 'text', id: msgId(), text: event.text } });
      break;
    case 'postback': {
      const shown = event.displayText ?? event.params?.datetime ?? event.params?.date ?? event.params?.time;
      if (shown) await recordUserAction(tenant.id, userId, { type: 'postback', displayText: shown, data: event.data });
      await dispatch(userId, { type: 'postback', postback: { data: event.data, ...(event.params ? { params: event.params } : {}) } });
      break;
    }
    case 'location':
      await recordUserAction(tenant.id, userId, { type: 'location', title: event.title ?? 'ตำแหน่งที่ตั้ง', address: event.address });
      await dispatch(userId, {
        type: 'message',
        message: { type: 'location', id: msgId(), title: event.title, address: event.address, latitude: event.latitude, longitude: event.longitude },
      });
      break;
    case 'follow':
    case 'unfollow':
      await recordUserAction(tenant.id, userId, { type: event.type });
      await dispatch(userId, { type: event.type });
      break;
  }
  return { ok: true };
});
