# 08 · Verify: MVP for user testing

Date: 2026-09-29 · Task: [#9](https://github.com/hx-natthawat/workshop-case-management/issues/9) · Security review: [#14](https://github.com/hx-natthawat/workshop-case-management/issues/14) · Branch `claude/mvp-user-test-a54ab0` (PR #13)

## 1. Automated checks

| Check | Result |
| --- | --- |
| `pnpm test` | **69 passed**: 40 unit (dialog engine, SLA/business-time), 16 webhook-replay integration, 8 edge cases, 5 security regressions |
| `pnpm tsc --noEmit` | clean |
| `pnpm lint` | no issues |
| `next build` (production, Turbopack) | **passes** before and after the security fixes; TypeScript clean |

## 2. NFR (SPEC §8)

Measured on the production build (`next start`), localhost, with the seeded data set (≈60 cases). The numbers exclude LINE's own network time and are **indicative only**, not a load test.

| NFR | Target | Measured | Result |
| --- | --- | --- | --- |
| Webhook answers HTTP 200 | ≤ 1 s | p50 2 ms · p95 6 ms · max 223 ms (n=40, processing continues in `after()`) | pass |
| Bot processes an event and replies | ≤ 2 s p95 | p50 6 ms · p95 13 ms (n=50, via the simulator's synchronous path) | pass |
| Web page load (server render) | ≤ 2 s p95 | dashboard 13 ms · inbox 15 ms · case detail 18 ms · reports 18 ms (p95, n=20 each) | pass |
| Availability, backup, RPO/RTO | 99.5 % · daily | not applicable to a local test build | waived: hosting not decided (SPEC §9) |

Also observed: a bad signature returns 401. Sending 40 events in one second from one user answered only the first 20, so the per-user rate limit (20 per 10 s) works.

## 3. Acceptance criteria (03-analysis §2)

Evidence: **T** = automated test · **B** = checked in the browser/simulator · **A** = agent report with curl/browser evidence.

| Story | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| R1 | Follow → welcome + register button | pass | T `bot-flow` |
| R1 | No consent → cannot submit | pass | T, A |
| R1 | Invalid phone → field error | pass | A (Thai zod errors) |
| R1 | `consent_version` + `consent_at` stored; menu sent | pass | T |
| R1 | Unregistered reporter blocked from reporting | pass | T |
| R1 | Real LINE: ID token verified server-side | waived | Code path only; needs a real LIFF app (no channel configured) |
| R2 | "ข้อ 1 จาก N" after choosing a category | pass | T, B |
| R2 | Quick Reply + typed choice accepted | pass | T (unit) |
| R2 | 3 invalid answers → hand-off offer | pass | T (unit) |
| R2 | ย้อนกลับ / เริ่มใหม่ / ยกเลิก | pass | T (unit) |
| R2 | Draft expires after 30 min; resume prompt within 30 min | pass | T (edge + unit) |
| R2 | Simple `show_if` | pass | T (unit) |
| R3 | Multiple images until "เสร็จ", max files enforced | pass | T (unit), B |
| R3 | Summary with confirm / edit / cancel | pass | T, B |
| R3 | Edit one item → back to summary | pass | T (unit) |
| R3 | Confirm → case number + response time in one Reply | pass | T, B |
| R4 | "เคสของฉัน" lists open cases (max 10 shown) | pass | T, B |
| R4 | Own case detail by number; others' → "ไม่พบ" | pass | T |
| R5 | One `pending_customer` case → reply bound, back to `in_progress`, SLA resumes | pass | T |
| R5 | Several pending → reporter picks the case | pass | T (edge) |
| R5 | Agent reply reaches LINE | pass | T, B |
| R6 | Resolved → confirmation + CSAT card | pass | T, B |
| R6 | "เรียบร้อยแล้ว" / score → closed + `csat_score` | pass | T (incl. edge: score tap closes) |
| R6 | "ยังไม่เรียบร้อย" ≤ 7 days → `reopened`, `reopen_count`+1; > 7 days refused | pass | T, T (edge) |
| R6 | No answer for 3 days → auto-close | pass | T |
| A1 | Tabs, filters, SLA-risk toggle, over-SLA row tint | pass | B |
| A1 | Agents see only own + unassigned-in-team cases | pass | T, A (403 probes in #14) |
| A2 | Answers shown by saved form version; timeline | pass | B |
| A2 | LINE reply sets `first_response_at`; internal notes never sent | pass | T, T (edge) |
| A2 | "หลังส่ง" status change, canned replies | pass | B |
| A2 | Phone reveal audit-logged; signed file URLs | pass | A |
| A3 | Only transitions in design §4; priority change needs a reason; events + audit | pass | T |
| S1 | Manual assignment + round-robin on creation | pass | T, B |
| S2 | Dashboard KPIs / chart / risk table | pass | A (#7, #12) |
| S3 | 4 reports + CSV; export audit-logged; agent 403 | pass | A (#7) |
| S4 | Supervisor closes without waiting for the reporter | pass | code: `resolved → closed` allowed for supervisor/admin |
| D1 | Draft/publish versions; running conversations keep their version | pass | A (#6), T (edge) |
| D2 | Canned replies CRUD (agents read-only) | pass | A (#8) |
| D3 | Users & roles, no self-demotion, deactivation effective at once | pass | A (#8) |
| D4 | Audit log viewer | pass | A (#8) |

Edge cases (03-analysis §3): redelivery, unfollow, draft expiry, mid-conversation publish, multiple pending, P1 24/7 all **pass** (T). Public holidays are **waived** (Phase 2, F-07).

## 4. Security and PDPA checklist

| Item | Result |
| --- | --- |
| Webhook signature (HMAC-SHA256, timing-safe) | pass (T, measured 401) |
| Idempotency on `webhookEventId` | pass (T) |
| Rate limit per LINE userId | pass (measured) |
| Phone masked in lists; reveal audit-logged | pass (A) |
| Signed, expiring file URLs | pass (A) |
| Audit on status/priority/assignment, reveal, export, admin changes | pass (T, A) |
| Consent version stored | pass (T) |
| Security review (#14) | 9 findings, all fixed (§5) |
| MFA for admins, OIDC | waived: ADR 0003, test data only |
| Encryption at rest, retention, data-subject requests | waived: not in the user-test build (F-06), required before real data |

## 5. Security review findings (#14) and fixes (#15)

Review: read-only agent with curl probes against the dev server. No high findings. Everything in §4 marked pass was also confirmed there (signature, `alg:none` token rejected, IDOR probes return 403, signed-URL tampering returns 403, path traversal blocked, uploads limited to images ≤ 10 MB served with `nosniff` + sandbox CSP, `pnpm audit --prod` clean).

| ID | Sev. | Finding | Fix | Verified |
| --- | --- | --- | --- | --- |
| M1 | medium | A blocked reporter could unblock themselves by unfollowing and following again | Bot events never overwrite `blocked` (`bot/handler.ts`) | T |
| M2 | medium | Re-registering through LIFF reset `blocked` to `active` | Registration refuses blocked contacts with 403 (`bot/registration.ts`) | T |
| M3 | medium | With the simulator on, anyone could list personas, read chats and get a full phone via the `?sim=` register prefill | Simulator page, `/api/sim/*` and simulator registration require a staff login or `SIMULATOR_ACCESS_CODE` (signed cookie); the prefill never includes the phone | curl: 401 without access, 200 as staff, phone absent |
| L1 | low | "เคสที่เกี่ยวข้อง" showed titles of cases the agent may not see | Filtered with `canView` + tenant (`queries/cases.ts`) | T |
| L2 | low | No login throttle; unknown emails skipped bcrypt (timing oracle) | 10 failures per email/IP per 15 min → 429; dummy-hash compare | curl: 11th attempt 429 |
| L3 | low | Viewing personal data (contact, case) was not audit-logged | `contact.viewed` / `case.viewed`, at most one row per user and record per 30 min | curl: 3 views → 1 row |
| L4 | low | Malformed ids gave 500 from Postgres | UUID validation → 404; bad filter ids ignored | T, curl 404 |
| L5 | low | Public LIFF endpoint leaked a config variable name | Generic 503, detail only in the server log | curl |
| L6 | low | Agent without a team saw other teams' unassigned cases in the list | List filter mirrors `canView` | T |

## 6. Verdict

**Ready for user testing with fictional data.** All automated checks pass, every Phase 1 acceptance criterion passes or is waived with a reason, the NFR targets are met locally, and every security finding is fixed.

Before any real personal data or production use, these must be done (tracked in `09-feedback.md` and the ADRs):
1. PDPA legal review: consent withdrawal, data-subject rights, retention (F-06)
2. OIDC + MFA for staff (ADR 0003), encryption at rest, S3 storage (ADR 0004)
3. A durable queue for Push and the SLA worker (ADR 0001) and real hosting (SPEC §9)
4. Real LIFF + LINE OA end-to-end test (R1 real-LINE item was waived)

Setup note for the test session: set `SIMULATOR_ACCESS_CODE` in `.env.local` so testers can open `/simulator` without a staff account.
