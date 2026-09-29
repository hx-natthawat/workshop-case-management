import { getFormDetail } from '@/server/admin/forms';
import { requireApiUser } from '@/server/lib/auth';
import { handle } from '@/server/lib/http';

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(['admin']);
  const { id } = await ctx.params;
  return { form: await getFormDetail(user.tenantId, id) };
});
