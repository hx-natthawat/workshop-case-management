import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { dsrUpdate, updateDsr } from '@/server/admin/dsr';

/** Mark a data-subject request completed / rejected / open again (supervisor, admin). */
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) => {
  const u = await requireApiUser(['supervisor', 'admin']);
  const { id, requestId } = await params;
  return updateDsr(u, id, requestId, dsrUpdate.parse(await req.json()), clientIp(req));
});
