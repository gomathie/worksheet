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
- Three roles: **admin**, **manager**, and **employee**.
  - **Admin** can do everything *except* approve expense vouchers and approve new user accounts —
    those two authorities must be granted explicitly.
  - **Manager** implies nothing on its own — it seeds sensible defaults when the account is created,
    and the administrator tunes rights from there.
  - **Employee** is governed by per-person **rights** an admin assigns.
- Assignable rights: add / edit / delete own entries (three separate rights), view dashboard, view
  monthly reports, view own remuneration, view own payslip, record paid leave, direct counts
  (type Classification/QAP counts instead of logging cards), file expenses, review expenses,
  expense finance, approve expenses, add users, approve users, and use petty cash.
  **`approve_expenses` and `approve_users` are the two rights the admin role does not imply** —
  they must be granted deliberately so approval authority can be withheld from an administrator.
- All permission checks are enforced **server-side**, not just hidden in the UI. New rights default
  off; existing employees keep prior behaviour until an admin re-saves them.

### Data scopes
Each employee is assigned a **data scope** that decides whose records they can see:

| Scope | Sees |
|---|---|
| `own` (default) | Only their own records |
| `direct_reports` | Own plus anyone whose `manager_id` is them |
| `department` | Everyone in the same department |
| `all` | Everyone |

Admins see everything regardless of the stored scope. The scope is enforced server-side across all
list endpoints that can return other people's records.

### User approval
- Anyone holding `add_users` can propose a new account. Unless the proposer is an administrator, the
  account lands **pending** — it cannot sign in and stays invisible to the rest of the app.
- Someone holding `approve_users` (which requires the admin role) approves or rejects it. Rejections
  require a note. Non-admin proposers can only create ordinary employees — role, rights, and data
  scope are set by an administrator after approval.
- The Approvals page doubles as both the expense approval queue and the user approval queue.

### Employee codes
Each employee gets an auto-generated human-readable **staff code** (e.g. `EMP-001`) shown on the
team list and payslips. The prefix is configurable in Settings (`employee_code_prefix`). Codes are
generated sequentially and are unique.

### Work types & rates
- Admins define **work types** in Settings, each worth **points per unit** (e.g. Classification,
  QAP, Graphic design, Social media post); types can be activated/deactivated.
- Work types can be **card-based**: instead of typing a unit count, the employee logs individual
  cards (card name, total audits, time completed). The unit count equals the number of cards; all
  reporting and points logic is unchanged. Employees with the `direct_counts` right may type the
  number directly instead of logging cards.
- Each employee is **assigned** the types they may log (enforced server-side); staff with no
  countable types are tracked by hours + notes. An employee can also have per-type **custom rate
  overrides** on top of the general rate.
- **value per point** and **currency symbol** convert points to money.

### Time entry
- Log a day: employee, date, start/end (overnight supported, hours auto-computed), **units per
  assigned work type** (or individual cards for card-based types), notes. Admins can log for anyone.
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
  total due, paid/confirmed status, employee code). Employees see their own; admins can print
  anyone's.
- **Trends:** per-employee charts over the last 3 / 6 / 12 months.

### Month-end locking
Admins can **lock a month**, which freezes both the data and the rates. The lock captures a
**rate snapshot** (point value, currency, per-work-type points, per-employee overrides) as JSON, so
later rate changes never alter a locked month's report or payslips. The API also rejects
entry/adjustment changes for a locked month, so the frozen figures cannot drift. A locked month can
be unlocked if corrections are needed.

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

- **Filing:** voucher number is auto-generated (`COH-EXP-2026-0007`); fields are employee, department,
  date of expense, date submitted, category, purpose, vendor (optional), amount, currency, payment
  method (Cash / Mobile Money / Bank / Card / Other), and whether a receipt exists. Vouchers can be
  saved as a **draft** and submitted later.
- **The declaration is the point.** A voucher exists *because* no receipt was issued — where a
  receipt exists there is nothing to declare and no voucher is needed. So the **reason** and the
  **employee declaration** are always required before submission; there is no "do you have a
  receipt?" question. The accepted wording is snapshotted onto the voucher, so later edits to the
  template can't rewrite what somebody agreed to.
- **Supporting documents:** optional file upload (PDF / JPG / JPEG / PNG, max 10 MB) for anything
  that corroborates the claim. Built but **currently switched off** — see *Receipt attachments*
  below to enable it.
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
  and breakdowns by category and employee. Five reports — monthly, department, employee,
  outstanding reimbursements, approved vs rejected — each exportable as **CSV**, **Excel**, or
  **PDF** (print).
