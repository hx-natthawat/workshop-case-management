import { requireApiUser } from '@/server/lib/auth';
import { handle } from '@/server/lib/http';
import { listCases, type InboxTab } from '@/server/queries/cases';

export const GET = handle(async (req: Request) => {
  const u = await requireApiUser();
  const p = new URL(req.url).searchParams;
  const r = await listCases(u, {
    tab: (p.get('tab') as InboxTab) ?? undefined, status: p.get('status') ?? undefined, priority: p.get('priority') ?? undefined,
    categoryId: p.get('categoryId') ?? undefined, assigneeId: p.get('assigneeId') ?? undefined, sla: p.get('sla') ?? undefined,
    q: p.get('q') ?? undefined, sort: p.get('sort') ?? undefined, page: Number(p.get('page') ?? 1),
  });
  return { total: r.total, page: r.page, pageSize: r.pageSize, items: r.items };
});
