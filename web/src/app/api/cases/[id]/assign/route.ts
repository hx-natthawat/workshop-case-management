import { z } from 'zod';
import * as caseSvc from '@/server/case/service';
import { requireApiUser } from '@/server/lib/auth';
import { handle } from '@/server/lib/http';

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireApiUser();
  const { assigneeId } = z.object({ assigneeId: z.string().uuid() }).parse(await req.json());
  await caseSvc.assign(u.tenantId, (await params).id, assigneeId, { type: 'user', user: u });
  return { ok: true };
});
