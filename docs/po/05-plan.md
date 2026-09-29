# 05 · Plan (MVP for user testing)

Date: 2026-09-29 · Status: awaiting approval

Build order follows the /po playbook. All slices go on branch `claude/mvp-user-test-a54ab0` (one worktree for the whole MVP, not one branch per slice. Noted as a pipeline deviation in 09-feedback).

| # | Slice | Stories | Exit test | Depends on |
| --- | --- | --- | --- | --- |
| S0 | Skeleton: Next.js, Postgres (docker compose), Drizzle schema, seed from `prototype/mock-data`, tenant, staff login | D3 (seed users) | `pnpm db:reset && pnpm test` green; login works | – |
| S1 | LINE webhook + signature + idempotency + messaging gateway + simulator | – | Replay of a recorded webhook twice → processed once; bad signature → 401 | S0 |
| S2 | Registration + PDPA consent (LIFF page + simulator) | R1 | Contact saved with `consent_version`; unregistered reporter is blocked | S1 |
| S3 | Dialog engine | R2, R3 | Unit tests: every question type, back/restart/cancel, 3 retries, edit from summary, TTL resume, show_if | S1 |
| S4 | Case creation + SLA calc + round-robin | R3, S1 | Integration: confirm → case with number, answers, due dates, assignee | S3 |
| S5 | Agent console: Inbox, Detail, reply/note, transitions, reveal phone | A1–A3 | Integration: state machine table; LINE reply reaches the simulator | S4 |
| S6 | Reporter follow-up: my cases, pending reply binding, CSAT, reopen | R4–R6 | Integration: pending → reply → in_progress; resolved → ok → closed + score | S5 |
| S7 | SLA worker + notifications + Dashboard | S2 | Unit: business-hours math; sweep sets warn/breach, auto-closes | S4 |
| S8 | Admin: Flow Builder (draft/publish), Users, Canned replies, Audit log | D1–D4 | Integration: publish v+1; open session keeps old version | S3 |
| S9 | Reports ×4 + CSV | S3 | CSV export writes audit log | S7 |

## Test strategy

- **Unit (Vitest):** dialog engine and SLA/business-hours math. These are pure functions.
- **Integration (Vitest + real Postgres):** case service transitions, webhook replay with recorded events (`test/fixtures/line-events/*.json`) through the real route handler.
- **E2E (manual + browser):** tester script in `docs/po/user-test-script.md`, driven through the simulator and the web app.

## Risks

- Reply tokens expire quickly (see 01-research). Mitigation: fall back to Push.
- The single-process worker stops if the app is scaled horizontally (ADR 0001). This is acceptable for one VM.
- Business hours and holidays are assumptions (`ยังไม่ยืนยัน`).
