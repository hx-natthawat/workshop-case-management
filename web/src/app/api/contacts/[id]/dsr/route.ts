import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { createDsr, dsrCreate, listDsr } from '@/server/admin/dsr';

type Ctx = { params: Promise<{ id: string }> };

/** PDPA data-subject requests for one contact (supervisor, admin). */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const u = await requireApiUser(['supervisor', 'admin']);
  return { items: await listDsr(u.tenantId, (await params).id) };
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireApiUser(['supervisor', 'admin']);
  return createDsr(u, (await params).id, dsrCreate.parse(await req.json()), clientIp(req));
});
