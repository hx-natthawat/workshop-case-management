import {
  pgTable, uuid, text, integer, boolean, timestamp, jsonb, primaryKey, uniqueIndex, index, bigint,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const tenantId = () => uuid('tenant_id').notNull();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const tenant = pgTable('tenant', {
  id: id(),
  name: text('name').notNull(),
  oaName: text('oa_name').notNull().default('ศูนย์แจ้งปัญหา'),
  pdpaVersion: text('pdpa_version').notNull(),
  pdpaText: text('pdpa_text').notNull(),
  // Business hours (ADR/analysis A3): minutes from midnight, Asia/Bangkok, Mon–Fri
  bizStartMin: integer('biz_start_min').notNull().default(9 * 60),
  bizEndMin: integer('biz_end_min').notNull().default(17 * 60),
  /** Category used when a reporter asks for a human (analysis A4). */
  handoffCategoryId: uuid('handoff_category_id'),
  /** Dashboard target for the 30-day SLA pass rate (D-013; default from the prototype, not from a standard). */
  slaTargetPct: integer('sla_target_pct').notNull().default(90),
  createdAt: createdAt(),
});

export const team = pgTable('team', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  autoAssign: boolean('auto_assign').notNull().default(true),
  createdAt: createdAt(),
});

export const user = pgTable('app_user', {
  id: id(),
  tenantId: tenantId(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').$type<'agent' | 'supervisor' | 'admin'>().notNull(),
  teamId: uuid('team_id'),
  passwordHash: text('password_hash').notNull(),
  ssoSubject: text('sso_subject'),
  isActive: boolean('is_active').notNull().default(true),
  lastAssignedAt: ts('last_assigned_at'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('app_user_email_uq').on(t.tenantId, t.email)]);

export const contact = pgTable('contact', {
  id: id(),
  tenantId: tenantId(),
  lineUserId: text('line_user_id').notNull(),
  displayName: text('display_name'),
  fullName: text('full_name'),
  phone: text('phone'),
  customerRef: text('customer_ref'),
  orgUnit: text('org_unit'),
  consentVersion: text('consent_version'),
  consentAt: ts('consent_at'),
  status: text('status').$type<'active' | 'unfollowed' | 'blocked'>().notNull().default('active'),
  isSimulated: boolean('is_simulated').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('contact_line_uq').on(t.tenantId, t.lineUserId)]);

export const form = pgTable('form', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const formVersion = pgTable('form_version', {
  id: id(),
  tenantId: tenantId(),
  formId: uuid('form_id').notNull(),
  version: integer('version').notNull(),
  status: text('status').$type<'draft' | 'published' | 'archived'>().notNull(),
  publishedAt: ts('published_at'),
  publishedBy: uuid('published_by'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('form_version_uq').on(t.formId, t.version)]);

export type QuestionType =
  | 'short_text' | 'long_text' | 'single_choice' | 'datetime' | 'location'
  | 'attachment' | 'number' | 'phone' | 'email';

export interface QuestionValidation {
  maxLength?: number;
  min?: number;
  max?: number;
  notFuture?: boolean;
  maxFiles?: number;
}

export const question = pgTable('question', {
  id: id(),
  tenantId: tenantId(),
  formVersionId: uuid('form_version_id').notNull(),
  key: text('key').notNull(),
  order: integer('sort_order').notNull(),
  type: text('type').$type<QuestionType>().notNull(),
  label: text('label').notNull(),
  /** Short label for the LINE summary card, e.g. "ผลกระทบ" (prototype LineConfirm.png). */
  shortLabel: text('short_label'),
  options: jsonb('options').$type<string[]>(),
  required: boolean('required').notNull().default(true),
  validation: jsonb('validation').$type<QuestionValidation>(),
  showIf: jsonb('show_if').$type<{ key: string; equals: string } | null>(),
  priorityRules: jsonb('priority_rules').$type<Record<string, Priority> | null>(),
}, (t) => [index('question_fv_idx').on(t.formVersionId)]);

export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type CaseStatus =
  | 'new' | 'assigned' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed' | 'reopened' | 'cancelled';

export const category = pgTable('category', {
  id: id(),
  tenantId: tenantId(),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  hint: text('hint'),
  /** Icon name for the LINE category card (lucide name, rendered by /api/flex-icon). */
  icon: text('icon'),
  formId: uuid('form_id'),
  defaultPriority: text('default_priority').$type<Priority>().notNull().default('P3'),
  defaultTeamId: uuid('default_team_id'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

export const slaPolicy = pgTable('sla_policy', {
  id: id(),
  tenantId: tenantId(),
  priority: text('priority').$type<Priority>().notNull(),
  responseMinutes: integer('response_minutes').notNull(),
  resolveMinutes: integer('resolve_minutes').notNull(),
  businessHoursOnly: boolean('business_hours_only').notNull(),
  pauseOnPending: boolean('pause_on_pending').notNull().default(true),
}, (t) => [uniqueIndex('sla_policy_uq').on(t.tenantId, t.priority)]);

export const caseCounter = pgTable('case_counter', {
  tenantId: tenantId(),
  period: text('period').notNull(),
  seq: integer('seq').notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.period] })]);

export const kase = pgTable('case', {
  id: id(),
  tenantId: tenantId(),
  caseNo: text('case_no').notNull(),
  title: text('title').notNull(),
  contactId: uuid('contact_id').notNull(),
  categoryId: uuid('category_id').notNull(),
  formVersionId: uuid('form_version_id'),
  priority: text('priority').$type<Priority>().notNull(),
  status: text('status').$type<CaseStatus>().notNull(),
  assigneeId: uuid('assignee_id'),
  teamId: uuid('team_id'),
  slaResponseDue: ts('sla_response_due'),
  slaResolveDue: ts('sla_resolve_due'),
  slaPausedAt: ts('sla_paused_at'),
  slaWarnedResponse: boolean('sla_warned_response').notNull().default(false),
  slaWarnedResolve: boolean('sla_warned_resolve').notNull().default(false),
  slaBreachedResponse: boolean('sla_breached_response').notNull().default(false),
  slaBreachedResolve: boolean('sla_breached_resolve').notNull().default(false),
  firstResponseAt: ts('first_response_at'),
  resolvedAt: ts('resolved_at'),
  closedAt: ts('closed_at'),
  pendingSince: ts('pending_since'),
  pendingRemindedAt: ts('pending_reminded_at'),
  lastInboundAt: ts('last_inbound_at'),
  unreadByAgent: boolean('unread_by_agent').notNull().default(true),
  csatScore: integer('csat_score'),
  reopenCount: integer('reopen_count').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('case_no_uq').on(t.tenantId, t.caseNo),
  index('case_status_idx').on(t.tenantId, t.status),
  index('case_contact_idx').on(t.contactId),
]);

export type AnswerValue =
  | { kind: 'text'; text: string }
  | { kind: 'choice'; value: string }
  | { kind: 'datetime'; iso: string }
  | { kind: 'location'; title?: string; address?: string; latitude?: number; longitude?: number }
  | { kind: 'files'; attachmentIds: string[] }
  | { kind: 'skipped' };

export const caseAnswer = pgTable('case_answer', {
  id: id(),
  tenantId: tenantId(),
  caseId: uuid('case_id').notNull(),
  questionKey: text('question_key').notNull(),
  labelSnapshot: text('label_snapshot').notNull(),
  order: integer('sort_order').notNull(),
  value: jsonb('value').$type<AnswerValue>().notNull(),
});

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'image'; attachmentId: string }
  | { type: 'location'; title?: string; address?: string; latitude: number; longitude: number }
  | { type: 'form_submitted'; answerCount: number; attachmentCount: number };

export const caseMessage = pgTable('case_message', {
  id: id(),
  tenantId: tenantId(),
  caseId: uuid('case_id').notNull(),
  direction: text('direction').$type<'in' | 'out' | 'internal'>().notNull(),
  senderType: text('sender_type').$type<'contact' | 'agent' | 'bot'>().notNull(),
  senderId: uuid('sender_id'),
  content: jsonb('content').$type<MessageContent>().notNull(),
  lineMessageId: text('line_message_id'),
  deliveryError: text('delivery_error'),
  createdAt: createdAt(),
}, (t) => [index('case_message_case_idx').on(t.caseId, t.createdAt)]);

export const attachment = pgTable('attachment', {
  id: id(),
  tenantId: tenantId(),
  caseId: uuid('case_id'),
  messageId: uuid('message_id'),
  storageKey: text('storage_key').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  checksum: text('checksum').notNull(),
  createdAt: createdAt(),
});

export const caseEvent = pgTable('case_event', {
  id: id(),
  tenantId: tenantId(),
  caseId: uuid('case_id').notNull(),
  eventType: text('event_type').notNull(),
  fromValue: text('from_value'),
  toValue: text('to_value'),
  actorType: text('actor_type').$type<'user' | 'contact' | 'system'>().notNull(),
  actorId: uuid('actor_id'),
  note: text('note'),
  createdAt: createdAt(),
}, (t) => [index('case_event_case_idx').on(t.caseId, t.createdAt)]);

export const cannedReply = pgTable('canned_reply', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdAt: createdAt(),
});

export const notification = pgTable('notification', {
  id: id(),
  tenantId: tenantId(),
  userId: uuid('user_id').notNull(),
  type: text('type').notNull(),
  caseId: uuid('case_id'),
  text: text('text').notNull(),
  readAt: ts('read_at'),
  createdAt: createdAt(),
}, (t) => [index('notification_user_idx').on(t.userId, t.createdAt)]);

export const auditLog = pgTable('audit_log', {
  id: id(),
  tenantId: tenantId(),
  actorId: uuid('actor_id'),
  actorType: text('actor_type').$type<'user' | 'contact' | 'system'>().notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  diff: jsonb('diff'),
  ip: text('ip'),
  createdAt: createdAt(),
}, (t) => [index('audit_log_created_idx').on(t.tenantId, t.createdAt)]);

export const processedEvent = pgTable('processed_event', {
  webhookEventId: text('webhook_event_id').primaryKey(),
  tenantId: tenantId(),
  receivedAt: createdAt(),
});

export const dialogSession = pgTable('dialog_session', {
  tenantId: tenantId(),
  lineUserId: text('line_user_id').notNull(),
  state: jsonb('state').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.lineUserId] })]);

/** Simulator chat log: both what the tester sent and what the bot pushed/replied. */
export const simMessage = pgTable('sim_message', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  tenantId: tenantId(),
  lineUserId: text('line_user_id').notNull(),
  direction: text('direction').$type<'user' | 'bot'>().notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: createdAt(),
}, (t) => [index('sim_message_user_idx').on(t.lineUserId, t.id)]);
