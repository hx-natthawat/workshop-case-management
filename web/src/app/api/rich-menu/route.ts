import { audit } from '@/server/lib/audit';
import { HttpError, requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { provisionRichMenu } from '@/server/line/rich-menu';
import { GET as renderImage } from './image/route';

/** Admin: create the 4-button rich menu on the real LINE OA and make it the default (G5, #21). */
export const POST = handle(async (req: Request) => {
  const u = await requireApiUser(['admin']);
  const png = Buffer.from(await (await renderImage()).arrayBuffer());
  try {
    const r = await provisionRichMenu({ data: png, type: 'image/png' });
    await audit({ tenantId: u.tenantId, actorId: u.id, action: 'line.rich_menu_set', entity: 'rich_menu', entityId: r.richMenuId, ip: clientIp(req) });
    return r;
  } catch (e) {
    throw new HttpError(502, `ตั้งค่า rich menu ไม่สำเร็จ: ${(e as Error).message}`);
  }
});
