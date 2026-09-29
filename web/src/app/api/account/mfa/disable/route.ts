import { z } from 'zod';
import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { disableOwnMfa } from '@/server/lib/mfa';

export const POST = handle(async (req: Request) => {
  const u = await requireApiUser();
  const { code } = z.object({ code: z.string().trim().min(6).max(20) }).parse(await req.json());
  await disableOwnMfa(u, code, clientIp(req));
  return { ok: true };
});
