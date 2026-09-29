import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { contactDetail, contactPatch, setContactStatus } from '@/server/admin/contacts';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const u = await requireApiUser();
  return contactDetail(u, (await params).id);
});

/** Block / unblock a reporter (supervisor, admin). */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireApiUser(['supervisor', 'admin']);
  const { status } = contactPatch.parse(await req.json());
  return setContactStatus(u, (await params).id, status, clientIp(req));
});
