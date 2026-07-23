# Build Prompt — Timesheet & QAP Tracker (Vue + Cloudflare)

Copy everything below this line into your coding agent (Claude Code, Cursor, etc.).

---

## Your task

Build and deploy a small production web app called **Ledger** — a timesheet and performance tracker for a small team. The admin adds employees, employees log their daily work, and the admin sees monthly dashboards and prints monthly reports. Host it on Cloudflare.

Deliver a running, deployed URL plus the source repo. Do not ask me to run local commands — do all setup, migrations, and deployment yourself using the Cloudflare CLI (`wrangler`). If you need me to authenticate `wrangler` or provide an API token, ask once, up front, with the exact command to run.

---

## Stack (use exactly this)

- **Frontend:** Vue 3 (Composition API, `<script setup>`) + Vite + TypeScript
- **Styling:** Tailwind CSS. No component library — keep the design clean and custom (see design notes below).
- **State:** Pinia
- **Router:** Vue Router
- **Backend:** Cloudflare Workers (single Worker exposing a JSON API under `/api/*`)
- **Database:** Cloudflare D1 (SQLite). Use migrations in `migrations/`.
- **Auth:** Cloudflare Access in front of `/admin/*` routes for now; employees get a shareable magic link (email token stored in D1, no password). If Cloudflare Access is too heavy for a first pass, use a simple email + one-time code login backed by D1 and Workers KV for sessions — pick one and document it.
- **Hosting:** Cloudflare Pages for the Vue build + a Pages Function or bound Worker for the API. Use a single `wrangler.toml` at the repo root.
- **Charting:** Chart.js via `vue-chartjs`.

---

## Data model (D1 schema)

