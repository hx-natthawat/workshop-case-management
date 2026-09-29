import { createForm, formCreate, listForms } from '@/server/admin/forms';
import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';

export const GET = handle(async () => {
  const user = await requireApiUser(['admin']);
  return { forms: await listForms(user.tenantId) };
});

export const POST = handle(async (req: Request) => {
  const user = await requireApiUser(['admin']);
  const { name } = formCreate.parse(await req.json());
  return { form: await createForm(user, name, clientIp(req)) };
});
