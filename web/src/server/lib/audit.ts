import { and, eq, gt } from 'drizzle-orm';
import { db, schema, type DbOrTx } from '@/server/db';

export interface AuditEntry {
  tenantId: string;
  actorId?: string | null;
  actorType?: 'user' | 'contact' | 'system';
  action: string;
  entity: string;
  entityId?: string | null;
  diff?: unknown;
  ip?: string | null;
}

/** Insert-only (invariant 4). */
export async function audit(e: AuditEntry, tx: DbOrTx = db) {
  await tx.insert(schema.auditLog).values({
    tenantId: e.tenantId,
    actorId: e.actorId ?? null,
    actorType: e.actorType ?? 'user',
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    diff: e.diff ?? null,
    ip: e.ip ?? null,
  });
}

/**
 * Audit a view of personal data (SPEC §8), at most once per actor + entity per 30 minutes,
 * so auto-refreshing pages do not flood the log (#14 L3).
 */
export async function auditView(e: { tenantId: string; actorId: string; entity: string; entityId: string; action: string }) {
  const since = new Date(Date.now() - 30 * 60_000);
  const [recent] = await db.select({ id: schema.auditLog.id }).from(schema.auditLog).where(and(
    eq(schema.auditLog.tenantId, e.tenantId), eq(schema.auditLog.actorId, e.actorId), eq(schema.auditLog.action, e.action),
    eq(schema.auditLog.entityId, e.entityId), gt(schema.auditLog.createdAt, since),
  )).limit(1);
  if (!recent) await audit({ tenantId: e.tenantId, actorId: e.actorId, action: e.action, entity: e.entity, entityId: e.entityId });
}