```sql
CREATE TABLE employees (
  id          TEXT PRIMARY KEY,       -- uuid
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,            -- used for employee login
  role        TEXT NOT NULL DEFAULT 'employee',  -- 'admin' | 'employee'
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE entries (
  id               TEXT PRIMARY KEY,
  employee_id      TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date        TEXT NOT NULL,     -- YYYY-MM-DD
  time_start       TEXT NOT NULL,     -- HH:MM
  time_end         TEXT NOT NULL,     -- HH:MM
  hours            REAL NOT NULL,     -- computed server-side; overnight = end + 24h
  classifications  INTEGER NOT NULL DEFAULT 0,
  qap              INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entries_employee_date ON entries(employee_id, work_date);
CREATE INDEX idx_entries_date ON entries(work_date);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
-- Seed with: points_per_classification=1, points_per_qap=1, point_value=1, currency='$'

CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  action      TEXT NOT NULL,          -- 'create_entry' | 'update_entry' | 'delete_entry' | 'update_settings' | ...
  target_id   TEXT,
  meta        TEXT,                    -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## API surface (Workers)

All endpoints return JSON. Auth: session cookie or bearer token — your call, but be consistent.

- `POST /api/auth/login` — `{ email }` → send/return a one-time code
- `POST /api/auth/verify` — `{ email, code }` → session
- `POST /api/auth/logout`
- `GET  /api/me` → current user (role, name)

**Employees** (admin only for mutations)
- `GET    /api/employees`
- `POST   /api/employees` — `{ name, email, role? }`
- `PATCH  /api/employees/:id`
- `DELETE /api/employees/:id` — soft-delete (`active=0`)

**Entries**
- `GET    /api/entries?month=YYYY-MM&employee_id=…` — employees see their own; admin sees all
- `POST   /api/entries` — server computes `hours` from start/end
- `PATCH  /api/entries/:id`
- `DELETE /api/entries/:id`

**Settings** (admin only for writes)
- `GET  /api/settings`
- `PUT  /api/settings` — `{ points_per_classification, points_per_qap, point_value, currency }`

**Reports**
- `GET /api/reports/monthly?month=YYYY-MM` → aggregate: totals, per-person summary, daily breakdown. Server computes points and remuneration using current settings.

---

## Feature spec

### Roles

- **Admin:** manages employees, sees everyone's entries, edits any entry, controls settings, views dashboard and reports.
- **Employee:** logs and edits **their own** entries only. Can see their own monthly summary. Cannot see other employees' data or change settings.

Enforce this on the **server**, not just the UI.

### Time entry (main employee page)

Form fields: Employee (locked to the logged-in user; admin can pick), Date, Time start, Time end, Classifications (int ≥ 0), QAP (int ≥ 0), Notes (optional). Hours field is read-only and updates as start/end change.

Hours calculation: `((end - start) mod 24)` in hours, rounded to 2 decimals. If end < start, treat as overnight and add 24h. Do this on the server too.

Below the form: a filterable table of recent entries with edit/delete actions. Filter by month and (admin only) employee.

### Dashboard (admin)

Month picker at top. Shows:

- Big stats: total hours, classifications, QAP, points, estimated remuneration
- Per-person summary table: days worked, hours, classifications, QAP, points, remuneration
- Bar chart: classifications & QAP per day of month (two series)
- Daily detail table: date × employee × hours × classifications × QAP

### Monthly Report (admin)

Month picker. Clean, print-optimized page (landscape). Header with month + generated date, per-person table with totals row, daily detail, and a rate footnote (e.g. "Rates applied: 1 point per classification, 1 per QAP, $1.00 per point"). "Print / Save as PDF" button that triggers `window.print()`. Include a `@media print` stylesheet that hides nav and buttons.

### Settings (admin)

Four inputs: points per classification, points per QAP, value per point, currency symbol. Saving updates D1 and every downstream calculation.

---

## Points & remuneration logic

Compute **on the server** for reports (never trust client math):

```
points = classifications * points_per_classification + qap * points_per_qap
remuneration = points * point_value
```

Return numbers as numbers; the client formats display strings using the currency symbol.

---

## Design notes

Aim for something more distinctive than a Bootstrap-y default. Editorial/almanac feel:

- Palette: cream background `#F6F4EE`, ink `#1E2124`, teal accent `#0F5C4C`, amber accent `#C98A2C`, subtle borders `#E2DFD5`.
- Typography: **Barlow Condensed** (700) for uppercase headings, **Inter** for body, **IBM Plex Mono** for numbers/data.
- Layout: max width ~1180px, generous whitespace, thin 1px borders instead of heavy shadows.
- Rounded corners 8–10px, not pill-shaped.
- Data tables: uppercase headers in Barlow Condensed, numeric columns right-aligned in monospace.
- Buttons: 2px solid outline, uppercase Barlow Condensed labels.
- One accent visual on the dashboard — e.g. a circular teal "stamp" element displaying total hours — to break the grid.

Fully responsive; tables get horizontal scroll on mobile.

---

## Cloudflare deployment

- Repo layout: `/apps/web` (Vue), `/apps/api` (Worker) or a single project with `functions/api/[[route]].ts` if you use Pages Functions.
- `wrangler.toml` binds: `DB` (D1), `SESSIONS` (KV, if used), and any secrets.
- Provide two D1 environments: `preview` and `production`.
- Set up GitHub → Cloudflare Pages auto-deploy on `main`.
- Add these scripts to root `package.json`: `dev`, `build`, `db:migrate:local`, `db:migrate:prod`, `deploy`.
- Create the D1 database via `wrangler d1 create ledger-db`, run migrations, and deploy.
- After deploy, seed one admin user (prompt me for name + email once) and print the login URL.

---

## Deliverables

1. Public URL of the deployed app on Cloudflare.
2. GitHub repo URL with clear README covering local dev, migrations, and deploy.
3. First admin login credentials (or magic-link instructions).
4. A short list of anything you skipped, faked, or hardcoded, and why.

---

## Constraints / preferences

- No paid third-party services. Cloudflare tier only.
- Keep dependencies lean. If you're tempted to add a UI kit or a form library, don't.
- Every mutation goes through a server endpoint that verifies role. No client-side-only permission checks.
- Time zones: store dates as `YYYY-MM-DD` strings interpreted in the team's local time. Add a `TEAM_TZ` env var (default `Africa/Accra`) and use it when computing "today" on the server.
- Write tests for the hours calculation and the points/remuneration aggregation. Vitest is fine.

Ship it.
