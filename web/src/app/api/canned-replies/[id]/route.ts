import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { cannedPatch, deleteCanned, updateCanned } from '@/server/admin/canned';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireApiUser(['supervisor', 'admin']);
  const body = cannedPatch.parse(await req.json());
  return { item: await updateCanned(u, (await params).id, body, clientIp(req)) };
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireApiUser(['supervisor', 'admin']);
  await deleteCanned(u, (await params).id, clientIp(req));
  return { ok: true };
});
