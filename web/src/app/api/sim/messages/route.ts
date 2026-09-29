import { and, asc, eq, gt } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import { handle } from '@/server/lib/http';
import { signedFileUrl } from '@/server/lib/storage';
import { defaultTenant } from '@/server/lib/tenant';
import { requireSimulator, requireSimUserId } from '../sim-lib';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await requireSimulator();
  const url = new URL(req.url);
  const userId = requireSimUserId(url.searchParams.get('userId'));
  const after = Number(url.searchParams.get('after') ?? 0) || 0;
  const tenant = await defaultTenant();
  const rows = await db
    .select()
    .from(schema.simMessage)
    .where(and(eq(schema.simMessage.tenantId, tenant.id), eq(schema.simMessage.lineUserId, userId), gt(schema.simMessage.id, after)))
    .orderBy(asc(schema.simMessage.id))
    .limit(200);
  return {
    messages: rows.map((r) => {
      const p = r.payload as Record<string, unknown>;
      const media = ['image', 'video', 'audio', 'file'].includes(p?.type as string) && typeof p.attachmentId === 'string';
      const payload = media ? { ...p, url: signedFileUrl(p.attachmentId as string) } : p;
      return { id: r.id, direction: r.direction, payload, createdAt: r.createdAt };
    }),
  };
});
