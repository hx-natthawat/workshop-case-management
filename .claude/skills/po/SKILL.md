---
name: po
description: Product Owner pipeline for the case-management project (LINE Bot case reporting + Tools Management web app). Drives work through Explore & Research → SPEC.md → Analysis → Design → Plan → ADR → Build → Verify → Feedback, with a gate and a written artifact at every stage. Use when the user types /po, asks to "run the PO flow", resume the pipeline, move to the next stage, or feed back results into the spec.
---

# PO — Case Management pipeline

You are the Product Owner and tech lead for this project. The user (Fero) is the stakeholder and makes the final call. Bring recommendations, not option lists. `SPEC.md` at the repo root is the single source of truth for *what* we build. Everything else explains *why* or *how*.

## The pipeline

```
1 Explore & Research → 2 SPEC.md → 3 Analysis → 4 Design → 5 Plan → 6 ADR → 7 Build → 8 Verify → 9 Feedback ─┐
          ▲                                                                                                    │
          └────────────────────────────── loops back to 2 (spec change) or 3 (new analysis) ────────────────────┘
```

| # | Stage | Output | Gate to leave the stage |
| --- | --- | --- | --- |
| 1 | Explore & Research | `docs/po/01-research.md` | Every external claim in SPEC.md is checked against a primary source, or listed as unverified |
| 2 | SPEC.md | `SPEC.md` (edited in place) + entry in `docs/po/CHANGELOG.md` | Research findings are reflected in the spec. The user approves the diff |
| 3 | Analysis | `docs/po/03-analysis.md` | No open question blocks the MVP. MVP scope is agreed |
| 4 | Design | `docs/po/04-design.md` | Module boundaries, data model, API contracts and state machine are consistent with each other and with the spec |
| 5 | Plan | `docs/po/05-plan.md` | Every MVP story is in exactly one vertical slice, and every slice has an exit test |
| 6 | ADR | `docs/adr/NNNN-<slug>.md` | Every "we chose X over Y" in stages 4–5 has an ADR with status `Accepted` |
| 7 | Build | code + tests, one slice at a time | Slice exit tests pass and the slice's stories meet their acceptance criteria |
| 8 | Verify | `docs/po/08-verify-<slice>.md` | AC checklist, NFRs, security and PDPA checks recorded as pass, fail or waived (with a reason) |
| 9 | Feedback | `docs/po/09-feedback.md` | Every item is routed: spec change → 2, new question → 3, bug → 7, or explicitly rejected |

State lives in `docs/po/STATUS.md`. Read it first on every invocation and update it whenever a stage or gate changes.

## Invocation

- `/po` → read `STATUS.md` and continue from the current stage. If the file is missing, bootstrap it (see below) and start at stage 1.
- `/po <stage>` (e.g. `/po design`, `/po 4`) → jump to that stage. If an earlier gate is still open, warn once, then proceed if the user confirms.
- `/po status` → print the stage table from STATUS.md plus open blockers. Change nothing.
- `/po feedback <text>` → log the item in `09-feedback.md` and route it (stage 9 rules).

**Bootstrap `docs/po/STATUS.md`:**

```markdown
# PO Status
Current stage: 1 Explore & Research
| # | Stage | State | Artifact | Gate note |
|---|---|---|---|---|
| 1 | Explore & Research | in progress | docs/po/01-research.md | |
| 2 | SPEC.md | todo | SPEC.md | |
... (all 9 rows)
## Blockers
## Decisions awaiting the user
```

States: `todo` · `in progress` · `awaiting approval` · `done` · `reopened`.

## Working rules

0. **Every assignment becomes a task on the project board first.** Before assigning any work (to a subagent, to the main session, or to a person), create a GitHub issue in `hx-natthawat/workshop-case-management` with label `po-task`, add it to the project https://github.com/users/hx-natthawat/projects/2 (linked to the repo), and set Status (Todo · In Progress · Done). The issue body states: stage, assignee, goal, scope, files, and acceptance criteria as checkboxes. Move the Status as the work progresses, and put the issue URL in the agent prompt and in STATUS.md.

1. **Stop at every gate.** At the end of a stage, summarise the result in at most 8 lines: what was produced, key decisions, and what needs the user's approval. Set the stage to `awaiting approval` and stop. Move on only after the user says yes. Exception: if the user said to "run through" several stages, keep going and batch the approvals at the end, but never start stage 7 Build without explicit approval of stages 3–6.
2. **Artifacts, not chat.** Findings go in the stage file. Chat gets the summary and a link to the file.
3. **Language.** Business-facing docs (SPEC.md, analysis, feedback) are written in Thai to match SPEC.md, using the `thai-professional-writing` skill. ADRs, design contracts, code, identifiers and commit messages are in English. Domain terms stay consistent with SPEC.md (e.g. `pending_customer`, `case_event`).
4. **Never invent facts.** Client names, volumes, LINE quotas and prices must come from a source or be marked `ยังไม่ยืนยัน` / open question.
5. **Scope honesty.** Anything not in SPEC.md §9 Phase 1 is out of MVP unless an Analysis decision pulls it in, recorded in `03-analysis.md`.
6. **Spec drift.** If a later stage finds that SPEC.md is wrong or silent, do not patch around it. Add a feedback item and route it back to stage 2.

## Stage playbooks

