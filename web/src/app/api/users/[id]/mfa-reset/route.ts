import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { resetMfa } from '@/server/lib/mfa';

/** Admin resets another user's MFA (lost phone); audit-logged (ADR 0006). */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireApiUser(['admin']);
  await resetMfa(u, (await params).id, clientIp(req));
  return { ok: true };
});
