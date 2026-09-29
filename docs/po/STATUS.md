# PO Status
Current stage: 9 Feedback (ready for user test) · decisions are delegated to the PO (SKILL.md rule 0a, log in docs/po/DECISIONS.md)

Task board: https://github.com/users/hx-natthawat/projects/2 (every assignment is an issue with label `po-task`)

| # | Stage | State | Artifact | Gate note |
|---|---|---|---|---|
| 1 | Explore & Research | done | docs/po/01-research.md, 01-research-r1.md | #2, #16 |
| 2 | SPEC.md | done | SPEC.md, docs/po/CHANGELOG.md | #10 · 12 changes from F-01…F-16 (D-003…D-017) · Fero: sync the shared claude.ai SPEC artifact |
| 3 | Analysis | done | docs/po/03-analysis.md | D-001 |
| 4 | Design | done | docs/po/04-design.md | Prototype approved by Fero 2026-09-29 = UI source of truth · parity in 08-design-parity.md (#11 #12 done) |
| 5 | Plan | done | docs/po/05-plan.md | Slices S0–S9 · D-001 |
| 6 | ADR | done | docs/adr/0001–0006 | 0001–0005 accepted for the MVP-test scope (D-002); 0006 TOTP MFA (D-019); 0001/0003/0004 need successors before production |
| 7 | Build | done | web/ | #3–#8, #11, #12, #15, #17 · wave A #18 #19 #20 #21 #23 done (D-018) · wave B G7–G12 blocked on client facts |
| 8 | Verify | done | docs/po/08-verify-mvp.md, 08-verify-wave-a.md | #9 · #14 security review (9 findings, all fixed in #15) · verdict: ready for user test with fictional data |
| 9 | Feedback | in progress | docs/po/09-feedback.md | F-01…F-16 decided (F-06 interim, needs legal) · waiting for user-test results |

## Blockers
- None for the user test with fictional data.
- Before real use: PDPA legal review (F-06), OIDC/MFA (ADR 0003), real categories and SLAs (SPEC §9).

## Escalated to Fero (rule 0a)
- **Legal:** confirm the PDPA basis, retention period and notice text (D-014 / F-06) before any real personal data.
- **Irreversible:** merge PR #13 into `main` and close PR #1 (superseded).
- **Shared artifact:** sync SPEC.md changes to the claude.ai SPEC artifact (PO never publishes it).
- **Client facts:** real categories, SLAs, business hours, LINE OA plan, hosting, retention period (SPEC §9).
- **Wave B (G7–G12, `03-analysis.md` §6):** hosting → durable queue, object storage, secret manager; client identity provider → OIDC; email gateway; a LINE channel for the end-to-end test and rich menu install.
