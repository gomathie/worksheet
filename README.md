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
- Roles are **admin** and **employee**. Admins do everything *except* approve expense vouchers;
  employees are governed by per-person **rights** an admin assigns: add / edit / delete own entries
  (three separate rights), view dashboard, view monthly reports, view own remuneration, view own
  payslip, record paid leave, file expenses, review expenses, expense finance, and approve
  expenses. **`approve_expenses` is the one right the admin role does not imply** — it must be
  granted deliberately, so approval authority can also be withheld from an administrator.
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

### Expense vouchers
Employees declare business expenses — including those with **no receipt** — and route them through
approval to payment.

- **Filing:** voucher number is auto-generated (`EV-2026-0007`); fields are employee, department,
  date of expense, date submitted, category, purpose, vendor (optional), amount, currency, payment
  method (Cash / Mobile Money / Bank / Card / Other), and whether a receipt exists. Vouchers can be
  saved as a **draft** and submitted later.
- **No receipt:** the form reveals a **reason** box and the **employee declaration**, which must be
  explicitly accepted before submission. The accepted wording is snapshotted onto the voucher, so
  later edits to the template can't rewrite what somebody agreed to.
- **Receipts:** file upload (PDF / JPG / JPEG / PNG, max 10 MB) is built but **currently switched
  off** — see *Receipt attachments* below to enable it.
- **Workflow:** Draft → Submitted → Manager Review → Finance Review → Awaiting Admin Approval →
  Approved → Recorded, with Rejected reachable from any review stage and a *request more
  information* path back to draft. Every decision records approver, date, decision, and comments.
  Rejections require a comment.
- **Approval is a granted right, not a role.** `approve_expenses` is the **only** right the admin
  role does not carry automatically — an approver is an administrator who has also been ticked
  for it in the Employees tab. An admin without it can see everything and change nothing about
  approval. Nothing reaches *Approved* by any other route, including when both optional workflow
  steps are switched off.
- **Finance does not approve.** The `finance_expenses` holder reviews a voucher and either
  **requests approval** from an approver or returns it for more information. Once an approver has
  approved it, finance enters it into the external accounting system and **marks it recorded**
  (with an optional finance-record reference). Recording is impossible before approval — enforced
  server-side, not just hidden in the UI.
- **Roles** otherwise reuse the existing rights model rather than adding account types:
  *file expenses*, *review expenses* (manager — scoped to that person's **direct reports** only,
  and never their own voucher), and *expense finance*. Set a person's **Reports to** in the
  Employees tab to make them a manager.
- **Which steps apply** is configurable in Settings (manager and/or finance can each be switched
  off). Employees with no manager assigned skip the manager step, so nothing waits in an unowned queue.
- **Dashboard & reports:** pending / approved / rejected / recorded counts, month-to-date total,
  breakdowns by category and employee, and a missing-receipt count. Six reports — monthly,
  department, employee, missing receipts, outstanding reimbursements, approved vs rejected — each
  exportable as **CSV**, **Excel**, or **PDF** (print).
- **Voucher PDF (after approval only):** an approved or recorded voucher has a **Download PDF**
  button that prints a single-page A4 document — employee and code, department, dates, category,
  payment method, amount, purpose, the missing-receipt reason and declaration where applicable,
  who gave final approval and when, the full approval history, the external finance reference
  once recorded, and signature lines. It is meant to be filed in the external accounting system
  as supporting evidence, which is why it is withheld before approval: an unapproved voucher must
  not be able to produce a document that reads as an approved receipt.
- **Search & filter** by employee, department, date range, category, status, receipt availability,
  amount range, and free text over voucher number / description / vendor.
- **Audit trail:** every create, edit (field-by-field, with previous and new value), submit,
  decision, payment, and attachment change. The table is **append-only, enforced by SQLite
  triggers** — `UPDATE` and `DELETE` are rejected by the database, not merely avoided in code.
- **Editing lock:** approved and recorded vouchers are frozen; an administrator must explicitly
  **reopen** one before it can change again (which also clears the recorded marker).
- **Notifications:** in-app (header bell) plus email on submission, escalation to an approver,
  approval, rejection, recording, and requests for more information.

### Receipt attachments (R2) — currently off
Receipt **file uploads are disabled**: no R2 bucket is bound in `wrangler.toml`. Everything else
in the module works unchanged — vouchers still record whether a receipt exists, and the
missing-receipt reason + declaration flow is unaffected. With uploads off, ticking *receipt
available* means "a paper or emailed receipt exists"; the UI hides the upload control rather than
offering one that would fail.

To enable it later, create the bucket and uncomment the `[[r2_buckets]]` block in `wrangler.toml`:

```bash
wrangler r2 bucket create ledger-receipts
wrangler r2 bucket create ledger-receipts-preview   # for preview deployments
```

No code changes are needed — the API detects the binding at runtime (`/api/me` reports
`attachments_enabled`), and `wrangler pages dev` creates a local stand-in automatically.

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
functions/api/[[route]].ts   Pages Functions catch-all — routing + the core JSON API
server/                      Worker-side helpers (auth, settings, email/SMTP, http)
server/expenses.ts           Expense voucher handlers (workflow, attachments, reports)
server/notify.ts             In-app notifications, with email layered on top
shared/logic.ts              Pure calculation logic (hours, points, aggregation)
shared/expenses.ts           Pure expense rules (state machine, validation, summaries)
src/                         Vue 3 app (views, stores, router, components)
src/csv.ts, src/xls.ts       Dependency-free CSV and Excel (SpreadsheetML) writers
migrations/                  D1 SQL migrations
tests/                       Vitest tests for shared/logic.ts and shared/expenses.ts
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
(`npm run db:migrate:local` / `npm run db:migrate:prod`). Tables: employees, departments, work
types and assignments, entries and their per-type items, adjustments (bonuses/reimbursements),
payments, absences, expense vouchers (with categories, approvals, attachments, audit logs), in-app
notifications, settings, and the audit log. Money-sensitive data is filtered server-side for
non-admins.

> **Migrations that contain `CREATE TRIGGER` (or other `BEGIN … END` blocks) fail on
> `db:migrate:prod`.** The remote endpoint used by `wrangler d1 migrations apply --remote` splits SQL
> naively on `;` and reports `incomplete input: SQLITE_ERROR [code: 7500]` on the semicolon inside
> the trigger body. `--local` is unaffected (it uses a proper splitter). Workaround for such a
> migration:
>
> ```bash
> # 1) apply it with the file path (this splitter handles triggers)
> npx wrangler d1 execute ledger-db --remote --file migrations/NNNN_name.sql
> # 2) record it so wrangler won't retry it
> npx wrangler d1 execute ledger-db --remote \
>   --command "INSERT INTO d1_migrations (name, applied_at) VALUES ('NNNN_name.sql', datetime('now'))"
> # 3) confirm
> npx wrangler d1 migrations list ledger-db --remote   # "No migrations to apply!"
> ```
>
> Prefer keeping triggers out of migrations where practical to avoid this.

## Time zone

Dates are stored as `YYYY-MM-DD` in the team's local time. `TEAM_TZ` in `wrangler.toml` (default
`Africa/Accra`) controls what "today" means server-side.

## Not yet built

Month-end **locking with rate snapshots** (freeze past reports at the rates they were paid at) is
the main remaining item. Emailed login / password reset would build on the SMTP setup.