- **Voucher PDF (after approval only):** an approved or recorded voucher has a **Download PDF**
  button that prints a single-page A4 **receipt** — laid out as a payment voucher with dotted
  leaders, the total, whether it was funded from petty cash or the employee's own pocket, the
  missing-receipt reason and declaration, an APPROVED stamp carrying the approver, date and voucher
  number, the external finance reference once recorded, and signature lines for **Initiator** and
  **Approved by** with both names already printed on the rule. It is meant to be filed in the
  external accounting system as supporting evidence, which is why it is withheld before approval:
  an unapproved voucher must not be able to produce a document that reads as an approved receipt.
  Printing is portrait for as long as a voucher page is open, so the browser's own Ctrl+P gives the
  same output as the button.
- **Duplicate detection:** because a voucher is filed without a receipt, near-identical claims are
  the one thing that can be checked mechanically. A claim is flagged when the **same employee** has
  another for the **same amount within 3 days**. Rejected claims are never candidates — refiling a
  rejected claim is the process working. Flagged vouchers show a *Possible duplicate* badge in the
  review queues and list the matching claims on the voucher page. It informs the reviewer; it never
  blocks a submission.
- **Duplicate a voucher:** one tap copies a voucher into a fresh draft — useful for recurring claims
  like a weekly fare. Everything carries over except the dates and the declaration: accepting the
  declaration is a statement about one specific expense, so it must be accepted again.
- **Monthly audit pack:** one button produces a cover sheet listing every settled voucher for a month
  with a total, followed by each voucher on its own page, as a single PDF to file with the accounts.
  Only *approved* and *recorded* vouchers are included — anything still in flight has no standing as
  evidence, and the API enforces that as well as the UI.
- **Search & filter** by employee, department, month, category, status, and free text over
  voucher number / description / vendor.
- **Audit trail:** every create, edit (field-by-field, with previous and new value), submit,
  decision, payment, and attachment change. The table is **append-only, enforced by SQLite
  triggers** — `UPDATE` and `DELETE` are rejected by the database, not merely avoided in code.
- **Editing lock:** approved and recorded vouchers are frozen; an administrator must explicitly
  **reopen** one before it can change again (which also clears the recorded marker).

### Petty cash
An administrator hands an employee a cash float; the employee spends it and files vouchers
against it.

- **`use_petty_cash` is an assigned right** — only holders can be issued a float or charge a
  voucher to one. Issuing, recovering and correcting floats is **admin-only**.
- **The balance is derived, never stored:** `SUM(ledger movements) − SUM(petty-cash vouchers in
  play)`. "In play" is every status except *draft* and *rejected*, so a claim that is rejected,
  returned to draft or reopened automatically puts the money back with no compensating entry to
  get wrong — the figure cannot drift from the vouchers.
- **On the voucher form**, holders get a *Paid from the petty cash I am holding* tick box showing
  their current balance. Submitting reduces it; the printed receipt records whether the expense
  came from the float or the employee's own pocket.
- **Guards:** a claim larger than the float is refused at submission (not while drafting — the
  top-up may not be recorded yet), handing back more than is held is refused in favour of an
  adjustment, and re-submitting an already-counted claim never double-charges.
- **Top-up requests:** a float holder asks for more cash (one open request at a time); an
  administrator confirms **what was actually handed over and how** — Cash or Mobile Money, with an
  optional reference such as a MoMo transaction id. The confirmed amount may differ from the amount
  requested, and only the confirmed figure reaches the ledger. Declining requires a note. A pending
  or declined request never moves the balance.
- **Petty Cash tab:** your balance, your movements (with how each was paid), your open request, and
  every voucher charged to your float (drafts and rejected ones greyed out). Admins additionally see
  every float, the pending request queue, and the direct issue/recover form.

### Notifications
- **In-app:** a header bell icon with unread count. Notifications are sent on key events —
  expense submissions, approvals, rejections, recording, requests for more information, payment
  marks, reimbursement decisions, and user approval decisions.
- **Web Push:** payload-less push notifications via VAPID (RFC 8292), sent directly from the Worker
  with no third-party service. The service worker wakes, fetches `/api/notifications`, and shows
  the newest unread. Nothing sensitive passes through the push service. VAPID keys are generated on
  first use and stored in the database. iOS requires installing the PWA to the home screen.
- **Email (SMTP):** point the app at any SMTP server (port 587 STARTTLS or 465 TLS) in Settings.
  Password is stored write-only; a **Send test email** button verifies the config.

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

### Admin extras
**Settings** (work types, value per point, currency, employee code prefix, per-day limit, approval
toggle, SMTP, and a full-database **JSON backup** with passwords excluded) and an **Activity log**
— every change with actor and timestamp.

