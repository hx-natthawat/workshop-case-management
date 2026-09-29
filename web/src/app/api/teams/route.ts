import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { createTeam, createTeamInput, listTeams } from '@/server/admin/users';

export const GET = handle(async () => {
  const u = await requireApiUser(['admin']);
  return { teams: await listTeams(u.tenantId) };
});

export const POST = handle(async (req: Request) => {
  const u = await requireApiUser(['admin']);
  const body = createTeamInput.parse(await req.json());
  return { team: await createTeam(u, body, clientIp(req)) };
});
