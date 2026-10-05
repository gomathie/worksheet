# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Fix: Popups Too Wide on Desktop (`.panel` Not in a Tailwind Cascade Layer)
  - The Announcement pop-up, Task Age Alert, Task Deadline Alert, and every other modal built from `panel w-full max-w-*` were ignoring their intended width cap on desktop/wide screens and stretching to nearly the full viewport — invisible on mobile, where the cap and the viewport width were close enough not to matter.
  - Root cause: `.panel` in `src/style.css` was plain, unlayered CSS, and Tailwind v4 generates all its utility classes (`max-w-lg`, `border-red`, `bg-red-soft`, etc.) inside `@layer utilities`. Per the CSS Cascade Layers spec, unlayered styles always beat layered ones of equal specificity regardless of source order, so `.panel`'s own `max-width: 100%` always won.
  - Found the same way: a `panel ... border-red bg-red-soft text-red` error/success banner — used in dozens of views — had the identical conflict on its border and background colors (only the `text-red` text color was unaffected, since `.panel` never sets `color`). Confirmed via computed styles that these banners were rendering with a plain white/gray box instead of their intended red/teal/amber tint — a much subtler bug than the popup width one, likely why it went unnoticed.
  - Fixed by wrapping `.panel` in `@layer components`, putting it on equal cascade footing with Tailwind's utilities so a combined utility class correctly overrides it, as intended, everywhere this pattern is used.

- Feature: "Working on it" Elapsed-Time Log
  - Tapping **Working on it** now posts a comment to the task's activity feed recording how long it's been open in total, e.g. *"Marked as being worked on — 4 hours so far."* or *"...2 days so far."*, computed from when the task was created. New `POST /api/tasks/:id/ping` endpoint behind it, replacing the generic status-PATCH it used to send — same effect on the task-violation clock as before, plus the logged comment.
  - **Task violation penalty confirmed adjustable**: the admin setting already defaulted to 5 and was already freely editable up or down (including to 0 to disable) — reworded its in-app description to say so, and to point at the existing general-purpose Point Deductions tool (Employees tab → **Deduct**) for logging a one-off violation unrelated to a task, e.g. "found a mistake on this QAP card" — that tool already supported a custom reason and a custom point amount per incident; nothing new was needed there.

- Feature: Reopen Tasks & Automatic Task-Violation Point Deductions
  - **Reopen**: a Done or Cancelled task now has an explicit **Reopen** button (task list and detail page) that moves it back to To do and clears its completion date.
  - **Automatic 5-day penalty**: an open task (To do/In progress) left untouched for 5 days now automatically deducts points from its assignee's balance — no admin action required. The deduction is capped so it never pushes a balance below zero, and is recorded even when capped to 0 so there's always an audit trail.
  - **"Working on it" (and reopening) reset the clock**: both already bump the task's timestamp, which is exactly what the 5-day check is based on — no separate reset mechanism needed.
  - **Admin-configurable amount**: new **Task violation penalty (points)** field under Settings → Money & currency (default 5, set to 0 to disable). Added `migrations/0038_task_violations.sql` for the new `task_violations` table and `task_violation_points` to the settings blob.
  - **Shows up in existing audit trail**: automatic violations appear alongside manual admin deductions in **Admin → Point Deductions** (and its CSV export), tagged `"System (task violation)"`, and are included in monthly report/dashboard point totals the same way manual deductions already are.
  - No cron trigger involved (Pages Functions doesn't have one wired up here) — the check runs opportunistically whenever a task list is fetched, which happens often enough in normal use (Tasks page, the age-warning popup, an admin's full task view) to catch violations without a dedicated scheduled job.

- Fix: Task Comment Card Illegible in Dark Mode
  - The task comment card (`TaskDetailView.vue`) used a stray Tailwind `dark:` variant plus generic `bg-gray-50`/`text-foreground` classes that don't exist anywhere else in the app and aren't part of its design tokens. On a browser/OS set to dark mode, the card's background flipped dark while the comment text kept the app's fixed light-theme color, making comments unreadable; in light mode it also looked visually inconsistent with the rest of the page.
  - Replaced it with the app's existing `bg-cream`/`border-line` tokens, matching the styling already used elsewhere on the same page, and removed the dead `text-foreground` class.

- Feature: App Default Route to Dashboard
  - Changed the default root route (/) in src/router/index.ts to map to the Dashboard instead of the Time Entry page.
  - The router gracefully redirects users to the Time Entry page if they lack Dashboard access rights.

