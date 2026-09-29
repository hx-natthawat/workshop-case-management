import { z } from 'zod';
import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { setRestricted } from '@/server/admin/dsr';

/** Restrict processing (PDPA s.34) or lift the restriction. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireApiUser(['supervisor', 'admin']);
  const { restricted } = z.object({ restricted: z.boolean() }).parse(await req.json());
  return setRestricted(u, (await params).id, restricted, clientIp(req));
});
