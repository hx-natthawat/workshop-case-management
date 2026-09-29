# 0005. Reply-first messaging with Push fallback, behind one gateway
Date: 2026-09-29 · Status: Proposed · Deciders: Fero

## Context
Push messages count toward the LINE OA plan quota; Reply messages do not (SPEC §8, see 01-research). Testers also use a simulator with no LINE account.

## Options considered
| Option | Pros | Cons |
| --- | --- | --- |
| Call the LINE API from wherever a message is needed | Simple | Quota logic and simulator switch scattered |
| One `messaging` gateway: `reply(token, userId, msgs)` falls back to `push` on failure; routes simulator users (`Usim…`) to the `sim_message` outbox | One place for quota control and testing | – |

## Decision
Single gateway. Every user-initiated answer uses Reply. Only system-initiated messages (agent reply, status change, CSAT, reminders) use Push. A failed Reply (expired token) falls back to Push and is logged.

## Consequences
- The simulator exercises exactly the same code paths as real LINE, except the final HTTP call.