- Feature: Direct Mobile / PWA Document & PDF Sharing
  - Implemented client-side PDF generation engine (`src/pdf.ts`) using dynamically imported `html2pdf.js` to avoid bundle bloat and ensure fast initial loads.
  - Implemented native Web Share API (`navigator.share({ files: [...] })`) with desktop download fallback (`shareOrDownloadFile`, `exportOrSharePdf`).
  - Mobile phones, tablets, and standalone PWAs can now share PDFs, CSVs, and Excel spreadsheets directly to WhatsApp, Telegram, Gmail, Google Drive, or Slack.
  - Added dedicated **Share / Send PDF** action buttons across:
    - Payslip (`PayslipView.vue`)
    - Expense Voucher (`ExpenseDetailView.vue`)
    - Monthly Report (`ReportView.vue`)
    - Expense Reports (`ExpenseReportsView.vue`)
    - Expense Audit Pack (`ExpensePackView.vue`)
  - Off-screen cloning ensures full standard A4 width (portrait or landscape) and clean styling with interactive buttons hidden regardless of mobile screen width.
  - Updated CSV (`src/csv.ts`) and XLS (`src/xls.ts`) downloaders to support direct mobile sharing.
  - Added comprehensive test coverage in `tests/pdf-and-locks.test.ts`.
- Feature: Default Month-End Auto-Locking & Admin Re-Lock Workflow
  - Added `month_unlocks` table (Migration 0037) to record administrator unlock exemptions for past months.
  - Automated month-end locking: whenever a calendar month ends (`month < currentMonth`), the system treats it as locked by default. Its rate snapshot is frozen, and mutations to entries, adjustments, and bonuses are blocked server-side (`assertMonthUnlocked`).
  - Administrators can review ended months in `ReportView.vue` and click **Unlock month** to record an exemption and make necessary corrections.
  - Added amber reminder banner in `ReportView.vue` when an ended month is currently unlocked, reminding administrators to lock it back once modifications are complete.
  - Clicking **Lock month** removes the unlock exemption and re-freezes the rate snapshot in `month_locks`.
- Fix: Task API & UI Resilience ("Internal error" Prevention)
  - Hardened `server/tasks.ts` (`listTasks`, `getTask`, `createTask`, `patchTask`, `withActions`, `taskLike`) with defensive schema fallbacks and null-safe record filtering.
  - Prevents 500 "Internal error" backend exceptions on `/api/tasks` if optional columns (such as secondary assignees, recurrence, or checklist) are queried against varying database schema versions.
  - Added DevTools payload logging and friendly error handling in `TasksView.vue`.
  - Added a dedicated **Retry** button inside the error banner in `TasksView.vue` (`p.panel.mb-6.border-red.bg-red-soft.text-red`) for instant re-fetching without requiring a browser reload.
- Feature: Keep Expenses in App (Internal Expenses) & Kept in App Report
  - Added `keep_in_app`, `kept_at`, `kept_by`, and `kept_reason` fields to `expense_vouchers` (Migration 0036).
  - Added support for keeping approved vouchers inside the app instead of sending them to external accounting records:
    - Approvers can choose **Approve & Keep in app** during the final approval stage (`admin_approval`).
    - Finance recorders can choose **Keep in app** with an optional justification note from the *Expenses to record* queue (`ExpenseFinanceView.vue`).
    - Added **Keep in app** checkbox on expense creation/editing for administrators.
    - Updated voucher details with an internal expense audit banner and decision buttons.
  - Added dedicated **Kept in app (Internal expenses)** report under Expense Reports:
    - Calculates annual total expenditure kept in app for the calendar year and total voucher count.
    - Displays detailed monthly breakdown of voucher counts and amounts.
    - Detailed voucher table with voucher number, date, employee, department, category, amount, kept by, and justification reason.
    - One-click CSV, Excel, and PDF exports.
    - Added direct "Kept in app report" link from the recording queue and 5th summary card on the expense dashboard.
  - Added unit test suite in `tests/expenses.test.ts`.