### Points & remuneration formula
```
points     = Σ (units of a work type × that type's points-per-unit, using employee overrides)
base pay   = points × value_per_point
total due  = base pay + approved bonuses + approved reimbursements
```
Only **approved** entries count. When a month is **locked**, its rate snapshot is used instead of
current rates. Unlocked months use the live rates.

---

## Repo layout

```
functions/api/[[route]].ts   Pages Functions catch-all — routing + the core JSON API
server/                      Worker-side helpers
  auth.ts                    Authentication, session management, PBKDF2 hashing
  env.ts                     Cloudflare bindings and environment types
  expenses.ts                Expense voucher handlers (workflow, attachments, reports)
  notify.ts                  In-app notifications, with email layered on top
  pettycash.ts               Petty cash float ledger, top-up requests
  push.ts                    Web Push (VAPID signing, subscription management)
  scope.ts                   Data-scope filtering (own / direct_reports / department / all)
  settings.ts                Global settings reader/writer
  users.ts                   New-user proposal and approval workflow
  http.ts                    HTTP helpers (JSON parsing, error responses)
  email.ts                   SMTP email sender
shared/                      Pure logic shared between server and client
  logic.ts                   Hours, points, and aggregation calculations
  expenses.ts                Expense state machine, validation, summaries
src/                         Vue 3 app
  App.vue                    Shell, navigation, account menu
  api.ts                     Fetch wrapper for /api calls
  push.ts                    Browser-side Web Push subscription
  csv.ts                     Dependency-free CSV writer
  xls.ts                     Dependency-free Excel (SpreadsheetML) writer
  usePortraitPrint.ts        Portrait print layout composable
  types.ts                   TypeScript type definitions
  stores/auth.ts             Pinia auth store (session, rights, role)
  router/index.ts            Vue Router with auth/right/role guards
  views/                     19 page-level components (see below)
  components/                Reusable components (charts, notification bell, etc.)
public/                      PWA assets (manifest, service worker, icons)
migrations/                  D1 SQL migrations (17 files, 0001–0015)
tests/                       Vitest tests for shared/logic.ts and shared/expenses.ts
scripts/                     Helpers (seed admin, generate PWA icons)
```

### Views

| View | Route | Access |
|---|---|---|
| `LoginView` | `/login` | Public |
| `EntriesView` | `/` | Authenticated |
| `DashboardView` | `/dashboard` | `view_dashboard` |
| `ReportView` | `/report` | `view_reports` |
| `PaymentsView` | `/payments` | Authenticated |
| `PayslipView` | `/payslip` | `view_payslip` |
| `TrendsView` | `/trends` | Authenticated |
| `AbsencesView` | `/absences` | Authenticated |
| `ExpensesView` | `/expenses` | Authenticated |
| `ExpenseFormView` | `/expenses/new`, `/expenses/:id/edit` | Authenticated |
| `ExpenseDetailView` | `/expenses/:id` | Authenticated |
| `ExpenseApprovalsView` | `/expenses/approvals` | `review_expenses` / `approve_expenses` / `approve_users` / `add_users` |
| `ExpenseFinanceView` | `/expenses/finance` | `finance_expenses` |
| `ExpensePackView` | `/expenses/pack` | Authenticated |
| `ExpenseReportsView` | `/expenses/reports` | Authenticated |
| `PettyCashView` | `/petty-cash` | `use_petty_cash` or admin |
| `EmployeesView` | `/employees` | Admin |
| `SettingsView` | `/settings` | Admin |
| `AuditView` | `/activity` | Admin |

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
(`npm run db:migrate:local` / `npm run db:migrate:prod`). 17 migration files covering: employees,
departments, work types and assignments, entries and their per-type items, entry cards (card-based
work types), adjustments (bonuses/reimbursements), payments, absences, expense vouchers (with
categories, approvals, attachments, audit logs), petty cash (ledger and top-up requests), in-app
notifications, push subscriptions, month locks (with rate snapshots), employee codes, manager role
and data scopes, user approval workflow, settings, and the audit log. Money-sensitive data is
filtered server-side for non-admins.

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
>
> Migration **0009** contains the `expense_audit_logs` append-only triggers, so it needs this
> workaround on the remote database.

> **Two migration numbers are used twice** — `0010_employee_code` / `0010_expense_approval_right`,
> and `0012_entry_cards` / `0012_manager_role_user_approval`. They came from parallel work on the
> same branch. Nothing breaks: wrangler tracks migrations **by filename**, so each still applies
> exactly once, and the four are independent of one another. But the numbers no longer imply an
> order — check `ls migrations/` before naming a new file so the next one does not collide too.

## Time zone

Dates are stored as `YYYY-MM-DD` in the team's local time. `TEAM_TZ` in `wrangler.toml` (default
`Africa/Accra`) controls what "today" means server-side.

## Not yet built

Emailed login / password reset would build on the SMTP setup.
