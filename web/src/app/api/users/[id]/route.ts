import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { updateUser, updateUserInput } from '@/server/admin/users';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireApiUser(['admin']);
  const body = updateUserInput.parse(await req.json());
  return { user: await updateUser(u, (await params).id, body, clientIp(req)) };
});
