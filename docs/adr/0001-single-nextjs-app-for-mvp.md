# 0001. Single Next.js app for the user-test MVP
Date: 2026-09-29 · Status: Accepted (scope: MVP user test) · Deciders: PO (delegated by Fero), 2026-09-30, see DECISIONS D-002

## Context
SPEC §2 proposes NestJS services, a Next.js web app, Redis + BullMQ and Keycloak. The goal right now is an MVP that real users can test, fast, on one machine.

## Options considered
| Option | Pros | Cons |
| --- | --- | --- |
| NestJS monolith + Next.js + Redis/BullMQ | Matches SPEC; queue with retries | Two apps, more infra for testers |
| Single Next.js app (route handlers + server modules) + Postgres | One deploy, one language, fastest to build | Background work runs in-process; no durable queue |
| Separate services per SPEC | Final architecture | Far too slow for a user test |

## Decision
One Next.js (App Router) app. Server code lives in `src/server/{bot,case,worker,messaging,sim}` with the boundaries in 04-design §1, so it can be moved into NestJS later. Webhook processing runs after the 200 response via `after()`. The SLA worker is a 60-second interval started once in `instrumentation.ts`.

## Consequences
- Positive: one `docker compose up` + `pnpm dev`; tests hit real Postgres.
- Negative: no retry queue for Push/outbound; the worker must run on exactly one instance (no horizontal scaling).
- Follow-up: before production, move the worker to BullMQ (SPEC §2) and revisit this ADR.
