import { asc } from 'drizzle-orm';
import { db, schema } from '@/server/db';

let cached: typeof schema.tenant.$inferSelect | null = null;

/** Single-tenant MVP: the first tenant row. Every query still filters by tenant_id (SPEC §6). */
export async function defaultTenant() {
  if (cached) return cached;
  const [t] = await db.select().from(schema.tenant).orderBy(asc(schema.tenant.createdAt)).limit(1);
  if (!t) throw new Error('No tenant. Run `pnpm db:reset`.');
  cached = t;
  return t;
}

export function clearTenantCache() {
  cached = null;
}
