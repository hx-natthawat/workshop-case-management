/**
 * PDPA anonymisation (#19, SPEC §8, PDPA s.33 / s.37(3)). The single function used by both
 * a data-subject erase request and the retention sweep.
 *
 * - case answers and message text are replaced, attachments are deleted (rows and files)
 * - case title becomes the category name; case metadata (status, priority, SLA, dates, CSAT) stays for reports
 * - staff-typed event notes are cleared (they can quote the reporter)
 * - the contact, when given, loses name, phone, refs and LINE user id and is blocked; bot session and simulator log are deleted
 * - audit rows are written in the same transaction; files are removed after commit
 */
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import { audit } from '@/server/lib/audit';
import { deleteObject } from '@/server/lib/storage';

export const ERASED_TEXT = '[ข้อมูลถูกลบตาม PDPA]';

export type AnonymiseActor = { type: 'user'; id: string; ip?: string | null } | { type: 'system' };

export interface AnonymiseInput {
  tenantId: string;
  caseIds: string[];
  /** Also anonymise this contact (erase, or retention when none of their cases remain). */
  contactId?: string | null;
  actor: AnonymiseActor;
  reason: 'dsr_erase' | 'retention';
  now?: Date;
}

export async function anonymise(input: AnonymiseInput) {
  const { tenantId, actor, reason } = input;
  const now = input.now ?? new Date();
  const who = actor.type === 'user'
    ? { actorId: actor.id, actorType: 'user' as const, ip: actor.ip ?? null }
    : { actorId: null, actorType: 'system' as const, ip: null };

  const result = await db.transaction(async (tx) => {
    const cases = input.caseIds.length
      ? await tx.select({ id: schema.kase.id, caseNo: schema.kase.caseNo, categoryName: schema.category.name })
          .from(schema.kase)
          .leftJoin(schema.category, eq(schema.category.id, schema.kase.categoryId))
          .where(and(eq(schema.kase.tenantId, tenantId), inArray(schema.kase.id, input.caseIds), isNull(schema.kase.anonymisedAt)))
      : [];
    const ids = cases.map((c) => c.id);
    let keys: string[] = [];

    if (ids.length) {
      const msgIds = (await tx.select({ id: schema.caseMessage.id }).from(schema.caseMessage)
        .where(and(eq(schema.caseMessage.tenantId, tenantId), inArray(schema.caseMessage.caseId, ids)))).map((m) => m.id);
      // Form uploads can be linked only through the answer value, so collect those ids too.
      const answerFileIds = (await tx.select({ value: schema.caseAnswer.value }).from(schema.caseAnswer)
        .where(and(eq(schema.caseAnswer.tenantId, tenantId), inArray(schema.caseAnswer.caseId, ids))))
        .flatMap((a) => ('attachmentIds' in a.value && Array.isArray(a.value.attachmentIds) ? a.value.attachmentIds : []));
      const files = await tx.select({ id: schema.attachment.id, key: schema.attachment.storageKey }).from(schema.attachment).where(and(
        eq(schema.attachment.tenantId, tenantId),
        or(
          inArray(schema.attachment.caseId, ids),
          msgIds.length ? inArray(schema.attachment.messageId, msgIds) : undefined,
          answerFileIds.length ? inArray(schema.attachment.id, answerFileIds) : undefined,
        ),
      ));
      keys = files.map((f) => f.key);

      await tx.update(schema.caseAnswer).set({ value: { kind: 'text', text: ERASED_TEXT } })
        .where(and(eq(schema.caseAnswer.tenantId, tenantId), inArray(schema.caseAnswer.caseId, ids)));
      await tx.update(schema.caseMessage).set({ content: { type: 'text', text: ERASED_TEXT }, deliveryError: null })
        .where(and(eq(schema.caseMessage.tenantId, tenantId), inArray(schema.caseMessage.caseId, ids)));
      if (files.length) {
        await tx.delete(schema.attachment).where(and(eq(schema.attachment.tenantId, tenantId), inArray(schema.attachment.id, files.map((f) => f.id))));
      }
      await tx.update(schema.caseEvent).set({ note: null })
        .where(and(eq(schema.caseEvent.tenantId, tenantId), inArray(schema.caseEvent.caseId, ids), eq(schema.caseEvent.actorType, 'user')));
      for (const c of cases) {
        await tx.update(schema.kase).set({ title: c.categoryName ?? c.caseNo, anonymisedAt: now })
          .where(and(eq(schema.kase.tenantId, tenantId), eq(schema.kase.id, c.id)));
        await audit({ tenantId, ...who, action: 'case.anonymised', entity: 'case', entityId: c.id, diff: { reason, caseNo: c.caseNo } }, tx);
      }
    }

    let contactDone = false;
    if (input.contactId) {
      const [c] = await tx.select().from(schema.contact)
        .where(and(eq(schema.contact.tenantId, tenantId), eq(schema.contact.id, input.contactId)));
      if (c && !c.anonymisedAt) {
        // Files the contact sent that never reached a case (drafts, failed flows) (#22 finding 2)
        const own = await tx.select({ id: schema.attachment.id, key: schema.attachment.storageKey }).from(schema.attachment)
          .where(and(eq(schema.attachment.tenantId, tenantId), eq(schema.attachment.contactId, c.id)));
        if (own.length) {
          keys = [...keys, ...own.map((f) => f.key)];
          await tx.delete(schema.attachment).where(and(eq(schema.attachment.tenantId, tenantId), inArray(schema.attachment.id, own.map((f) => f.id))));
        }
        await tx.update(schema.contact).set({
          lineUserId: `anonymised:${c.id}`,
          displayName: null, fullName: null, phone: null, customerRef: null, orgUnit: null,
          // No longer a registered reporter: excluded from broadcasts even if someone re-activates it (#22 finding 3)
          consentAt: null, consentVersion: null,
          // Nothing may be sent to or processed for an erased contact (broadcasts, pushes, bot).
          status: 'blocked',
          anonymisedAt: now,
        }).where(and(eq(schema.contact.tenantId, tenantId), eq(schema.contact.id, c.id)));
        await tx.delete(schema.dialogSession).where(and(eq(schema.dialogSession.tenantId, tenantId), eq(schema.dialogSession.lineUserId, c.lineUserId)));
        await tx.delete(schema.simMessage).where(and(eq(schema.simMessage.tenantId, tenantId), eq(schema.simMessage.lineUserId, c.lineUserId)));
        await audit({
          tenantId, ...who, action: 'contact.anonymised', entity: 'contact', entityId: c.id,
          diff: { reason, cases: ids.length, files: keys.length },
        }, tx);
        contactDone = true;
      }
    }
    return { cases: ids.length, keys, contact: contactDone };
  });

  let filesDeleted = 0;
  for (const k of result.keys) {
    try {
      await deleteObject(k);
      filesDeleted++;
    } catch (e) {
      console.error('[anonymise] could not delete file', k, e);
    }
  }
  return { cases: result.cases, files: filesDeleted, contact: result.contact };
}
