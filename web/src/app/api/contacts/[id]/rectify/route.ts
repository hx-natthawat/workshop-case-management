import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { rectifyContact, rectifyInput } from '@/server/admin/dsr';

/** Correct a contact's name, phone, customer ref or org unit (PDPA s.35–36). */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireApiUser(['supervisor', 'admin']);
  return rectifyContact(u, (await params).id, rectifyInput.parse(await req.json()), clientIp(req));
});