- Feature: Points Deduction & Admin Penalty System
  - Added a new `point_deductions` table (Migration 0035) with append-only triggers for full immutability and audit compliance.
  - Added `manage_point_deductions` right to permissions system (implied for admins, grantable individually to non-admins).
  - Built point deductions server module (`server/deductions.ts`) providing balance queries, deduction recording with idempotency keys, duplicate prevention, and balance validation (cannot go below 0).
  - Supported "Let It Go" pardon recording for documenting disciplinary decisions without deducting points.
  - Integrated deductions into the monthly report calculation (`monthlyReport`), adjusting net points, remuneration, and totals for both admin and non-admin viewers.
  - Created `PointDeductionModal.vue` allowing authorized admins to view live balances, choose presets, specify reasons/task refs, confirm, and deduct points.
  - Added "Deduct" button directly on employee rows in `EmployeesView.vue`.
  - Created `PointDeductionsView.vue` with month and employee filtering, stat tiles, and CSV export for audit tracking.
  - Added navigation tabs in `App.vue` and route guards in `router/index.ts`.
  - Added unit test suite in `tests/deductions.test.ts`.
- Feature: Login as other users & Return to Admin
  - Added a new `login_as_others` right that allows an admin to impersonate other users without their password.
  - Added a "Login as" button on the team list page for admins to switch into another user's session.
  - Added a "Switch User" quick-selection dropdown directly above the Team table for immediate session switching.
  - Added session tracking of the original admin (`impersonated_by`) in KV storage.
  - Added persistent top Impersonation Banner (*"Logged in as [Employee] (by [Admin Name])"*) with a one-click **Return to Admin** button across the entire application.
  - Added **↩ Return to Admin** option in the Account header dropdown menu.
  - Added `POST /api/auth/exit-impersonation` endpoint to safely restore the admin session and audit the event without needing to re-enter credentials.
- Feature: Remember Me on Login
  - Added a "Remember me" checkbox to the sign-in form that saves credentials to localStorage for automatic pre-fill on next visit.
- Feature: Mobile UX Improvements (Responsive Tables)
  - Transformed dense data grids across all 30+ tables into block-level, stacked cards for mobile devices.
  - Injected an automated DOM observer to automatically label table cells on mobile without requiring template rewrites.
- Feature: Automated Weekly Digests
  - Created a cron-compatible endpoint (`/api/cron/weekly-digest`) that aggregates each employee's hours and units for the past week.
  - Sends a personalized push/email summary notification to all active employees.
- Feature: Leave & Absence Management Workflow
  - Added a formal Leave Request system with multi-day tracking (`LeavesView.vue`).
  - Allows employees to request Sick, Vacation, Unpaid, or Personal leave.
  - Managers/Admins can approve or reject these requests through a dedicated UI.
- Feature: Task Checklists
  - Added support for checklists in tasks, stored as JSON strings.
  - Task assignees can create and toggle checklist items in the UI.
- Feature: Custom Dashboard Date Ranges
  - Users can now select custom date ranges (From/To) on the Dashboard, seamlessly updating the statistics, charts, and aggregated data for that exact timeframe.
  - Allows performance reviews over arbitrary periods rather than only strict monthly cycles.
- Feature: Recurring Tasks
  - Added support for tasks that repeat Daily, Weekly, or Monthly.
  - When a recurring task is completed, a new instance is automatically generated for the next period, preserving assignments and details.
- Feature: Task Comments & Activity Feed
  - Added a new `task_comments` table to the database.
  - Tasks now have a dedicated comments section on their detail page where assignees and observers can discuss the task and provide progress updates.
  - Adding a comment automatically sends a push notification to the task creator and any assigned personnel.
- Feature: Dashboard Data Scope Filtering
  - The Dashboard and Monthly Reports now enforce the `data_scope` setting for all employees (e.g., Own, Direct Reports, Department, All).
  - Previously, all non-admins could view everyone's unit totals and worked days on the dashboard. Now, users will only see aggregate numbers and daily details for the specific employees they are allowed to see based on their data scope.
- Feature: Data Analytics Module Grouping
  - Employees assigned to any task within the "Data Analytics" module (like QAP or Classification) automatically gain visibility and access to all other tasks in that same module.
  - This applies seamlessly across the Time Entry page, Dashboard, and Reports, grouping these related tasks together.
- Feature: Time Entry Work-Type Scoping
  - The entries history table and CSV export now filter out work type columns that the standard user is not assigned to, matching the dashboard behavior.
  - Ensures users not assigned to specific tasks like QAP or Classifications don't see those columns on the time entry page.
