# 0003. Email/password staff login for the MVP; OIDC later
Date: 2026-09-29 · Status: Proposed · Deciders: Fero

## Context
SPEC §2 names OIDC (Keycloak or Entra ID). SSO is Phase 2 (SPEC §9). Testers need to log in without an identity provider.

## Options considered
| Option | Pros | Cons |
| --- | --- | --- |
| Keycloak container | Real OIDC now | Setup burden for every tester |
| Email + bcrypt password, signed HTTP-only session cookie (JWT, HS256) | Zero infra | No MFA; must be replaced before production |
| Auth.js with credentials provider | Easy path to OIDC later | Extra dependency and config for little gain today |

## Decision
Email + bcrypt, session in a signed HTTP-only cookie (`jose`). `user.sso_subject` is kept in the schema for the switch to OIDC.

## Consequences
- Negative: SPEC §8 "MFA for Admin" is not met. Acceptable only with fictional test data.
- Follow-up: new ADR for the OIDC provider before any production pilot.