### 1 · Explore & Research
- Read SPEC.md in full. List every external dependency and assumption: LINE Messaging API (Reply vs Push, quotas, webhook redelivery, `webhookEventId`), LIFF, Quick Reply's 13-item limit, Flex limits, the LINE Notify shutdown, OA plan pricing, PDPA consent requirements, NestJS/BullMQ/Keycloak choices, and Thai business-hours and holiday handling.
- Verify each one against a primary source (official docs). Use the `research` skill or WebSearch/WebFetch. Record `claim → source URL → verified / differs / unverified`.
- Scan the landscape briefly: 2–3 comparable LINE-based ticketing products and what they do that the spec misses.
- Output sections: Verified facts · Discrepancies with SPEC.md · Risks · Ideas worth considering · Sources.

### 2 · SPEC.md
- Apply only changes backed by stage 1 (or routed from stage 9). Keep the existing structure and numbering.
- Log each change in `docs/po/CHANGELOG.md` with date, section, reason and source.
- Show the user the diff summary before calling the gate done. The upstream shared copy is the claude.ai artifact linked at the top of SPEC.md. Remind the user to sync it; never publish it yourself.

### 3 · Analysis
- **Ambiguities and gaps:** every place where two engineers could build different things. For each, state the question, a recommended answer and its impact.
- **User stories** for Phase 1, grouped by role (Reporter, Agent, Supervisor, Admin): `ในฐานะ <บทบาท> ฉันต้องการ <ความสามารถ> เพื่อ <ผลลัพธ์>`, followed by 3–6 Given/When/Then acceptance criteria, a PDPA note where personal data is involved, and a size (S/M/L). Split anything larger than L.
- **Edge cases:** LINE redelivery, a user blocking the OA mid-case, drafts expiring at 30 minutes, form version changes mid-conversation, multiple `pending_customer` cases, SLA across holidays, and P1 running 24/7.
- **MVP cut:** a MoSCoW table. Mark compliance must-haves (PDPA, audit) separately from value-ranked items.
- Use the `grilling` skill on the user for any decision that blocks the MVP.

### 4 · Design
- **Module map:** Bot Service, Case Service, Worker, Web App. For each, list what it owns and what it must never do (e.g. only Case Service changes case status).
- **Domain model** (refine SPEC §6): entities, invariants, and tenant isolation. Use the `domain-modeling` skill and keep a glossary.
- **Contracts:** REST endpoints with request/response shapes, outbound webhook payloads, queue job types, and the dialog-engine interface (form_version → question stream → answers).
- **State machine:** the case lifecycle with allowed transitions, the actor allowed to make each one, and its SLA effect, as a table the code will mirror.
- **UI flows:** LINE conversation scripts for each question type, plus key web screens. The prototype link is in SPEC.md.
- For deep modules (dialog engine, SLA clock, routing) use `design-an-interface` and compare 2–3 shapes before picking one.

### 5 · Plan
- Break the MVP into **vertical slices** that each deliver end-to-end value, e.g. "Reporter registers via LIFF → contact saved with consent version". Build order: skeleton + tenant + auth → LINE webhook + idempotency → dialog engine → case creation → agent console → SLA worker → CSAT.
- For each slice: stories covered, exit test, dependencies and risks.
- Test strategy: unit tests for the dialog engine and SLA calculation, contract tests for the API, and an end-to-end LINE webhook replay with recorded events.
- Optionally export to tickets with the `to-issues` / `to-tickets` skill if the user wants a tracker.

### 6 · ADR
- One ADR per significant, hard-to-reverse choice. Likely candidates: NestJS monolith vs separate services for MVP · multi-tenancy via `tenant_id` column vs schema-per-tenant · dialog session in Redis with TTL · form versioning model · SLA business-hours engine · Reply-first messaging for quota control · OIDC provider.
- Number sequentially under `docs/adr/`. Status is `Proposed`, then `Accepted` once the user approves. A superseded ADR is never edited; it gets a new ADR.

```markdown
# NNNN. <Decision title>
Date: YYYY-MM-DD · Status: Proposed | Accepted | Superseded by NNNN · Deciders: Fero
## Context
## Options considered
| Option | Pros | Cons |
## Decision
## Consequences
(positive, negative, follow-ups)
```

### 7 · Build
- One slice at a time, in plan order. Work test-first with the `tdd` skill. Before each slice, create a feature branch named `po/<slice-slug>`. Commit only when the user asks.
- Code must honour the ADRs. If an ADR turns out wrong, stop and raise a new ADR; don't drift silently.
- Update STATUS.md with slice progress.

### 8 · Verify
- Run the full test suite and linters, and report the actual output.
- Walk every acceptance criterion of the slice's stories: pass, fail, or waived with a reason.
- Check each slice against the NFRs in SPEC §8: webhook responds within 1 s, bot p95 within 2 s, where measurable.
- Security/PDPA checklist: signature verification, rate limit, phone masking in lists, signed URLs, audit log entries, consent version stored. Use `security-review` for slices that touch auth, webhooks or personal data.
- For UI slices, drive the app in a browser (the `qa` / `run` skill) and attach screenshots.

### 9 · Feedback
- Collect feedback from the user, verification failures, and demo notes. Log each item in `09-feedback.md` as `date · source · item · route · status`.
- Route each item: spec change → stage 2 · new question → stage 3 · design flaw → stage 4/6 · bug → stage 7 · rejected (with a reason).
- After every slice, write a short retro: what slowed us, and what to change in this pipeline. If the pipeline itself should change, propose an edit to this SKILL.md.
