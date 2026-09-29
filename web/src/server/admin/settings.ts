/** Tenant settings, SLA policy and LINE channel status (admin only). Secrets are never returned. */
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/server/db';
import type { Priority } from '@/server/db/schema';
import { audit } from '@/server/lib/audit';
import { HttpError, type SessionUser } from '@/server/lib/auth';
import { config } from '@/server/lib/config';
import { clearTenantCache } from '@/server/lib/tenant';

export function lineStatus() {
  return {
    channelSecret: !!config.line.channelSecret(),
    accessToken: !!config.line.accessToken(),
    loginChannelId: !!config.line.loginChannelId(),
    liffId: !!config.line.liffId(),
    webhookUrl: `${config.baseUrl()}/api/webhooks/line`,
    simulator: config.simulatorEnabled(),
  };
}

export async function getSettings(tenantId: string) {
  const [t] = await db.select().from(schema.tenant).where(eq(schema.tenant.id, tenantId));
  if (!t) throw new HttpError(404, 'ไม่พบข้อมูลองค์กร');
  const sla = await db.select().from(schema.slaPolicy).where(eq(schema.slaPolicy.tenantId, tenantId)).orderBy(asc(schema.slaPolicy.priority));
  return {
    tenant: { oaName: t.oaName, bizStartMin: t.bizStartMin, bizEndMin: t.bizEndMin, pdpaText: t.pdpaText, pdpaVersion: t.pdpaVersion },
    sla: sla.map((p) => ({ priority: p.priority, responseMinutes: p.responseMinutes, resolveMinutes: p.resolveMinutes, businessHoursOnly: p.businessHoursOnly })),
  };
}

const minutes = z.number().int().min(0).max(24 * 60);
export const settingsPatch = z.object({
  oaName: z.string().trim().min(1).max(80).optional(),
  bizStartMin: minutes.optional(),
  bizEndMin: minutes.optional(),
  pdpaText: z.string().trim().min(1).max(10000).optional(),
  pdpaVersion: z.string().trim().min(1).max(20).optional(),
  sla: z.array(z.object({
    priority: z.enum(['P1', 'P2', 'P3', 'P4']),
    responseMinutes: z.number().int().min(1).max(100_000),
    resolveMinutes: z.number().int().min(1).max(1_000_000),
    businessHoursOnly: z.boolean(),
  })).max(4).optional(),
});

export async function updateSettings(actor: SessionUser, input: z.infer<typeof settingsPatch>, ip: string | null) {
  const tenantId = actor.tenantId;
  const [t] = await db.select().from(schema.tenant).where(eq(schema.tenant.id, tenantId));
  if (!t) throw new HttpError(404, 'ไม่พบข้อมูลองค์กร');

  const start = input.bizStartMin ?? t.bizStartMin;
  const end = input.bizEndMin ?? t.bizEndMin;
  if (end <= start) throw new HttpError(400, 'เวลาสิ้นสุดเวลาทำการต้องหลังเวลาเริ่ม');

  const textChanged = input.pdpaText !== undefined && input.pdpaText !== t.pdpaText;
  const versionChanged = input.pdpaVersion !== undefined && input.pdpaVersion !== t.pdpaVersion;
  if (textChanged && !versionChanged) throw new HttpError(400, 'แก้ไขข้อความ PDPA แล้วต้องเปลี่ยนเลข version ด้วย');

  const tenantDiff: Record<string, { from: unknown; to: unknown }> = {};
  const patch: Partial<typeof schema.tenant.$inferInsert> = {};
  for (const k of ['oaName', 'bizStartMin', 'bizEndMin', 'pdpaText', 'pdpaVersion'] as const) {
    const v = input[k];
    if (v !== undefined && v !== t[k]) {
      (patch as Record<string, unknown>)[k] = v;
      tenantDiff[k] = k === 'pdpaText' ? { from: `${t.pdpaText.length} ตัวอักษร`, to: `${String(v).length} ตัวอักษร` } : { from: t[k], to: v };
    }
  }

  const slaDiff: Record<string, unknown> = {};
  await db.transaction(async (tx) => {
    if (Object.keys(patch).length) {
      await tx.update(schema.tenant).set(patch).where(eq(schema.tenant.id, tenantId));
      await audit({ tenantId, actorId: actor.id, action: 'settings.updated', entity: 'tenant', entityId: tenantId, diff: tenantDiff, ip }, tx);
    }
    for (const p of input.sla ?? []) {
      const [cur] = await tx.select().from(schema.slaPolicy).where(and(eq(schema.slaPolicy.tenantId, tenantId), eq(schema.slaPolicy.priority, p.priority as Priority)));
      if (!cur) throw new HttpError(404, `ไม่พบนโยบาย SLA ${p.priority}`);
      const d: Record<string, { from: unknown; to: unknown }> = {};
      for (const k of ['responseMinutes', 'resolveMinutes', 'businessHoursOnly'] as const) if (p[k] !== cur[k]) d[k] = { from: cur[k], to: p[k] };
      if (!Object.keys(d).length) continue;
      await tx.update(schema.slaPolicy).set({ responseMinutes: p.responseMinutes, resolveMinutes: p.resolveMinutes, businessHoursOnly: p.businessHoursOnly }).where(eq(schema.slaPolicy.id, cur.id));
      slaDiff[p.priority] = d;
    }
    if (Object.keys(slaDiff).length) {
      await audit({ tenantId, actorId: actor.id, action: 'sla_policy.updated', entity: 'sla_policy', entityId: null, diff: slaDiff, ip }, tx);
    }
  });
  clearTenantCache();
  return getSettings(tenantId);
}
