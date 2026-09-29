/**
 * PDPA retention (#19, SPEC §8, PDPA s.37(3)): per tenant with `retention_days` set, anonymise
 * closed and cancelled cases whose close date is older than that. The contact is anonymised too
 * once none of their cases remain in retention (all anonymised, none open). Called from the SLA sweep.
 */
import { and, eq, inArray, isNotNull, isNull, lt, notExists, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, schema } from '@/server/db';
import { anonymise } from '@/server/admin/anonymise';
import { deleteObject } from '@/server/lib/storage';

/** Cases handled per tenant per tick, so one sweep never holds the worker for long. */
const BATCH = 200;
const DAY = 86_400_000;

export async function retentionSweep(now = new Date()) {
  const stats = { cases: 0, contacts: 0, files: 0 };
  const tenants = await db.select({ id: schema.tenant.id, days: schema.tenant.retentionDays })
    .from(schema.tenant).where(isNotNull(schema.tenant.retentionDays));

  for (const t of tenants) {
    if (!t.days || t.days < 1) continue;
    const cutoff = new Date(now.getTime() - t.days * DAY);
    const expired = await db.select({ id: schema.kase.id, contactId: schema.kase.contactId }).from(schema.kase).where(and(
      eq(schema.kase.tenantId, t.id),
      inArray(schema.kase.status, ['closed', 'cancelled']),
      isNull(schema.kase.anonymisedAt),
      or(lt(schema.kase.closedAt, cutoff), and(isNull(schema.kase.closedAt), lt(schema.kase.updatedAt, cutoff))),
    )).limit(BATCH);

    const byContact = new Map<string, string[]>();
    for (const c of expired) byContact.set(c.contactId, [...(byContact.get(c.contactId) ?? []), c.id]);

    for (const [contactId, caseIds] of byContact) {
      // Other cases of this contact still holding data (open, or closed but not yet expired)?
      const rest = await db.select({ id: schema.kase.id }).from(schema.kase).where(and(
        eq(schema.kase.tenantId, t.id), eq(schema.kase.contactId, contactId), isNull(schema.kase.anonymisedAt),
      ));
      const remaining = rest.filter((r) => !caseIds.includes(r.id)).length;
      const r = await anonymise({ tenantId: t.id, caseIds, contactId: remaining === 0 ? contactId : null, actor: { type: 'system' }, reason: 'retention', now });
      stats.cases += r.cases;
      stats.files += r.files;
      if (r.contact) stats.contacts++;
    }

    // Contacts whose last cases were anonymised earlier while another case was still open.
    const live = alias(schema.kase, 'live');
    const leftovers = await db.selectDistinct({ id: schema.contact.id }).from(schema.contact)
      .innerJoin(schema.kase, and(eq(schema.kase.contactId, schema.contact.id), eq(schema.kase.tenantId, t.id)))
      .where(and(
        eq(schema.contact.tenantId, t.id), isNull(schema.contact.anonymisedAt), isNotNull(schema.kase.anonymisedAt),
        notExists(db.select({ id: live.id }).from(live).where(and(eq(live.tenantId, t.id), eq(live.contactId, schema.contact.id), isNull(live.anonymisedAt)))),
      ))
      .limit(BATCH);
    for (const c of leftovers) {
      const r = await anonymise({ tenantId: t.id, caseIds: [], contactId: c.id, actor: { type: 'system' }, reason: 'retention', now });
      if (r.contact) stats.contacts++;
    }

    // Contacts that never had a case and registered/followed before the cutoff (#22 finding 5)
    const caseless = await db.select({ id: schema.contact.id }).from(schema.contact).where(and(
      eq(schema.contact.tenantId, t.id), isNull(schema.contact.anonymisedAt), lt(schema.contact.createdAt, cutoff),
      notExists(db.select({ id: schema.kase.id }).from(schema.kase).where(and(eq(schema.kase.tenantId, t.id), eq(schema.kase.contactId, schema.contact.id)))),
    )).limit(BATCH);
    for (const c of caseless) {
      const r = await anonymise({ tenantId: t.id, caseIds: [], contactId: c.id, actor: { type: 'system' }, reason: 'retention', now });
      if (r.contact) stats.contacts++;
    }
  }
  stats.files += await sweepOrphanAttachments(now);
  return stats;
}

/**
 * Uploads that never became part of a case (abandoned drafts expire after 30 min) are deleted after
 * a day, whatever the tenant's retention setting (#22 finding 2).
 */
export async function sweepOrphanAttachments(now = new Date()) {
  const cutoff = new Date(now.getTime() - DAY);
  const orphans = await db.select({ id: schema.attachment.id, key: schema.attachment.storageKey }).from(schema.attachment)
    .where(and(isNull(schema.attachment.caseId), isNull(schema.attachment.messageId), lt(schema.attachment.createdAt, cutoff))).limit(BATCH);
  const stillReferenced = new Set<string>();
  if (orphans.length) {
    // Form answers reference uploads by id only; keep any that a case answer still points to.
    const answers = await db.select({ value: schema.caseAnswer.value }).from(schema.caseAnswer);
    for (const a of answers) if ('attachmentIds' in a.value && Array.isArray(a.value.attachmentIds)) a.value.attachmentIds.forEach((i) => stillReferenced.add(i));
  }
  let n = 0;
  for (const o of orphans.filter((x) => !stillReferenced.has(x.id))) {
    await db.delete(schema.attachment).where(eq(schema.attachment.id, o.id));
    await deleteObject(o.key).catch((e) => console.error('[retention] orphan file', o.key, e));
    n++;
  }
  return n;
}
