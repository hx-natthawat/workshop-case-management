import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { revealPhone } from '@/server/admin/contacts';

/** Full phone on demand, audit-logged as `contact.phone_revealed` (SPEC §8 PDPA). */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireApiUser();
  return revealPhone(u, (await params).id, clientIp(req));
});