- Feature: Task Age Alerts
  - Added a popup warning for tasks pending for more than 2 days, warning users that it will affect their payment.
  - Added a critical popup for tasks pending for more than 3 days, warning that the task is scheduled for deletion/reassignment and will affect finances/payment.
  - The alert shows once per day (dismissable) and lists the old tasks.
  - Added a "Working on it" button to tasks in progress, allowing users to bump the task's `updated_at` timestamp and reset the age warnings without changing the status.
- Feature: Additional Assignee / Observer for Tasks
  - Tasks can now have an optional secondary person assigned.
  - The secondary person can either be an "Additional Assignee" (responsible for progress) or an "Observer" (can view/follow but not responsible).
  - Backend validation ensures the primary and secondary persons cannot be the same employee.
  - Dashboards, task lists, and notifications correctly incorporate the secondary person.
- Feature: Custom Author for Announcements/Pop-ups
  - Added a "From whom" input to the announcement creation form, allowing senders to specify an entity like "Management" or "System".
  - Created a database migration to store `author_name`, which defaults to "System" if left blank.
  - Updated News feed and Pop-ups to display the author's name prominently.
- Feature: QAP and Classification Entry Limit Popup
  - Displays a popup warning when a user attempts to add a 11th QAP or Classification card in a single session, prompting them to pause for 10 minutes. The warning interchangeably mentions "Spvsr. BinitaVh" or "Spvsr William Lee".

- Feature: Work-Type Scoped Dashboard and Reports (Branch: `feature/work-type-scoped-dashboard`)
  - Server-side filtering to strip out work-type data a user is not assigned to (for non-admin users).
  - Client-side filtering in Dashboard and Report views as a UI-level safety net to hide unassigned columns and metrics.

### Feature: Default Dashboard Redirect After Login
**Date:** September 28, 2026

**User Request:**
"when someone logs in, let the Dasboard be the first thing to view"

**Implementation Details:**
1. **Frontend Navigation (src/views/LoginView.vue)**:
   - Changed the post-login `router.push()` destination from `entries` to `dashboard`.
2. **Router Configuration (src/router/index.ts)**:
   - Updated the fallback redirect logic for already authenticated users visiting the `/login` route directly. It now redirects to `dashboard` instead of `entries`.
   - Maintained safety: If a user lacks the `view_dashboard` right, the router's existing `beforeEach` hook intercepts the navigation and gracefully falls back to the `entries` page, preventing unauthorized access loops.

**Testing Performed:**
- Ran full frontend and backend type checks (`npx tsc --noEmit -p tsconfig.app.json` and `npx tsc --noEmit -p tsconfig.server.json`), which both completed successfully with `code 0`.

### Bug Fix: Dashboard API Resilience (Point Deductions)
**Date:** September 28, 2026

**User Request:**
"dashbaord viw too was giving internal error"

**Implementation Details:**
1. **Server-side Fallbacks (unctions/api/[[route]].ts)**:
   - The recent addition of the point_deductions database schema caused the monthlyReport API endpoint to crash (Internal Error 500) if the new table hadn't been fully migrated on the current environment.
   - Added a .catch(() => ({ results: [] })) fallback to the point_deductions SQL query inside the dashboard data resolution Promise.all block.
   - This ensures the entire dashboard safely loads without deductions rather than crashing the whole page if the table is missing.

**Testing Performed:**
- Ran full backend type checking (
px tsc --noEmit -p tsconfig.server.json), which completed successfully with code 0.

### Bug Fix: PDF Export Option Type Error
**Date:** September 28, 2026

**User Request:**
"getting some internal errors in the app"

**Implementation Details:**
- Fixed the PDF export option objects in `ReportView.vue`, `ExpenseReportsView.vue`, and `ExpensePackView.vue` by removing unsupported `landscape` and `format` properties.
- The PDF helper already uses the supported `orientation` option to select portrait or landscape A4 output.

**Testing Performed:**
- Ran production build successfully with `npm.cmd run build`.
- Ran local D1 migrations; no pending migrations remained.
- Ran full Vitest suite successfully: 11 test files, 248 tests passed.
- Started the local Wrangler Pages server successfully at `http://127.0.0.1:8788`.

### Bug Fix: Mobile Viewport Overflow
**Date:** September 28, 2026

**User Request:**
"check the mobile view. some items extend out of the screen"

