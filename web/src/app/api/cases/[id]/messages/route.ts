import { z } from 'zod';
import * as caseSvc from '@/server/case/service';
import { requireApiUser } from '@/server/lib/auth';
import { handle } from '@/server/lib/http';

const body = z.object({
  mode: z.enum(['line', 'internal']),
  text: z.string().trim().min(1).max(4000),
  afterStatus: z.enum(['in_progress', 'pending_customer', 'resolved']).nullish(),
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireApiUser();
  const input = body.parse(await req.json());
  const msg = await caseSvc.postAgentMessage(u.tenantId, (await params).id, { type: 'user', user: u }, input);
  return { ok: true, id: msg.id };
});
