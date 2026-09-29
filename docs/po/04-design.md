# 04 · Design (MVP for user testing)

Date: 2026-09-29 · Status: awaiting approval · Implements: `03-analysis.md` Must + Should items.

## 1. Module map

One Next.js app (ADR 0001). SPEC §2's services become **modules with enforced boundaries** under `app/src/server/`, so we can split them out later.

| Module | Path | Owns | Must never |
| --- | --- | --- | --- |
| Bot | `server/bot/` | LINE webhook, signature check, idempotency, the dialog engine, LINE message builders, routing of inbound events | Write to `case` or change case status directly. It calls `caseService` |
| Case | `server/case/` | Case creation, the state machine, assignment and round-robin, SLA fields, messages, events, CSAT | Call the LINE API directly. It uses `messaging` |
| Worker | `server/worker/` | SLA sweep every 60 s (80 % warning, breach, auto-close, pending reminder) | Run inside a request. It is started once from `instrumentation.ts` |
| Messaging | `server/messaging/` | Reply/Push gateway: real LINE API or the simulator outbox | Hold business rules |
| Web | `app/(app)/**`, `app/api/**` | Agent console, admin tools, REST API | Bypass `caseService` for status changes |
| Simulator | `app/simulator`, `server/sim/` | Fake LINE client for testers. It goes through the same event handler as real LINE | Be enabled in production (`SIMULATOR_ENABLED=false`) |

## 2. Domain model

SPEC §6 plus these MVP additions (flagged in 09-feedback as spec drift where relevant):

- `case.title` (analysis A1), `case.sla_paused_at`, `case.sla_warned_response/resolve`, `case.sla_breached_response/resolve`, `case.pending_since`, `case.pending_reminded_at`, `case.last_inbound_at`.
- `team.auto_assign`, `user.last_assigned_at` (round-robin), `user.password_hash` (ADR 0003).
- `dialog_session` table instead of Redis (ADR 0002).
- `processed_event (webhook_event_id PK)` for idempotency.
- `sim_message` stores the simulator's chat log.
- `case_counter (tenant_id, period, seq)` for case numbers.
- `notification` for in-app alerts; `canned_reply`; `tenant` (PDPA text + version, business hours).

**Invariants**

1. Every row carries `tenant_id`. Every query filters by it (`ctx.tenantId`).
2. Only `caseService.transition()` writes `case.status`, and it always writes a `case_event` in the same transaction.
3. `case_answer.label_snapshot` and `case.form_version_id` are written at creation and never updated.
4. `audit_log` is insert-only.
5. A contact without `consent_at` cannot create a case.

**Glossary:** *contact* = reporter on LINE · *user* = staff member · *form version* = immutable once published · *draft* = the unfinished dialog session (30-min TTL) · *first response* = first outbound agent message (bot messages do not count).

## 3. Contracts

### Dialog engine (pure, unit-tested)

```ts
step(state: DialogState | null, input: DialogInput, ctx: DialogCtx): DialogResult
type DialogInput =
  | { kind: 'text'; text: string }
  | { kind: 'postback'; data: string; params?: { datetime?: string; date?: string } }
  | { kind: 'image'; messageId: string }
  | { kind: 'location'; title?: string; address?: string; latitude: number; longitude: number }
  | { kind: 'start' }                               // rich menu "แจ้งปัญหาใหม่"
interface DialogResult { state: DialogState | null; messages: LineMessage[]; effect?: { type: 'create_case'; draft: CaseDraft } | { type: 'handoff'; draft: Partial<CaseDraft> } }
```

`ctx` holds the category tree and the published form versions, loaded once per event. The engine has no I/O. The bot router runs the effect through `caseService` and appends the success message.

### REST (all under `/api`, cookie session, JSON)