**Implementation Details:**
- Added shared width and shrink constraints so panels, controls, media, and nested flex/grid content stay within the mobile viewport.
- Updated mobile table cards to wrap long values and action groups instead of widening the page.
- Adjusted the masthead and month picker for narrow screens.
- Fixed responsive table labeling for rows inserted after the initial render.

**Testing Performed:**
- Ran the production build and full Vitest suite successfully.
- Checked mobile layout overflow at 320px, 375px, and 430px viewport widths.

### Feature: Responsive Report Action Menus
**Date:** September 28, 2026

**User Request:**
"lets do this - Dense action toolbars still wrap onto multiple lines by design; a future compact action menu could reduce their vertical height."

**Implementation Details:**
- Added a reusable responsive action menu with outside-click and Escape-key closing.
- Collapsed Monthly Report, Expense Report, and Audit Pack command toolbars into one compact mobile control.
- Preserved the existing inline action buttons on larger screens.
- Updated the mobile UX notes and user guide.

**Testing Performed:**
- Production build completed successfully.
- Full Vitest suite passed: 11 files and 248 tests.
- Browser checks passed at 320px and 1024px for menu contents, closing behavior, responsive visibility, and horizontal overflow.

### Fix: Vertical Mobile Card and Entry Inputs
**Date:** September 28, 2026

**User Request:**
"the cards responsive inputs are horizontal. they should be vertical. the live qap inputs and others should be vertical"

**Implementation Details:**
- Changed responsive data-card cells to stack labels above values instead of displaying them side by side.
- Stacked Time Start, Time End, Hours, and direct-count fields vertically on phone and tablet layouts.
- Kept QAP, Classification, and installation card inputs one field per row through the tablet breakpoint.
- Preserved the compact multi-column layout on desktop screens.

**Testing Performed:**
- Production build completed successfully.
- Full Vitest suite passed: 11 files and 248 tests.
- Browser geometry checks passed at 375px and 767px, including a newly added QAP card; no horizontal overflow was detected.
- Verified the desktop time fields remain horizontal at 1024px.

### Fix: Production D1 Schema Synchronization
**Date:** September 28, 2026

**User Request:**
Reported a Sentry production error: `D1_ERROR: no such table: task_comments` when posting a task comment.

**Implementation Details:**
- Confirmed that production was nine migrations behind the repository schema.
- Reviewed and applied migrations `0029_news_author.sql` through `0037_month_unlocks.sql` to the remote `ledger-db` D1 database.
- Restored the missing `task_comments` table required by the deployed task-comment API and synchronized the other already-deployed features with their database schema.
- Updated the manual production deploy command to apply pending D1 migrations before building and publishing.
- Clarified the migration requirement for both manual and GitHub/Cloudflare auto-deployments.

**Verification:**
- Wrangler reported that no remote migrations remain pending.
- A read-only production query confirmed that `task_comments`, `leaves`, `point_deductions`, and `month_unlocks` now exist.
- Confirmed the project still builds successfully after the deployment-script update.

### Fix: Mobile Safari Route Chunk Recovery
**Date:** September 28, 2026

**User Request:**
Reported a Sentry `TypeError: Load failed` on the production Payments route in Mobile Safari.

**Implementation Details:**
- Confirmed the Payments page already catches API failures and traced the unhandled error to lazy route-module loading.
- Added router-level detection for Safari and other browsers' dynamic-import failure messages.
- When an open tab requests a stale hashed route asset after a deployment, the app now refreshes once to load the current application shell.
- Added session-scoped loop prevention so a genuine network outage cannot cause repeated reloads.

**Verification:**
- Added six focused regression tests covering supported browser messages, unrelated errors, one-time recovery, and reset after successful navigation.
- Focused tests passed and the production build completed successfully.
- Confirmed production was still serving the older bundle reported by Sentry before deployment.
- Deployed the fix to Cloudflare Pages and verified the custom production domain serves the new bundle with the recovery guard.

### Improvement: Two-Column QAP and Classification Inputs
**Date:** September 29, 2026

**User Request:**
"on the qap or classification inputs that come in. they are on a one column long line. it can be 2 colums at least"

**Implementation Details:**
- Changed added QAP and Classification card details from one field per row to a two-column phone and tablet grid.
- Kept each label above its input and preserved the existing four-column desktop layout.
- Left installation-card fields in their existing single-column responsive layout.

**Verification:**
- Production build completed successfully.
- Browser geometry checks passed at 375px and 767px with two equal columns and no horizontal overflow.
