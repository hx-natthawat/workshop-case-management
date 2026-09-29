import { z } from 'zod';
import * as caseSvc from '@/server/case/service';
import { requireApiUser } from '@/server/lib/auth';
import { handle } from '@/server/lib/http';
import { caseDetail } from '@/server/queries/cases';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const u = await requireApiUser();
  return caseDetail(u, (await params).id);
});

const patch = z.object({
  status: z.enum(['new', 'assigned', 'in_progress', 'pending_customer', 'resolved', 'closed', 'reopened', 'cancelled']).optional(),
  priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
  reason: z.string().trim().max(500).optional(),
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireApiUser();
  const { id } = await params;
  const body = patch.parse(await req.json());
  const actor = { type: 'user' as const, user: u };
  if (body.priority) await caseSvc.changePriority(u.tenantId, id, body.priority, body.reason ?? '', actor);
  if (body.status) await caseSvc.transition(u.tenantId, id, body.status, actor, { reason: body.reason });
  return { ok: true };
});
