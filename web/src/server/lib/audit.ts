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
