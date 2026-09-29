/**
 * SLA sweep (SPEC §4 rules), run every 60 s from instrumentation.ts (ADR 0001).
 * - 80 % of a clock → warn assignee + supervisors (once)
 * - 100 % → escalate to supervisors (once), case_event `sla_breached`
 * - resolved and no answer for 3 days → closed
 * - pending_customer for 5 business days → one reminder; 2 more business days → closed
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import type { CaseStatus } from '@/server/db/schema';
import { text } from '@/server/bot/messages';
import { purgeExpiredSessions } from '@/server/bot/session-store';
import { addBusinessMinutes } from '@/server/case/business-time';
import * as caseSvc from '@/server/case/service';
import { remainingMinutes } from '@/server/case/sla';

const CLOCK_RUNNING: CaseStatus[] = ['new', 'assigned', 'in_progress', 'reopened'];
export const AUTO_CLOSE_RESOLVED_DAYS = 3;
export const PENDING_REMIND_BUSINESS_DAYS = 5;
export const PENDING_CLOSE_BUSINESS_DAYS = 2;

export async function slaSweep(now = new Date()) {
  const tenants = await db.select().from(schema.tenant);
  const stats = { warned: 0, breached: 0, autoClosed: 0, reminded: 0 };

  for (const tenant of tenants) {
    const hours = { startMin: tenant.bizStartMin, endMin: tenant.bizEndMin };
    const pol = await caseSvc.policies(tenant.id);
    const businessDay = (hours.endMin - hours.startMin);

    // Clocks: warn and breach
    const running = await db.select().from(schema.kase).where(and(eq(schema.kase.tenantId, tenant.id), inArray(schema.kase.status, CLOCK_RUNNING)));
    for (const c of running) {
      const p = pol[c.priority];
      const checks: { kind: 'response' | 'resolve'; due: Date | null; total: number; warned: boolean; breached: boolean }[] = [];
      if (!c.firstResponseAt) checks.push({ kind: 'response', due: c.slaResponseDue, total: p.responseMinutes, warned: c.slaWarnedResponse, breached: c.slaBreachedResponse });
      checks.push({ kind: 'resolve', due: c.slaResolveDue, total: p.resolveMinutes, warned: c.slaWarnedResolve, breached: c.slaBreachedResolve });

      for (const k of checks) {
        if (!k.due) continue;
        const left = remainingMinutes(now, k.due, p, hours);
        const pct = (k.total - left) / k.total;
        const label = k.kind === 'response' ? 'ตอบรับ' : 'แก้ไข';
        const sups = await caseSvc.supervisorsOf(tenant.id, c.teamId);
        if (left < 0 && !k.breached) {
          await db.update(schema.kase).set(k.kind === 'response' ? { slaBreachedResponse: true, slaWarnedResponse: true } : { slaBreachedResolve: true, slaWarnedResolve: true }).where(eq(schema.kase.id, c.id));
          await db.insert(schema.caseEvent).values({ tenantId: tenant.id, caseId: c.id, eventType: 'sla_breached', toValue: k.kind, actorType: 'system', note: `เกิน SLA ${label}`, createdAt: now });
          await caseSvc.notify(tenant.id, [...sups, c.assigneeId], 'sla_breached', c.id, `${c.caseNo} เกิน SLA ${label}แล้ว`);
          stats.breached++;
        } else if (pct >= 0.8 && left >= 0 && !k.warned) {
          await db.update(schema.kase).set(k.kind === 'response' ? { slaWarnedResponse: true } : { slaWarnedResolve: true }).where(eq(schema.kase.id, c.id));
          await caseSvc.notify(tenant.id, [c.assigneeId, ...sups], 'sla_warning', c.id, `${c.caseNo} ใช้เวลา SLA ${label}ไปแล้ว 80%`);
          stats.warned++;
        }
      }
    }

    // Resolved and silent for 3 days → closed
    const resolved = await db.select().from(schema.kase).where(and(eq(schema.kase.tenantId, tenant.id), eq(schema.kase.status, 'resolved')));
    for (const c of resolved) {
      if (c.resolvedAt && now.getTime() - c.resolvedAt.getTime() >= AUTO_CLOSE_RESOLVED_DAYS * 86_400_000) {
        await caseSvc.transition(tenant.id, c.id, 'closed', { type: 'system' }, { now, reason: `ผู้แจ้งไม่ตอบภายใน ${AUTO_CLOSE_RESOLVED_DAYS} วัน` });
        stats.autoClosed++;
      }
    }

    // Pending customer: remind, then close
    const pending = await db.select().from(schema.kase).where(and(eq(schema.kase.tenantId, tenant.id), eq(schema.kase.status, 'pending_customer')));
    for (const c of pending) {
      if (!c.pendingSince) continue;
      if (!c.pendingRemindedAt) {
        const remindAt = addBusinessMinutes(c.pendingSince, PENDING_REMIND_BUSINESS_DAYS * businessDay, hours, true);
        if (now >= remindAt) {
          await db.update(schema.kase).set({ pendingRemindedAt: now }).where(eq(schema.kase.id, c.id));
          await caseSvc.sendToReporter(tenant.id, c, [text(`เจ้าหน้าที่ยังรอข้อมูลเพิ่มเติมสำหรับเคส ${c.caseNo} ครับ หากไม่ได้รับข้อมูลภายใน ${PENDING_CLOSE_BUSINESS_DAYS} วันทำการ ระบบจะปิดเคสอัตโนมัติครับ`)]);
          await db.insert(schema.caseEvent).values({ tenantId: tenant.id, caseId: c.id, eventType: 'pending_reminder', actorType: 'system', createdAt: now });
          stats.reminded++;
        }
      } else {
        const closeAt = addBusinessMinutes(c.pendingRemindedAt, PENDING_CLOSE_BUSINESS_DAYS * businessDay, hours, true);
        if (now >= closeAt) {
          await caseSvc.transition(tenant.id, c.id, 'closed', { type: 'system' }, { now, reason: 'ไม่ได้รับข้อมูลจากผู้แจ้งตามกำหนด' });
          stats.autoClosed++;
        }
      }
    }
  }
  await purgeExpiredSessions(now);
  return stats;
}

let started = false;
export function startSlaWorker() {
  if (started) return;
  started = true;
  const tick = () => slaSweep().catch((e) => console.error('[sla-worker]', e));
  setTimeout(tick, 5_000);
  setInterval(tick, 60_000);
  console.log('[sla-worker] started (every 60 s)');
}
