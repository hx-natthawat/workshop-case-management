import { discardDraft, draftInput, saveDraft } from '@/server/admin/forms';
import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';

type Ctx = { params: Promise<{ id: string }> };

/** Replace the draft's full question list (creates the draft as version max+1 when none exists). */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser(['admin']);
  const { id } = await ctx.params;
  const input = draftInput.parse(await req.json());
  return { form: await saveDraft(user, id, input, clientIp(req)) };
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireApiUser(['admin']);
  const { id } = await ctx.params;
  return { form: await discardDraft(user, id, clientIp(req)) };
});
