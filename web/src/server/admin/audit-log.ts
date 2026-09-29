/** Audit log read model (analysis D4). Admin only, read-only: audit_log is insert-only. */
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/server/db';

export const AUDIT_PAGE_SIZE = 50;

export interface AuditRow {
  id: string;
  createdAt: Date;
  actorType: 'user' | 'contact' | 'system';
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  diff: unknown;
  ip: string | null;
}

export async function listAudit(tenantId: string, f: { action?: string; entity?: string; page?: number }) {
  const page = Math.max(1, f.page ?? 1);
  const where = and(
    eq(schema.auditLog.tenantId, tenantId),
    f.action ? eq(schema.auditLog.action, f.action) : undefined,
    f.entity ? eq(schema.auditLog.entity, f.entity) : undefined,
  );
  const [{ n }] = await db.select({ n: count() }).from(schema.auditLog).where(where);
  const rows = await db
    .select({ a: schema.auditLog, userName: schema.user.name })
    .from(schema.auditLog)
    .leftJoin(schema.user, and(eq(schema.user.id, schema.auditLog.actorId), eq(schema.user.tenantId, schema.auditLog.tenantId)))
    .where(where)
    .orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset((page - 1) * AUDIT_PAGE_SIZE);
  const items: AuditRow[] = rows.map(({ a, userName }) => ({
    id: a.id,
    createdAt: a.createdAt,
    actorType: a.actorType,
    actorName: a.actorType === 'contact' ? 'ผู้แจ้ง' : a.actorType === 'system' ? 'ระบบ' : (userName ?? 'ผู้ใช้ที่ไม่พบ'),
    action: a.action,
    entity: a.entity,
    entityId: a.entityId,
    diff: a.diff,
    ip: a.ip,
  }));
  return { items, total: n, page, pageSize: AUDIT_PAGE_SIZE };
}

/** Distinct values for the filter selects. */
export async function auditFacets(tenantId: string) {
  const w = eq(schema.auditLog.tenantId, tenantId);
  const actions = await db.selectDistinct({ v: schema.auditLog.action }).from(schema.auditLog).where(w).orderBy(asc(schema.auditLog.action));
  const entities = await db.selectDistinct({ v: schema.auditLog.entity }).from(schema.auditLog).where(w).orderBy(asc(schema.auditLog.entity));
  return { actions: actions.map((r) => r.v), entities: entities.map((r) => r.v) };
}
