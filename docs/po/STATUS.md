# PO Status
Current stage: 8 Verify done → ready for the user test; next: stage 9 feedback from test sessions

Task board: https://github.com/users/hx-natthawat/projects/2 (every assignment is an issue with label `po-task`)

| # | Stage | State | Artifact | Gate note |
|---|---|---|---|---|
| 1 | Explore & Research | done | docs/po/01-research.md | #2 · findings routed to 09-feedback (F-05, F-06, F-07) |
| 2 | SPEC.md | todo | SPEC.md | #10 · F-01…F-11 waiting to be applied; needs Fero's approval |
| 3 | Analysis | awaiting approval | docs/po/03-analysis.md | Lean version; Fero chose "lean docs, then build" on 2026-09-29 |
| 4 | Design | awaiting approval | docs/po/04-design.md | Prototype approved by Fero 2026-09-29 = UI source of truth · parity in 08-design-parity.md (#11 #12 done) |
| 5 | Plan | awaiting approval | docs/po/05-plan.md | Slices S0–S9 |
| 6 | ADR | awaiting approval | docs/adr/0001–0005 | All `Proposed`; become `Accepted` on Fero's approval |
| 7 | Build | done | web/ | #3–#8, #11, #12, #15 done |
| 8 | Verify | done | docs/po/08-verify-mvp.md | #9 · #14 security review (9 findings, all fixed in #15) · verdict: ready for user test with fictional data |
| 9 | Feedback | in progress | docs/po/09-feedback.md | 16 items open |

## Blockers
- None for the user test with fictional data.
- Before real use: PDPA legal review (F-06), OIDC/MFA (ADR 0003), real categories and SLAs (SPEC §9).

## Decisions awaiting the user
- Approve stages 3–6 and set ADR 0001–0005 to `Accepted`.
- F-02: should "ทั้งหน่วยงานใช้งานไม่ได้" jump straight to P1 (an exception to the one-level rule)?
- F-09: does a due time that passes after office hours count as a breach immediately?
- F-12: pull "FAQ ก่อนเปิดเคส" (shown in the approved prototype) into the MVP, or keep it in Phase 2?
- F-15: confirm the SLA pass-rate target of 90% shown on the dashboard.
