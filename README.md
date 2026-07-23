# Ledger — Timesheet & QAP Tracker

A small production web app for a small team: the admin adds employees, employees
log daily work (hours, classifications, QAP), and the admin gets monthly
dashboards and print-ready reports.

**Stack:** Vue 3 (`<script setup>`) + Vite + TypeScript · Tailwind CSS 4 · Pinia ·
Vue Router · Chart.js (`vue-chartjs`) · Cloudflare Pages + Pages Functions ·
Cloudflare D1 (SQLite) · Workers KV (sessions).

## How auth works

Email + one-time code, backed by D1 with KV sessions (chosen over Cloudflare
Access to keep the first pass light — documented per spec):

1. `POST /api/auth/login { email }` — if the email belongs to an active employee,
   a 6-digit code is stored in D1 (10-minute expiry). **No email provider is
   wired up yet**, so the code is returned in the response and shown on the login
   screen. Swap `handleLogin` in `functions/api/[[route]].ts` to send email
   (e.g. MailChannels) when ready.
2. `POST /api/auth/verify { email, code }` — creates a 30-day session in KV and
   sets an HttpOnly cookie.

All role checks (admin vs employee) are enforced server-side in the Worker; the
UI merely hides what you can't do. Every mutation is written to `audit_log`.

## Repo layout

```
functions/api/[[route]].ts   Pages Functions catch-all — the whole JSON API
server/                      Worker-side helpers (auth, settings, http)
shared/logic.ts              Pure calculation logic (hours, points, aggregation)
src/                         Vue 3 app (views, stores, router, components)
migrations/                  D1 SQL migrations
tests/                       Vitest tests for shared/logic.ts
scripts/seed-admin.sh        Seed the first admin user
```

## Local development

```bash
npm install
npx wrangler d1 migrations apply ledger-db --local   # or: npm run db:migrate:local
./scripts/seed-admin.sh "Your Name" you@example.com  # local admin
npm run dev                                          # builds + wrangler pages dev on :8788
```

`npm run dev:web` runs plain Vite on :5173 with `/api` proxied to :8788 if you
want hot reload for UI work (keep `npm run dev` running in another terminal).

Run tests: `npm test`

## Deploy (Cloudflare)

One-time setup — requires a logged-in wrangler (`npx wrangler login`) or a
`CLOUDFLARE_API_TOKEN` env var:

```bash
npx wrangler d1 create ledger-db            # paste database_id into wrangler.toml
npx wrangler d1 create ledger-db-preview    # paste into [env.preview] block
npx wrangler kv namespace create SESSIONS   # paste id into wrangler.toml
npx wrangler kv namespace create SESSIONS --env preview
npm run db:migrate:prod
npm run deploy                              # builds + wrangler pages deploy
./scripts/seed-admin.sh "Your Name" you@example.com --remote
```

Auto-deploy from GitHub: in the Cloudflare dashboard → Workers & Pages →
ledger → Settings → Builds, connect the GitHub repo; production branch `main`,
build command `npm run build`, output directory `dist`. The committed
`wrangler.toml` carries the bindings.

## Migrations

Plain SQL files in `migrations/`, applied with wrangler's built-in migration
tracking: `npm run db:migrate:local` / `npm run db:migrate:prod`.

## Settings

`points_per_classification`, `points_per_qap`, `point_value`, `currency` live in
the `settings` table (editable in the UI by admins). Reports always compute
points and remuneration server-side from current settings:

```
points       = classifications * points_per_classification + qap * points_per_qap
remuneration = points * point_value
```

## Time zone

Dates are stored as `YYYY-MM-DD` strings in the team's local time. The
`TEAM_TZ` var in `wrangler.toml` (default `Africa/Accra`) controls what "today"
means server-side.
