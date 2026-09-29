import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { updateTeam, updateTeamInput } from '@/server/admin/users';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireApiUser(['admin']);
  const body = updateTeamInput.parse(await req.json());
  return { team: await updateTeam(u, (await params).id, body, clientIp(req)) };
});
