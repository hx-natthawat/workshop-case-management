# 08 · Verify: wave A (pre-production gaps G1–G6)

Date: 2026-09-30 · Tasks: #18 media · #19 PDPA DSR + retention · #20 MFA (ADR 0006) · #21 rich menu + message templates · review #22 · fixes #23 · decisions D-018 to D-022

## 1. Automated checks

| Check | Result |
| --- | --- |
| `pnpm test` | **122 passed** (12 files): adds `totp.test` (RFC 6238/4226 vectors), `mfa.test`, `media.test`, `pdpa.test`, `broadcast.test`, `bot-texts.test`, `rich-menu.test`, `security-r2.test` |
| `pnpm tsc --noEmit` · `pnpm lint` | clean |
| `next build` (production) | passes |
| `pnpm audit --prod` | no known vulnerabilities (#22) |

## 2. Acceptance per task

| Task | Result | Evidence |
| --- | --- | --- |
| G1 video/audio/file (#18) | pass | media.test: 202 → 200 transcoding, never-ready, too large, wrong type · simulator upload of video/audio/PDF, seek works, `.html` refused |
| G2 data-subject requests (#19) | pass | pdpa.test: export complete, rectify, restrict, erase refused with open cases, 30-day due date, audit rows without personal values · browser: overdue request, JSON export |
| G3 retention (#19, #23) | pass | pdpa.test + security-r2 5: only expired closed/cancelled cases, contacts without cases, files deleted, orphans swept after 24 h |
| G4 admin MFA (#20, #23) | pass | mfa.test + HTTP: forced enrolment, 2-step login, replay (sequential and parallel) refused, recovery single use, throttle, pending token ≠ session, old password-only session refused after enrolment |
| G5 rich menu (#21) | pass (live install waived) | rich-menu.test against verified LINE limits (research r1 Q9) · image matches LineTrack.png · **waived:** install on a real OA needs a LINE channel (G12) |
| G6 templates + broadcast (#21) | pass | bot-texts.test, broadcast.test · HTTP: placeholder validation, edit applies to the next bot reply, reset · broadcast excludes blocked/unregistered/erased, needs MFA (D-022) |

## 3. Security review #22 → fixes #23

| # | Sev. | Finding | Fix | Verified |
| --- | --- | --- | --- | --- |
| 1 | M | Password-only session kept full access after the user enrolled MFA | Session token carries `mfa`; refused when the user has MFA; enrolment issues a fresh MFA session | T + HTTP (old session 401) |
| 2 | M | Media downloaded before the registration check; not erased; disk-fill | Registration checked first (LINE and simulator); `attachment.contact_id`; erase deletes contact files; orphan sweep | T |
| 3 | L | Erased contact could be re-activated and re-enter broadcasts | 409 on re-activation; anonymise clears consent | T |
| 4 | L | Staff reasons (may quote the reporter) copied into audit diffs | Audit stores reason length only | T |
| 5 | L | Contacts without cases never anonymised by retention | Swept after the cutoff | T |
| 6 | L | Parallel replay of a TOTP/recovery code | Atomic conditional UPDATE | T (6 parallel → 1 success) |
| 7 | L | No throttle on MFA disable | Shared per-user throttle | code |
| 8 | L | `mfa-reset` with malformed id → 500 | UUID check → 404 | T |
| 9 | info | First-come enrolment; password-only broadcast | D-022: MFA required to broadcast; other admins notified on enrolment | HTTP |

## 4. Verdict

Wave A is done. The remaining pre-production items are wave B (G7–G12), which need client facts (hosting, identity provider, email gateway, LINE channel), and the legal confirmation of D-014/D-020. See `STATUS.md` → Escalated to Fero.
