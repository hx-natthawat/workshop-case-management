import { categoryCreate, createCategory, listCategories } from '@/server/admin/forms';
import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';

export const GET = handle(async () => {
  const user = await requireApiUser(['admin']);
  return { categories: await listCategories(user.tenantId) };
});

export const POST = handle(async (req: Request) => {
  const user = await requireApiUser(['admin']);
  const input = categoryCreate.parse(await req.json());
  return { category: await createCategory(user, input, clientIp(req)) };
});
