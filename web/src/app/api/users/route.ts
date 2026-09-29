import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { createUser, createUserInput, listTeams, listUsers } from '@/server/admin/users';

export const GET = handle(async () => {
  const u = await requireApiUser(['admin']);
  return { users: await listUsers(u.tenantId), teams: await listTeams(u.tenantId) };
});

export const POST = handle(async (req: Request) => {
  const u = await requireApiUser(['admin']);
  const body = createUserInput.parse(await req.json());
  return { user: await createUser(u, body, clientIp(req)) };
});
