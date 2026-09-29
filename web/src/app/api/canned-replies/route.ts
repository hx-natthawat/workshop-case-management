import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { cannedInput, createCanned, listCanned } from '@/server/admin/canned';

export const GET = handle(async () => {
  const u = await requireApiUser();
  return { items: await listCanned(u.tenantId) };
});

export const POST = handle(async (req: Request) => {
  const u = await requireApiUser(['supervisor', 'admin']);
  const body = cannedInput.parse(await req.json());
  return { item: await createCanned(u, body, clientIp(req)) };
});
