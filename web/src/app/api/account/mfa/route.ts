import { requireApiUser } from '@/server/lib/auth';
import { handle } from '@/server/lib/http';
import { startEnrolment } from '@/server/lib/mfa';

/** Start (or restart) MFA enrolment: returns the QR code and the secret for manual entry. */
export const POST = handle(async () => {
  const u = await requireApiUser(undefined, { allowWithoutMfa: true });
  return startEnrolment(u);
});
