import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { exportContact } from '@/server/admin/dsr';

/** Download everything held about a contact as JSON (PDPA s.30–31). Audit-logged as `contact.exported`. */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireApiUser(['supervisor', 'admin']);
  const id = (await params).id;
  const data = await exportContact(u, id, clientIp(req));
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="contact-${id}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});
