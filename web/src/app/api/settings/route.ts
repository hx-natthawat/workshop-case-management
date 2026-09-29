import { requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { getSettings, lineStatus, settingsPatch, updateSettings } from '@/server/admin/settings';

export const GET = handle(async () => {
  const u = await requireApiUser(['admin']);
  return { ...(await getSettings(u.tenantId)), line: lineStatus() };
});

export const PATCH = handle(async (req: Request) => {
  const u = await requireApiUser(['admin']);
  const body = settingsPatch.parse(await req.json());
  return updateSettings(u, body, clientIp(req));
});
