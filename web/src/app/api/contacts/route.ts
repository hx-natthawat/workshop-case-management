import { requireApiUser } from '@/server/lib/auth';
import { handle } from '@/server/lib/http';
import { listContacts } from '@/server/admin/contacts';

export const GET = handle(async (req: Request) => {
  const u = await requireApiUser();
  const sp = new URL(req.url).searchParams;
  return listContacts(u.tenantId, { q: sp.get('q') ?? undefined, page: Number(sp.get('page')) || 1 });
});