| Method | Path | Body / query | Role |
| --- | --- | --- | --- |
| POST | `/webhooks/line` | LINE webhook body, `X-Line-Signature` | public |
| POST | `/auth/login` · `/auth/logout` | `{email,password}` | public |
| GET | `/cases` | `tab, status, priority, categoryId, sla=risk, q, page` | agent+ |
| GET | `/cases/:id` | – | agent (own/unassigned in team) · supervisor+ |
| PATCH | `/cases/:id` | `{status?, priority?, reason?}` | per state machine |
| POST | `/cases/:id/assign` | `{assigneeId}` | supervisor+ (agents may self-assign) |
| POST | `/cases/:id/messages` | `{mode:'line'|'internal', text, afterStatus?}` | agent+ |
| POST | `/cases/:id/reveal-phone` | – | agent+ (audit-logged) |
| GET/POST/PUT/DELETE | `/categories`, `/forms/:id/draft`, `/forms/:id/publish` | builder payloads | admin |
| GET | `/reports/:type` · `/reports/:type.csv` | `from,to` | supervisor+ (CSV audit-logged) |
| GET/POST/PATCH | `/users` | `{email,name,role,teamId,password?,isActive}` | admin |
| GET/POST/DELETE | `/canned-replies` | `{title,body}` | agent read · supervisor+ write |
| POST | `/liff/register` | `{idToken | simUserId, name, phone, customerRef, consent:true}` | public (ID token verified) |
| GET | `/files/:id?exp&sig` | signed URL | public with valid signature |
| POST | `/sim/send` · GET `/sim/messages` | simulator only | `SIMULATOR_ENABLED` |

### Postback data (bot)

`menu:start` · `menu:my_cases` · `menu:track` · `menu:handoff` · `cat:<id>` · `ans:<index>` · `dt` (datetimepicker) · `cmd:back|restart|cancel|skip|done|now` · `sum:confirm|edit|cancel` · `edit:<key>` · `resume:continue|restart` · `fwd:<caseId>` · `pend:<caseId>` · `csat:ok|notyet:<caseId>` · `score:<caseId>:<1-5>` · `case:<caseNo>`

## 4. Case state machine

| From | To | Actor | SLA effect |
| --- | --- | --- | --- |
| – | `new` | bot (reporter confirms) | response + resolve due set from priority policy |
| `new` | `assigned` | round-robin, supervisor, agent self-assign | – |
| `new`, `assigned` | `cancelled` | agent+ (reason required) | clocks stop |
| `assigned`, `reopened`, `pending_customer` | `in_progress` | agent+; reporter reply (`pending_customer` only) | pending: resolve due extended by paused business time |
| `in_progress` | `pending_customer` | agent+ | resolve clock paused |
| `in_progress` | `resolved` | agent+ | `resolved_at` set, clocks stop |
| `resolved` | `closed` | reporter confirms · system after 3 days · supervisor+ | `closed_at` set |
| `resolved` | `reopened` | reporter within 7 days | `reopen_count`+1, resolve clock resumes from its remaining time |
| `pending_customer` | `closed` | system (5 business days + reminder + 2 business days) | – |

Reassignment (`assignee_id` change) is allowed in any open status and does not change status, except `new → assigned`.

**SLA:** `due = addBusinessMinutes(start, minutes)` (09:00–17:00 Mon–Fri Asia/Bangkok; P1 = wall clock). Warning at 80 % elapsed, breach at 100 %. The response clock stops at `first_response_at`.

## 5. UI flows

**LINE:** follow → welcome + register button → (LIFF) register → menu. Report: category carousel → sub-category quick reply → questions → summary Flex → success Flex with case number + response ETA. After: my-cases carousel, agent replies, resolved card → score quick reply.

**Approved design (Fero, 2026-09-29):** the designer's prototype is the UI source of truth. Layout from `prototype/screens/*.png`, copy from `prototype/source/*.dc.html`, tokens from `prototype/tokens.css`. Parity record: `08-design-parity.md`. LINE cards are built as real Flex messages that reproduce Main.png, LineConfirm.png and LineTrack.png.

**Web screens** follow `prototype/screens/*.png`: Dashboard, Inbox, Case Detail, Bot Flow (list builder + LINE preview), plus Reports, Users, Canned replies, Audit log and the Simulator (phone frame with a 2×2 rich menu and a persona switcher).
