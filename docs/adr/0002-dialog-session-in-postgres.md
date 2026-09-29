# 0002. Dialog session stored in Postgres with an expiry column
Date: 2026-09-29 · Status: Accepted (scope: MVP user test) · Deciders: PO (delegated by Fero), 2026-09-30, see DECISIONS D-002

## Context
SPEC §6 keeps the unfinished conversation in Redis with a 30-minute TTL. ADR 0001 removes Redis from the MVP.

## Options considered
| Option | Pros | Cons |
| --- | --- | --- |
| Redis with TTL | Matches SPEC; native expiry | Extra container only for this |
| Postgres table `dialog_session(line_user_id, state jsonb, expires_at)` | No new infra; transactional with case creation | Expired rows need a cleanup; one DB round-trip per message |
| In-memory map | Trivial | Lost on restart; breaks with more than one process |

## Decision
Postgres table. Rows are treated as absent once `expires_at < now()`. The worker deletes expired rows. The dialog engine does not know where state is stored (`sessionStore` interface), so moving to Redis later only swaps the store.

## Consequences
- Positive: one fewer moving part.
- Negative: deviates from SPEC §6 (logged as feedback F-04).
