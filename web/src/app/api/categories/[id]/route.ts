import { categoryPatch, updateCategory } from '@/server/admin/forms';
import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(['admin']);
  const { id } = await ctx.params;
  const patch = categoryPatch.parse(await req.json());
  return { category: await updateCategory(user, id, patch, clientIp(req)) };
});
