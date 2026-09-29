import { z } from 'zod';
import { HttpError } from '@/server/lib/auth';

/** Reject malformed ids as 404 instead of letting Postgres raise a uuid cast error (500). */
export function assertUuid(id: string, notFound: string) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, notFound);
}
