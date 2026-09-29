# 0006. In-app TOTP MFA for staff, required for admins, until SSO
Date: 2026-09-30 · Status: Accepted · Deciders: PO (delegated by Fero), see DECISIONS D-019

## Context
SPEC §8 requires MFA for Admin. ADR 0003 gave the MVP a password login; SSO/OIDC is Phase 2 and the client's identity provider is unknown (SPEC §9), so MFA cannot come from an IdP yet. Gap G4 in `docs/po/03-analysis.md` §6.

## Options considered
| Option | Pros | Cons |
| --- | --- | --- |
| Wait for OIDC and use the IdP's MFA | No MFA code to own | Blocks real use on an unknown IdP decision |
| TOTP (RFC 6238) in the app | Standard, works with any authenticator app, no service cost, no personal data (no phone/email) | We own secret storage, recovery and throttling |
| SMS / email OTP | Familiar to users | Needs a paid gateway (escalation), weaker (SIM swap), sends personal data |
| WebAuthn / passkeys | Phishing-resistant | More UI and device work; overkill before SSO |

## Decision
TOTP per RFC 6238 (SHA-1, 30-second step, 6 digits, ±1 step window), implemented with `node:crypto`.
- Required for admins; optional for agents and supervisors. An admin without MFA is sent to enrolment before any other page or admin API.
- Secrets are encrypted at rest (AES-256-GCM, key derived from `APP_SECRET`). 8 single-use recovery codes, stored as SHA-256 hashes and shown once.
- Login becomes two steps: after the password, a 5-minute signed "MFA pending" cookie; the session cookie is issued only after a valid code. Failed codes are throttled per user like passwords.
- An admin can reset another user's MFA (audit-logged). A used code cannot be replayed within its window.

## Consequences
- Positive: SPEC §8 MFA requirement met now; no external cost or personal data.
- Negative: testers who log in as admin must enrol with an authenticator app (documented in the test script).
- Follow-up: when OIDC arrives (Phase 2), a new ADR moves MFA to the IdP and supersedes this one.
