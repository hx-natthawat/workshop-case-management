import { publishDraft } from '@/server/admin/forms';
import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(['admin']);
  const { id } = await ctx.params;
  return { form: await publishDraft(user, id, clientIp(req)) };
});
