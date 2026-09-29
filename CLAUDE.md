# Case Management: LINE Case Bot & Tools Management

HarmonyX project. People report cases through a LINE Official Account bot that asks questions one by one. Staff handle the cases in a web app called "Tools Management".

## Read first

1. `SPEC.md` is the functional spec: scope, architecture, bot flow, case lifecycle and SLA, modules, data model, API, security/PDPA, NFR, and phases.
2. `prototype/README.md` covers screens, the component breakdown, and design rules.
3. `prototype/screens/*.png` is the visual source of truth for layout.
4. `prototype/tokens.css` holds the design tokens. Use them instead of hard-coded colors.
5. `prototype/mock-data/*.json` holds enums with Thai labels, sample cases and a sample bot form. Use it for seeds and fixtures.

## Stack (from SPEC.md §2)

- Backend: Node.js + TypeScript (NestJS), LINE Messaging API SDK, PostgreSQL, Redis + BullMQ, S3-compatible storage
- Web app: Next.js + React, shadcn/ui, TanStack Table
- Auth: OIDC (Keycloak or Entra ID)

## Conventions

- Put `tenant_id` on every table from day one (SPEC §6).
- Case status codes: `new, assigned, in_progress, pending_customer, resolved, closed, reopened, cancelled`. Priorities are `P1`–`P4`. Take labels from `prototype/mock-data/enums.json`.
- SLA pauses in `pending_customer` and counts business hours only, except P1 (SPEC §4).
- UI copy is Thai. Keep formal written register in the web app and polite "ครับ" in the bot.
- Build for Phase 1 (MVP) first. See SPEC §9. Anything in Phase 2 or 3 is out of scope unless asked.

## Open decisions (SPEC §9)

These are not decided yet: whether reporters are external or internal, single-tenant vs multi-tenant, which existing ticket/ERP system to integrate, real categories and SLAs, the LINE OA plan, hosting, and data retention. Ask before hard-coding anything that depends on them.
