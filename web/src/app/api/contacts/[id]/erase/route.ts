import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { eraseContact } from '@/server/admin/dsr';

/** Erase = anonymise the contact and their cases (PDPA s.33). Refused while a case is open. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireApiUser(['supervisor', 'admin']);
  return eraseContact(u, (await params).id, clientIp(req));
});
