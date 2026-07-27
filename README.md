# OpenSignal Ledger — Team Timesheet & Tracker

A small production web app for a team: employees log daily hours and work output, and the app turns
that into a points-based pay calculation with bonuses, reimbursements, payslips, and payment
tracking. Admins add employees, assign what each can do, and get dashboards, reports, and a
printable monthly report. Installable as a PWA.

**Stack:** Vue 3 (`<script setup>`) + Vite + TypeScript · Tailwind CSS 4 · Pinia · Vue Router ·
Chart.js (`vue-chartjs`) · Cloudflare Pages + Pages Functions · Cloudflare D1 (SQLite) · Workers KV
(sessions). No paid third-party services — Cloudflare tier only.

---

## What it does

### Accounts, roles & rights
- **Login** is username + password (PBKDF2 hashing); sessions live in Workers KV. The header
  **Account menu** holds the name/role, self-service **Change password**, and **Sign out**.
- Roles are **admin** and **employee**. Admins do everything; employees are governed by per-person
  **rights** an admin assigns: add / edit / delete own entries (three separate rights), view
  dashboard, view monthly reports, view own remuneration, view own payslip, and record paid leave.
- All permission checks are enforced **server-side**, not just hidden in the UI. New rights default
  off; existing employees keep prior behaviour until an admin re-saves them.

### Work types & rates
- Admins define **work types** in Settings, each worth **points per unit** (e.g. Classification,
  QAP, Graphic design, Social media post); types can be activated/deactivated.
- Each employee is **assigned** the types they may log (enforced server-side); staff with no
  countable types are tracked by hours + notes. An employee can also have per-type **custom rate
  overrides** on top of the general rate.
- **value per point** and **currency symbol** convert points to money.

### Time entry
- Log a day: employee, date, start/end (overnight supported, hours auto-computed), **units per
  assigned work type**, notes. Admins can log for anyone.
- **Per-day entry limit:** a global default (0 = unlimited) plus optional per-employee overrides;
  employees can't exceed their cap (admins exempt).
- **Approval workflow (opt-in):** when enabled, employee entries start *pending* and count toward
  pay only once an admin approves; admin-logged entries auto-approve. Editing re-queues for approval.

### Dashboard, reports & payslips
- **Dashboard:** monthly totals, per-type stat cards, a daily bar chart, per-person summary.
  Employees see the team's work performance but money **only for themselves** — rates and
  colleagues' pay are never exposed to non-admins.
- **Monthly Report:** printable per-person report with base/bonus/reimbursement/total for admins,
  plus **CSV export** of the summary and daily detail.
- **Payslip:** printable per-person statement (work done, base, itemised bonuses/reimbursements,
  total due, paid/confirmed status). Employees see their own; admins can print anyone's.
- **Trends:** per-employee charts over the last 3 / 6 / 12 months.

### Payments
Admins add **bonuses** (with a description); employees request **reimbursements** (admin
approves/rejects — only approved count); admins **mark paid** and employees **confirm receipt**.

### Absences & leave
Record days not worked by type — **Leave, Sick, Holiday, Unpaid, Other**. Sick/holiday/unpaid/other
are open to all; **paid Leave requires the assigned right**. Each employee can have an **annual leave
allowance** with used/remaining balance.

### Email notifications (SMTP)
Point the app at any SMTP server (port 587 STARTTLS or 465 TLS) in Settings. It emails employees
when marked paid or a reimbursement is decided, and alerts admins on new requests. Password is
stored write-only; a **Send test email** button verifies the config.

### Admin extras
**Settings** (work types, value per point, currency, per-day limit, approval toggle, SMTP, and a
full-database **JSON backup** with passwords excluded) and an **Activity log** — every change with
actor and timestamp.

### Points & remuneration formula
```
points     = Σ (units of a work type × that type's points-per-unit, using employee overrides)
base pay   = points × value_per_point
total due  = base pay + approved bonuses + approved reimbursements
```
Only **approved** entries count. Changing a rate recomputes figures (no historical rate locking yet).

---

## Repo layout

```
functions/api/[[route]].ts   Pages Functions catch-all — the whole JSON API
server/                      Worker-side helpers (auth, settings, email/SMTP, http)
shared/logic.ts              Pure calculation logic (hours, points, aggregation)
src/                         Vue 3 app (views, stores, router, components)
migrations/                  D1 SQL migrations
tests/                       Vitest tests for shared/logic.ts
scripts/                     Helpers (seed admin, generate PWA icons)
```

## Local development

```bash
npm install
npm run db:migrate:local     # apply migrations to the local D1 DB
npm run dev                  # builds + wrangler pages dev on :8788
```

`npm run dev:web` runs plain Vite on :5173 with `/api` proxied to :8788 for UI hot reload (keep
`npm run dev` running in another terminal). Run tests with `npm test`.

The first admin needs a username and password. Once one admin exists, create the rest from the
**Employees** tab. `scripts/seed-admin.sh "Name" email` inserts an admin row; set that account's
username/password via the app (or a `wrangler d1 execute` UPDATE with a PBKDF2 hash).

## Deploy (Cloudflare)

One-time setup — requires a logged-in wrangler (`npx wrangler login`) or `CLOUDFLARE_API_TOKEN`:

```bash
npx wrangler d1 create ledger-db            # paste database_id into wrangler.toml
npx wrangler kv namespace create SESSIONS   # paste id into wrangler.toml
npm run db:migrate:prod
npm run deploy                              # builds + wrangler pages deploy
```

**Auto-deploy from GitHub:** Cloudflare dashboard → Workers & Pages → ledger → Settings → Builds →
connect the repo; production branch `main`, build command `npm run build`, output directory `dist`.
Pushing to `main` then builds and deploys automatically. The committed `wrangler.toml` carries the
bindings (`DB`, `SESSIONS`) and the `TEAM_TZ` var.

## Migrations

Plain SQL in `migrations/`, applied with wrangler's migration tracking
(`npm run db:migrate:local` / `npm run db:migrate:prod`). Tables: employees, work types and
assignments, entries and their per-type items, adjustments (bonuses/reimbursements), payments,
absences, settings, and the audit log. Money-sensitive data is filtered server-side for non-admins.

## Time zone

Dates are stored as `YYYY-MM-DD` in the team's local time. `TEAM_TZ` in `wrangler.toml` (default
`Africa/Accra`) controls what "today" means server-side.

## Not yet built

Month-end **locking with rate snapshots** (freeze past reports at the rates they were paid at) is
the main remaining item. Emailed login / password reset would build on the SMTP setup.
