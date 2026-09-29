# Case Management MVP (LINE Case Bot + Tools Management)

The MVP for user testing. Scope and decisions: `../docs/po/03-analysis.md`, `../docs/po/04-design.md`, `../docs/adr/`.

It is one Next.js 16 app (ADR 0001) with PostgreSQL. The LINE bot runs through the same code path for real LINE and for the built-in **LINE Simulator** (`/simulator`), so testers don't need a LINE OA.

## Run locally

Requires Node 20+, pnpm and Docker.

```bash
cd web
pnpm install
cp .env.example .env.local   # set APP_SECRET to a long random string
cp .env.local .env           # scripts (drizzle-kit, seed) read .env
pnpm db:up                   # Postgres on localhost:54329
pnpm db:reset                # create schema + seed sample data
pnpm dev                     # http://localhost:3000
```

- Staff app: http://localhost:3000. Seeded accounts are in `scripts/seed.ts` (`USERS`). They all use the password in `SEED_PASSWORD` (default in the same file).
- LINE Simulator: http://localhost:3000/simulator. Pick a persona or create a new tester.
- `SEED_SAMPLES=false pnpm db:reset` starts with no cases (useful before a real test session).
- After any `db:reset`, restart `pnpm dev` and log in again (the tenant is cached in memory and sessions point at the old tenant).

## Tests

```bash
pnpm test        # unit (dialog engine, SLA math) + integration (webhook replay on a test DB)
pnpm typecheck
pnpm lint
```

Integration tests reset the separate database `casemgmt_test`. Create it once with `createdb -h localhost -p 54329 -U casemgmt casemgmt_test` (password `casemgmt`).

## Connect a real LINE OA (optional)

1. In LINE Developers, create a Messaging API channel and a LINE Login channel under the **same provider** (otherwise the user IDs differ). Add a LIFF app to the Login channel with endpoint `https://<your-host>/liff/register`, size Full.
2. Put these in `.env.local`: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_LOGIN_CHANNEL_ID`, `NEXT_PUBLIC_LIFF_ID`, and set `APP_BASE_URL` to the public URL.
3. Expose the app, e.g. `cloudflared tunnel --url http://localhost:3000`, and set the webhook URL to `https://<tunnel>/api/webhooks/line`. Turn on "Use webhook" and turn off the OA auto-reply messages.
4. Optional: create a rich menu in LINE Official Account Manager with 4 buttons that send the texts `แจ้งปัญหาใหม่`, `ติดตามสถานะ`, `เคสของฉัน`, `ติดต่อเจ้าหน้าที่`. The bot understands these as menu commands.

## Layout

```
src/server/bot/        webhook handling, dialog engine (pure), LINE message builders, registration
src/server/case/       Case Service: the state machine, SLA, round-robin (the only writer of case.status)
src/server/worker/     SLA sweep, every 60 s from instrumentation.ts
src/server/messaging/  Reply/Push gateway (real LINE or simulator outbox)
src/server/queries/    read models for pages
src/app/(app)/         staff web app
src/app/simulator/     LINE Simulator for testers
src/app/liff/register  registration + PDPA consent (LIFF)
```
