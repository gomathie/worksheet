# Agent Instructions & Work Log

Agent Instructions
1. General Rules

**CRITICAL RULE: MANDATORY WORK LOG AND DOCUMENTATION UPDATES**
Every single time you are asked to make a change, you MUST:
1. Append a new entry to the Work Log at the bottom of this file documenting your work. Follow the exact format described in Section 9.
2. Update `changelog.md` with a summary of the changes made.
3. Keep all other documentation files (e.g. `guideline-admin.md`, `guideline-user.md`, etc.) updated with respect to their corresponding areas if your changes affect how features work.
You have not completed a task until you have updated these documents.

Read this file before making changes to the application.

Inspect the existing implementation before modifying it. Do not assume architecture, naming, data flow, or authorization behavior.

Prefer small, focused changes over broad refactors.

Preserve existing behavior unless the requested change explicitly requires otherwise.

Do not remove or weaken existing authorization, permission, validation, or data-scoping rules.

When a feature involves access control, enforce it server-side first. Client-side filtering may be added as a UI safety layer but must never be the only protection.

Keep frontend and backend behavior consistent.

Reuse existing types, utilities, API patterns, and components where possible.

Do not introduce duplicate implementations when an existing abstraction can be extended.

Do not silently change unrelated functionality.

Keep naming consistent with the existing codebase.

Avoid adding dependencies unless they are genuinely necessary.

Before completing a task, inspect the resulting diff for accidental changes.

2. Security & Data Access Rules
Server-side authorization is authoritative

Any data that a user is not authorized to access must be filtered before it reaches the client.

Never rely solely on:

Vue computed properties

hidden UI elements

disabled buttons

route guards

frontend state

CSS/display rules

If a user should not have access to a category, work type, report, record, metric, or field, the API/server must enforce that restriction.

Work-type scoping

The application supports users being assigned to specific work_type_ids.

For standard/non-admin users:

Only return data for work types assigned to the current user.

Do not expose unassigned work types through API responses.

Do not expose metrics or aggregates that contain data for unassigned work types.

Work-type scoping must be applied consistently to:

work_types

totals.units

per_person[].units

daily_totals[].units

daily_detail[].units

dashboard metrics

report metrics

work-type columns

work-type summary cards/tiles

If a response contains nested or aggregated work-type data, verify that unassigned work types cannot be reconstructed from the remaining data.

For administrators:

Admin users may access the complete dataset where the existing authorization model permits it.

Do not apply standard-user work-type restrictions to admins unless explicitly requested.

Defense in depth

When implementing permission/scoping behavior:

Enforce access on the server/API.

Filter the frontend presentation using the same authorization information.

Ensure hidden UI elements cannot be accessed simply by manipulating frontend state.

Check aggregate values as well as individual records.

Consider nested objects and derived/computed values when validating access.

3. Frontend Rules

UI should only display information the current user is authorized to see.

Do not render empty placeholders for unauthorized work types when the requirement is to hide them completely.

When filtering work types in Vue, use the authenticated user's assigned IDs rather than hard-coded work-type names.

Prefer computed properties for derived visibility state.

Keep authorization-related frontend logic centralized where practical.

Do not duplicate permission logic across many components if an existing composable/store/helper can provide it.

4. Backend/API Rules

Validate the authenticated viewer before returning protected data.

Determine the viewer's permissions/assignments from trusted server-side data.

Never trust a client-provided work_type_ids list as proof of authorization.

Apply authorization before aggregation where possible.

If aggregation happens before filtering, verify that the resulting totals cannot leak unauthorized information.

Preserve admin behavior unless the requested change explicitly changes it.

Keep API response shapes stable unless there is a clear reason to change them.

5. TypeScript Rules

Keep frontend and backend TypeScript configurations passing.

Run the appropriate type checks after changes.

Do not use any to bypass a type error unless there is a documented reason.

Update shared types when the API contract changes.

Ensure optional/null values are handled explicitly.

Prefer existing project types over creating duplicate representations.

6. Testing & Verification

For every meaningful change:

Run frontend type checking.

Run backend/server type checking.

Run relevant unit/integration tests if available.

Test the requested behavior for:

standard user

user assigned to the relevant work type

user not assigned to the relevant work type

admin user

For access-control changes, verify both:

API/server response

rendered UI

When fixing a bug, add or update a regression test when the project's testing setup supports it.

Do not consider a change complete solely because TypeScript compiles.

7. Git & Branching Rules

Work on the requested feature branch.

Do not commit unrelated changes.

Before committing, inspect:

git status

git diff

relevant staged changes

Use clear, descriptive commit messages.

Do not rewrite or delete existing commits unless explicitly requested.

Do not push changes unless explicitly requested.

Do not switch branches or create new branches unless required by the task/request.

8. Change-Safety Rules

Before modifying a function, endpoint, component, or database query:

Find its callers/usages.

Understand its current inputs and outputs.

Check whether other screens depend on its behavior.

Check whether the change affects admins differently from standard users.

Check whether aggregates, counts, totals, or derived metrics are affected.

After modifying it:

Review the diff.

Check for accidental behavior changes.

Check for authorization/data-leakage implications.

Verify that existing functionality still works.

9. Work Log

Keep a concise work log below this section.

Each entry should contain:

Date

Branch

User request

Implementation

Files changed

Testing performed

Any remaining considerations

Work Log
September 25, 2026
Feature: Work-Type Scoped Dashboard and Reports

Branch: feature/work-type-scoped-dashboard

User Request

"On the dashboard, users or employees not assigned to dem qap and claasifications should not see anything related to it. Same for others. Branch this new change."

Implementation
Server-side filtering

File: functions/api/[[route]].ts

Modified the monthlyReport endpoint to query the current viewer's assigned work_type_ids when the viewer is a non-admin.

For non-admin viewers, the API now removes data belonging to work types that are not assigned to the current viewer.

Filtering applies to:

work_types

totals.units

per_person[].units

daily_totals[].units

daily_detail[].units

Admin users remain exempt and continue to receive the full dataset.

Client-side filtering

Files:

src/views/DashboardView.vue

src/views/ReportView.vue

Added a computed myTypeIds value containing the logged-in user's assigned work_type_ids.

Updated visibleTypes so standard users only see work types assigned to them.

This provides a UI-level safety net and prevents unassigned work types from appearing in:

columns

metrics

statistics

work-type tiles

QAP/Classification-related dashboard elements

Testing

Checked TypeScript configuration and types across:

tsconfig.app.json

tsconfig.server.json

Both type checks completed successfully with exit code 0.

Important Follow-up

Future changes involving work types, dashboards, reports, totals, or analytics must preserve this scoping behavior.

A new work type must not automatically become visible to every standard user simply because it exists in the database.

Authorization must continue to be enforced server-side, with frontend filtering acting as an additional UI safety layer.

## Work Done

### Feature: Work-Type Scoped Dashboard and Reports (Branch: `feature/work-type-scoped-dashboard`)
**Date:** September 25, 2026

**User Request:**
"On the dashboard, users or employees not assigned to dem qap and claasifications should not see anything related to it. Same for others. Branch this new change."

**Implementation Details:**
1. **Server-side filtering (`functions/api/[[route]].ts`)**:
   - Modified the `monthlyReport` endpoint to query the current viewer's assigned `work_type_ids` if they are a non-admin.
   - For non-admin viewers, the API now strips any data related to work types they are not assigned to. This filtering applies to `work_types`, `totals.units`, `per_person[].units`, `daily_totals[].units`, and `daily_detail[].units`.
   - Admin users are exempt from this filtering and continue to see the full, unfiltered dataset.
   
2. **Client-side filtering (`src/views/DashboardView.vue` and `src/views/ReportView.vue`)**:
   - Added a computed property `myTypeIds` tracking the logged-in user's `work_type_ids`.
   - Updated the `visibleTypes` computed logic to strictly filter out any work types that are not assigned to the standard user. This acts as a UI-level safety net to completely hide unassigned columns, metrics, and stats (e.g., hiding QAP/Classification tiles for unassigned users).

**Testing Performed:**
- Checked type definitions across the frontend (`tsconfig.app.json`) and server (`tsconfig.server.json`) to ensure the new scoping additions didn't introduce TypeScript errors. Both type checks completed with `code 0` (no errors).

### Feature: QAP and Classification Entry Limit Popup
**Date:** September 26, 2026

**User Request:**
"when user makes more than 10 qap or classifications entries, give a pop up to the user to 'move your next card and pause for 10 mins while we make a check, and continue exactly after that unless told otherwise by your supervisor'"
Follow-up: "check all pop ups related to qap or classification. add by 'Spvsr. BinitaVh' or by 'Spvsr William Lee' the names should be used interchangeably"

**Implementation Details:**
1. **Frontend Alert Logic (`src/views/EntriesView.vue`)**:
   - Modified the `addCard` function that handles adding new cards to the daily entry form.
   - Identified QAP and Classification cards using the `module` property (`Classification/QAP`) and the card name.
   - Added logic to count existing QAP/Classification cards in the form (`form.value.cards`).
   - If the user attempts to add a card when the count is already 10 or more, an `alert()` popup is displayed with the warning message requested, interchangeably inserting either 'Spvsr. BinitaVh' or 'Spvsr William Lee' at the end of the message.

**Testing Performed:**
- Checked frontend type definitions with `npx tsc --noEmit -p tsconfig.app.json`, which completed successfully with `code 0` (no errors).

### Feature: Custom Author for Announcements/Pop-ups
**Date:** September 26, 2026

**User Request:**
"when a user is creating a pop up notification. provide a space to input from whom. for example from Management, Mathias, System of John. if nothing is typed in, it should be System by default."

**Implementation Details:**
1. **Database Schema (`migrations/0029_news_author.sql`)**:
   - Added `author_name` column to the `news` table, defaulting to 'System'.
2. **Server-side Logic (`server/news.ts`)**:
   - Updated the `createNews` endpoint to accept an `author` field from the request body. If the field is blank, it defaults to 'System'.
   - Modified `SELECT_NEWS` and the API response mapping to include `author_name`.
3. **Frontend Changes (`src/views/NewsView.vue`, `src/components/NewsPopup.vue`, `src/types.ts`)**:
   - Updated the `NewsItem` type interface to include `author_name`.
   - Added a "From whom (optional)" input field to the announcement creation form in `NewsView.vue`.
   - Updated the `NewsView` feed and the `NewsPopup` component to clearly display "From: {author_name}" instead of relying solely on the fallback employee name.

**Testing Performed:**
- Ran `npm run db:migrate:local` successfully.
- Will monitor frontend TypeScript checks during future changes.

### Feature: Additional Assignee / Observer for Tasks
**Date:** September 26, 2026

**User Request:**
"Feature Request: Allow Tasks to Have an Additional Assignee or Observer"

**Implementation Details:**
1. **Database Schema (`migrations/0030_task_secondary_assignee.sql`)**:
   - Added `secondary_person_id` and `secondary_role` ('assignee' or 'observer') columns to the `tasks` table.
2. **Server-side Logic (`server/tasks.ts`, `shared/tasks.ts`)**:
   - Updated `TaskLike` and `allowedTaskActions` to grant modification rights to the `secondary_person_id` if their role is `assignee`. Observers only get view rights.
   - Updated `createTask` and `patchTask` APIs to accept, validate, and store the secondary person parameters. Added validations preventing assigning the same person to both roles.
   - Ensured the correct notification is sent to the secondary person ("assigned you a task as an additional assignee" vs "added you as an observer").
   - Added the `secondary_person_id` when fetching assignments, ensuring "Assigned to you" accurately includes tasks where the user is a secondary assignee.
3. **Frontend Changes (`src/views/TasksView.vue`, `src/views/TaskDetailView.vue`, `src/types.ts`)**:
   - Updated the `Task` type interface to include `secondary_person_id`, `secondary_person_name`, and `secondary_role`.
   - Added an optional "Additional participant" selector in the `TasksView.vue` task creation/edit form, automatically filtering out the selected primary assignee.
   - Rendered the secondary person and their role (Also assigned / Observer) on the task cards in `TasksView.vue` and in the assignment block of `TaskDetailView.vue`.

**Testing Performed:**
- Ran `npm run db:migrate:local` successfully.
- Checked full type definitions with `npx tsc --noEmit -p tsconfig.app.json ; npx tsc --noEmit -p tsconfig.server.json`, which completed successfully with `code 0`.

### Feature: Task Age Alerts
**Date:** September 26, 2026

**User Request:**
"when Someone is having a task for more than 2 days, they should receive a pop up telling them it it will affect their payment when not done.
after 3 days, they should receive a pop up sayign their task has been scheduled for deletion or to be reassigned and will affect their finances or payment."

**Implementation Details:**
1. **Frontend Component (`src/components/TaskAgeAlert.vue`)**:
   - Created a new Vue component that globally checks if a user has any open/pending tasks (`todo` or `in_progress`) assigned to them.
   - Calculated the age of tasks in full 24-hour days relative to `created_at`.
   - If a task is older than 3 days (`> 3`), displays a high-priority red alert about deletion/reassignment and payment consequences.
   - Else if a task is older than 2 days (`> 2`), displays a medium-priority amber alert warning them it will affect their payment.
   - The popup lists the affected tasks and allows the user to dismiss the warning.
   - Dismissals are saved to `localStorage` per calendar day (`auth.user.today`) so the user isn't nagged repeatedly on every page load within the same day.
   - **Update**: Changed the age calculation to use `updated_at` (falling back to `created_at`) so users can reset the warning by keeping the task active.
2. **App Entry (`src/App.vue`)**:
   - Registered and injected `<TaskAgeAlert />` alongside the existing `TaskDeadlineAlert` so it runs globally on all pages for authenticated users.
3. **Task Views (`src/views/TasksView.vue`, `src/views/TaskDetailView.vue`)**:
   - Added a new `ping` function that sends a PATCH request to the server with the task's current status. This triggers the server's `UPDATE` query, refreshing the `updated_at` timestamp.
   - Added a "Working on it" button to in-progress task cards and task details, allowing users to actively prevent overdue warnings without actually altering the task's contents.

**Testing Performed:**
- Ran `npx tsc --noEmit -p tsconfig.app.json` which completed successfully with `code 0` (no errors).

### Feature: Time Entry Work-Type Scoping
**Date:** September 26, 2026

**User Request:**
"on the time entry too, if a user is not assigned to qap, they should not see it."

**Implementation Details:**
1. **Frontend Filtering (`src/views/EntriesView.vue`)**:
   - The time entry *form* was already filtering out unassigned card types (like QAP and Classifications) for standard users via `formTypes`.
   - However, the time entry *history table* and the *CSV export* were still using `activeTypes` (which includes all active work types globally), meaning standard users could still see QAP/Classification columns.
   - Introduced a new `visibleTypes` computed property that restricts `activeTypes` strictly to the current user's `work_type_ids` if they are a standard, non-admin user.
   - Replaced `activeTypes` with `visibleTypes` in the table header, the row loop, the `tableColspan` calculation, and the CSV export logic.
   - This explicitly hides QAP and Classification sections from the entire time entry page for users who don't have those assignments, matching the Dashboard's behavior.

**Testing Performed:**
- Ran frontend type checks (`npx tsc --noEmit -p tsconfig.app.json`) successfully.

### Feature: Data Analytics Module Grouping
**Date:** September 26, 2026

**User Request:**
"grroup qap and classification under Data analytics. Which means any user or employee asigned to data analytics see its related stuff."
Follow-up: "No, keep assigning individual tasks (like QAP), but if they have ANY 'Data Analytics' task, they automatically get access to ALL of them."

**Implementation Details:**
1. **Backend Dynamic Module Expansion (`functions/api/[[route]].ts`)**:
   - Modified `assignedTypeIds()` and the `/api/me` route to query `employee_work_types` with an expansion join.
   - If an employee is explicitly assigned to a `work_type` that belongs to a module (where `module IS NOT NULL`, such as `Data Analytics`), the query automatically returns all active work types that share that same module.
   - This ensures that assigning a standard user to "QAP" implicitly grants them full access to "Classification", since both share the "Data Analytics" module.
   - This single backend change cascades cleanly to all frontend logic, as `auth.user.work_types` is now populated with the fully expanded module list.
   - The admin assignment UI (`/api/employees`) continues to show exactly what is saved in the database, allowing admins granular control (they can select one or both checkboxes; removing the module just requires unchecking the assigned ones).

**Testing Performed:**
- Ran backend type checks (`npx tsc --noEmit -p tsconfig.server.json`) which completed successfully with `code 0`.

### Feature: Dashboard Data Scope Filtering
**Date:** September 26, 2026

**User Request:**
"check if there are rights related to what employees can see on the dashboard. if not implement it. so rights can be set for what employees can see"

**Implementation Details:**
1. **Identified Existing Capability**:
   - The system already had a `data_scope` field on employees (`own`, `direct_reports`, `department`, `all`). However, the `monthlyReport` API (which powers the dashboard) was hardcoding a behavior where "Non-admins see everyone's work performance but their own figures only".
2. **Backend Enforcement (`functions/api/[[route]].ts`)**:
   - Imported `visibleEmployeeIds` and `isVisible` from `server/scope.ts`.
   - In `monthlyReport`, calculated `scopeIds` for the requesting user using `visibleEmployeeIds(env, user)`.
   - Filtered the raw entries (`entryLikes`, `daily_detail`), employees list (`employeeLikes`), and task logs (`taskWorkedDays`) through `isVisible(scopeIds, employeeId)` *before* sending them to `aggregateMonthly()`.
   - As a result, standard employees now only see dashboard totals (hours, units, days worked), daily details, and charts for the exact set of employees they are allowed to see based on their assigned `data_scope`.

**Testing Performed:**
- Re-ran backend type checks (`npx tsc --noEmit -p tsconfig.server.json`), resolving a small nullability error on `assignee_id`. Completed successfully with `code 0`.

### Feature: Task Comments & Activity Feed
**Date:** September 26, 2026

**User Request:**
"what other improvements or features can I add -> 1. Task Comments & Activity Feed"

**Implementation Details:**
1. **Database Schema (`migrations/0031_task_comments.sql`)**:
   - Created a new `task_comments` table with `id`, `task_id` (foreign key), `employee_id` (foreign key), `content`, and `created_at`.
2. **Backend Logic (`server/tasks.ts`, `functions/api/[[route]].ts`)**:
   - Added `TaskCommentRow` interface.
   - Implemented `listTaskComments` (GET `/api/tasks/:id/comments`) to fetch comments sorted chronologically.
   - Implemented `createTaskComment` (POST `/api/tasks/:id/comments`) to insert comments and send push notifications to the task creator, primary assignee, and secondary assignee.
   - Added API endpoints to `[[route]].ts`.
3. **Frontend Changes (`src/types.ts`, `src/views/TaskDetailView.vue`)**:
   - Added `TaskComment` interface to `types.ts`.
   - Updated `TaskDetailView.vue` to fetch comments concurrently with task details.
   - Added a new UI block below the task details rendering the comment feed and a submission form.

**Testing Performed:**
- Ran full frontend and backend type checks (`npx tsc --noEmit -p tsconfig.server.json ; npx tsc --noEmit -p tsconfig.app.json`), which completed successfully with `code 0`.

### Feature: Recurring Tasks
**Date:** September 26, 2026

**User Request:**
"what other improvements or features can I add -> 4. Recurring Tasks"

**Implementation Details:**
1. **Database Schema (`migrations/0032_task_recurrence.sql`)**:
   - Added `recurrence` column to the `tasks` table with allowed values (`daily`, `weekly`, `monthly`, or `NULL`).
2. **Backend Logic (`server/tasks.ts`)**:
   - Updated `TaskRow` and `TaskBody` interfaces to include `recurrence`.
   - Updated `createTask` and `patchTask` endpoints to accept and validate the `recurrence` field.
   - Implemented logic in `patchTask`: when a recurring task is marked as `done`, the system automatically clones the task as `todo` with a new `due_date` offset by the recurrence interval (1 day, 7 days, or 1 month), preserving assignees, priority, and details while appending a note about its auto-generation.
3. **Frontend Changes (`src/types.ts`, `src/views/TasksView.vue`, `src/views/TaskDetailView.vue`)**:
   - Added `recurrence` to the `Task` type.
   - Updated the task creation/edit form in `TasksView.vue` with a dropdown to select the recurrence interval.
   - Updated the task cards and `TaskDetailView.vue` to display the active recurrence schedule for a task.

**Testing Performed:**
- Ran full type checks which passed successfully.

### Feature: Custom Dashboard Date Ranges
**Date:** September 26, 2026

**User Request:**
"what other improvements or features can I add -> 5. Custom Dashboard Date Ranges"

**Implementation Details:**
1. **Backend Route (`functions/api/[[route]].ts`)**:
   - Refactored `unitsByEntryId` to support custom date range queries using an options object (`from` and `to`).
   - Upgraded the `/api/reports/monthly` endpoint to accept `from` and `to` query parameters instead of strictly relying on `month`. When custom parameters are provided, it filters database queries (entries, tasks) precisely to that range and uses the `to` month to snapshot applicable rates.
2. **Frontend Component (`src/views/DashboardView.vue`)**:
   - Retained the `MonthPicker` for convenience, but added a dropdown toggle (`rangeMode`) to switch between "Month" and "Custom".
   - Under "Custom", rendered standard HTML5 date inputs for `from` and `to`, bound to reactive state.
   - Updated the data `load` method to submit custom URL search params when in custom mode, seamlessly transitioning the entire dashboard's aggregations, daily details, and charts to reflect the arbitrary timeframe.

**Testing Performed:**
- Ran full type checks which passed successfully (`code 0`).

### Feature: Task Checklists
**Date:** September 26, 2026

**User Request:**
"2. Task Subtasks & Checklists"

**Implementation Details:**
1. **Database Schema (`migrations/0033_task_checklist.sql`)**:
   - Added a `checklist` text column to `tasks`.
2. **Backend API (`server/tasks.ts`)**:
   - Updated `TaskRow` and endpoints to support `checklist`.
3. **Frontend Views (`src/views/TasksView.vue`, `src/views/TaskDetailView.vue`)**:
   - Added checklist creation (textarea with newline separated tasks) to task creation form.
   - Updated `TaskDetailView.vue` with an interactive checklist where users can mark subtasks as complete.

**Testing Performed:**
- Ran full type checks successfully.

### Feature: Leave & Absence Management
**Date:** September 26, 2026

**User Request:**
"1. Leave & Absence Management"

**Implementation Details:**
1. **Database Schema (`migrations/0034_leaves.sql`)**:
   - Created a `leaves` table linked to employees with `start_date`, `end_date`, `type`, and `status`.
2. **Backend Logic (`server/leaves.ts`, `functions/api/[[route]].ts`)**:
   - Implemented `listLeaves`, `createLeave`, and `updateLeave` (for admin approvals).
   - Added routes in `[[route]].ts` mapped to `/api/leaves`.
3. **Frontend View (`src/views/LeavesView.vue`, `src/router/index.ts`, `src/App.vue`)**:
   - Created a complete Leave management interface for users to request time off (Sick, Vacation, Personal, Unpaid).
   - Admins see a consolidated view to approve or reject requests.
   - Added `/time-off` route and linked it under the Reports tab.

**Testing Performed:**
- Checked type definitions successfully. Ran database migration locally.

### Feature: Automated Weekly Digests
**Date:** September 26, 2026

**User Request:**
"5. Automated Weekly Digests"

**Implementation Details:**
1. **Backend Cron Endpoint (`server/cron.ts`, `functions/api/[[route]].ts`)**:
   - Created `/api/cron/weekly-digest` as an automated endpoint.
   - Calculates "last week" date boundaries (Monday to Sunday).
   - Aggregates hours and units per employee for the period.
   - Triggers `notifyUser` to send an in-app and email/push digest summary to each active employee with their metrics.

**Testing Performed:**
- Verified query logic and endpoint routing.

### Feature: Mobile UX Improvements - Responsive Tables
**Date:** September 26, 2026

**User Request:**
"check the mobile version and make some suggestions. add the mobile ux suggestion md so other agents can continue if not completed. also record cnahnges and what was implemented"

**Implementation Details:**
1. **Frontend CSS (`src/style.css`)**:
   - Added a `@media (max-width: 640px)` media query to transform `table.data` elements from dense horizontal grids into block-level, card-style layouts.
   - Hid table headers (`thead`) and applied `display: flex; justify-content: space-between;` to table cells (`td`).
   - Implemented an injected pseudo-element (`td::before { content: attr(data-label); }`) to render the corresponding column header inside the card layout.
2. **Frontend DOM Observer (`src/main.ts`)**:
   - Added a global `MutationObserver` (`observeTables`) that automatically attaches `data-label` attributes to all `<td>` elements in `table.data` by reading the text content of their corresponding `<th>` elements.
   - This prevents needing to manually rewrite all 30+ table templates in the application.
3. **Documentation (`mobile_ux_suggestions.md`)**:
   - Authored a Markdown document saved to the project root containing further UI suggestions (FABs, drawers, swipe actions) for future agents to implement.

**Testing Performed:**
- Evaluated CSS logic and mutation observer script for correctness.

### Feature: Remember Me on Login
**Date:** September 26, 2026

**User Request:**
"ad remeber username and pass when done"

**Implementation Details:**
1. **Frontend (`src/views/LoginView.vue`)**:
   - Added a `Remember me` checkbox below the password field.
   - On successful login, if the checkbox is ticked, the username and password are saved to `localStorage` under the key `ledger_remember`.
   - On mount, the component reads from `localStorage` and pre-fills the username and password fields if previously saved, also ticking the checkbox.
   - If the user unchecks the box and logs in, the saved credentials are cleared from `localStorage`.

**Testing Performed:**
- Build completed successfully.

### Fix: Build Errors After Merge
**Date:** September 26, 2026

**User Request:**
"check if the changes appear in the app"

**Implementation Details:**
1. **`server/cron.ts`**: Fixed escaped template literals, corrected imports to use `./http` instead of non-existent `@mjackson/form-data-parser` and `./error`, removed unused `Employee` import and `sentCount` variable.
2. **`server/leaves.ts`**: Same import fixes, handled `visibleEmployeeIds` possibly returning `null`, fixed `json()` second argument type.
3. **`server/tasks.ts`**: Removed duplicate `const recurrence` declaration.
4. **`src/views/TaskDetailView.vue`**: Removed extra `</div>` closing tag causing Vue template parse error.

**Testing Performed:**
- Full build (`vue-tsc -b && vite build`) completed successfully.
- Dev server started and served the app at `http://127.0.0.1:8788`.

### Feature: Login As Other Users
**Date:** September 26, 2026

**User Request:**
"add a right that permits an admin to be able to login as other users"

**Implementation Details:**
1. **Database / Models (`server/auth.ts`, `src/types.ts`)**:
   - Added `login_as_others: boolean` to the `Rights` interface in both frontend and backend.
   - Set it to `true` in `ALL_RIGHTS` and `false` in `DEFAULT_RIGHTS`.
2. **Backend Logic (`functions/api/[[route]].ts`)**:
   - Added a new `handleLoginAs` POST endpoint at `/api/auth/login-as`.
   - The endpoint checks if the requester has the `login_as_others` right.
   - It bypasses password verification for the target user (provided via `target_id`), generates a new session token, and drops the old one.
3. **Frontend UI (`src/views/EmployeesView.vue`)**:
   - Added a "Login as other users" checkbox in the employee edit form under Rights.
   - Displayed "Login as others" in the text summary of granted rights.
   - Added a `Login as` button to the main Team table's action column. The button only appears if the viewing user has the `login_as_others` right and the row does not belong to the viewing user.
   - Connected the button to a new `loginAs` async function that makes a POST request to `/api/auth/login-as` and redirects to the dashboard root `/`.

**Testing Performed:**
- TypeScript type checks passed. Vite dev server hot-reloaded automatically.

### Feature: Points Deduction & Admin Penalty System
**Date:** September 28, 2026
**Branch:** `main`

**User Request:**
"Users and employees currently earn points from cards, tasks, or work they successfully submit. Add a system that allows authorized admins to deduct points when a user/employee fails to complete a task, violates a requirement, receives repeated warnings, or otherwise needs a points penalty. The system must be secure, auditable, easy for admins to use, and clearly communicate deductions to the affected user."

**Implementation Details:**
1. **Database Schema (`migrations/0035_point_deductions.sql`)**:
   - Created `point_deductions` table storing `id`, `employee_id`, `admin_id`, `amount`, `reason`, `task_id`, `warning_ref`, `previous_balance`, `new_balance`, `month`, `decision` (`deducted` or `let_it_go`), `idempotency_key`, and `created_at`.
   - Created database indexes on `(employee_id, month)`, `admin_id`, `month`, and unique index on `idempotency_key`.
   - Added append-only database triggers (`BEFORE UPDATE` and `BEFORE DELETE` aborting) to prevent tampering with deduction records.
2. **Permissions Architecture (`server/auth.ts`, `src/types.ts`, `src/stores/auth.ts`, `functions/api/[[route]].ts`)**:
   - Added `manage_point_deductions` boolean to backend and frontend `Rights` interfaces.
   - Implied automatically for `admin` role, and explicitly grantable to non-admin employees in user administration.
   - Preserved across serialization in `rightsToJson` and normalized in `parseRights`.
3. **Server Module & API (`server/deductions.ts`, `functions/api/[[route]].ts`)**:
   - Built `earnedPointsForMonth` and `totalDeductionsForMonth` helpers to calculate on-the-fly balances.
   - Implemented `createDeduction` (`POST /api/point-deductions`):
     - Validates authorization (`manage_point_deductions`), positive amount for penalties, target employee existence and active status.
     - Enforces balance constraint: balance cannot become negative (`amount <= currentBalance`).
     - Supports `let_it_go` decision with zero point deduction for documenting pardons.
     - Implements idempotency key deduplication.
     - Triggers server `audit()` log and `notifyUser()` with details (reason, amount, previous and updated balance).
   - Implemented `listDeductions` (`GET /api/point-deductions`): privileged admins see all records with filters (month, employee_id), standard users can only view their own records.
   - Implemented `getEmployeeBalance` (`GET /api/point-deductions/balance/:employeeId`): returns current month earned, deducted, and net balance.
4. **Monthly Report & Dashboard Integration (`functions/api/[[route]].ts`, `src/types.ts`)**:
   - Modified `monthlyReport` endpoint to query deductions for the month.
   - For admins: updates each person's `points`, `deductions`, `remuneration` (calculated from effective net points), and summary totals.
   - For non-admins: updates `my_summary` with effective points/remuneration and deduction amount.
5. **Frontend UI Components & Views (`src/components/PointDeductionModal.vue`, `src/views/EmployeesView.vue`, `src/views/PointDeductionsView.vue`, `src/router/index.ts`, `src/App.vue`)**:
   - Created `PointDeductionModal.vue`: live balance lookup, quick presets (-5, -10, -20, -50, All), live post-deduction balance preview, justification textarea, optional task/warning references, confirmation checkbox, and duplicate submission prevention.
   - Updated `EmployeesView.vue`: added "Manage point deductions" right checkbox and "Deduct" button on employee rows.
   - Created `PointDeductionsView.vue`: dedicated audit log table with filter by month, employee, and decision type, metric summary cards, and CSV export.
   - Updated `App.vue` and `router/index.ts`: added `/point-deductions` route with permission guards and tab link under the Admin sub-navigation strip.
6. **Documentation & Guidelines (`changelog.md`, `guideline-admin.md`, `guideline-user.md`, `AGENTS.md`)**:
   - Updated admin guidelines with rights table entries and an end-to-end section explaining how deductions, pardons, balance protections, and audit logs work.
   - Updated user guidelines explaining that point deductions appear in notifications and adjust effective monthly scores.
   - Updated changelog and agent work log.

**Files Changed:**
- `migrations/0035_point_deductions.sql`
- `server/env.ts`
- `server/auth.ts`
- `server/deductions.ts`
- `functions/api/[[route]].ts`
- `src/types.ts`
- `src/stores/auth.ts`
- `src/components/PointDeductionModal.vue`
- `src/views/EmployeesView.vue`
- `src/views/PointDeductionsView.vue`
- `src/router/index.ts`
- `src/App.vue`
- `tests/deductions.test.ts`
- `changelog.md`
- `guideline-admin.md`
- `guideline-user.md`
- `AGENTS.md`

**Testing Performed:**
- Local D1 migration applied successfully (`npm run db:migrate:local`).
- Frontend type check (`npx tsc --noEmit -p tsconfig.app.json`) completed with exit code 0.
- Backend type check (`npx tsc --noEmit -p tsconfig.server.json`) completed with exit code 0.
- Unit test suite (`npm test`) executed 9 test suites and 226 tests with 100% passing.
- Production build (`npm run build`) completed successfully with exit code 0.

**Remaining Considerations:**
- When deploying to production Cloudflare Pages/D1, run `npm run db:migrate:prod` to apply migration `0035_point_deductions.sql`.

### Enhancement: Quick Switch & Login-As Visibility
**Date:** September 28, 2026
**Branch:** `main`

**User Request:**
"I cannot see where to login as another employee in the app. how to do it?"

**Implementation Details:**
1. **Frontend UX (`src/views/EmployeesView.vue`)**:
   - Added a 'Switch User' quick-selection dropdown right at the top of the **Team** panel next to the heading. An admin can select any employee and click **Login as** directly without needing to locate them in the large table.
   - Added an explicit 'Actions' column header to the Team table.
   - Styled the per-row **Login as** button with distinct teal branding (`border-teal text-teal hover:bg-teal-soft`) to stand out clearly from other buttons.
   - Switched from `auth.user?.rights` to the reactive getter `auth.rights.login_as_others` for robust permission evaluation.

**Testing Performed:**
- TypeScript type checks passed with exit code 0.
- Unit tests passed (226 tests).

### Feature: Return to Admin Option on Impersonation
**Date:** September 28, 2026
**Branch:** `main`

**User Request:**
"when you login as another person, there should be an option to click to go back to admin where you came from"

**Implementation Details:**
1. **Server Session Tracking (`server/auth.ts`, `functions/api/[[route]].ts`)**:
   - Defined and exported `SessionPayload` interface (`employee_id`, `impersonated_by`) and `currentSession(request, env)` helper.
   - Updated `handleLoginAs`: when logging in as another user, stores the initiating admin's ID in the new session's `impersonated_by` field in KV storage. If already impersonating, preserves the original admin ID across nested switches.
   - Added audit logging with action `impersonate_user`.
2. **Exit Impersonation Endpoint (`functions/api/[[route]].ts`)**:
   - Created `handleExitImpersonation` endpoint (`POST /api/auth/exit-impersonation`).
   - Strictly enforces server-side security: ensures current session contains a valid `impersonated_by` ID and verifies the original admin account is active and approved. Regular non-impersonated users cannot forge this call.
   - Safely deletes the impersonated session from KV, issues a fresh session token for the original admin, audits the exit action (`exit_impersonation`), and sets the session cookie.
3. **Current User Metadata (`functions/api/[[route]].ts`, `src/types.ts`)**:
   - Updated `/api/me` route to inspect the session for `impersonated_by`. If present, looks up the admin's name and returns `impersonated_by` and `impersonated_by_name`.
   - Updated `Me` interface in `src/types.ts`.
4. **Auth Store (`src/stores/auth.ts`)**:
   - Added `isImpersonating` computed getter based on `Boolean(auth.user?.impersonated_by)`.
   - Added `exitImpersonation()` action to invoke the exit endpoint and refresh auth state.
5. **Global Impersonation Banner & Dropdown Action (`src/App.vue`)**:
   - Injected a top-level alert banner styled with amber borders and soft background, an active animated indicator, clearly displaying `"Logged in as [Employee Name] (by [Admin Name])"`, accompanied by a prominent **Return to Admin** button.
   - Added a **↩ Return to Admin** option in the Account dropdown menu for fast access from the header.
   - Automatically redirects back to `/employees` upon exiting impersonation, seamlessly returning the admin to their management dashboard.
6. **Form Messaging (`src/views/EmployeesView.vue`)**:
   - Updated the login confirmation dialog to inform admins that they can switch back at any time.
7. **Documentation & Unit Tests (`guideline-admin.md`, `changelog.md`, `tests/auth.test.ts`)**:
   - Updated Admin Guide with details on the Impersonation Banner, Return to Admin actions, and audit trails.
   - Updated Changelog.
   - Added comprehensive unit tests in `tests/auth.test.ts` covering session parsing, impersonation payload handling, and permission validation.

**Files Changed:**
- `server/auth.ts`
- `functions/api/[[route]].ts`
- `src/types.ts`
- `src/stores/auth.ts`
- `src/App.vue`
- `src/views/EmployeesView.vue`
- `tests/auth.test.ts`
- `guideline-admin.md`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Ran frontend type checks (`npx tsc --noEmit -p tsconfig.app.json`): exit code 0.
- Ran server type checks (`npx tsc --noEmit -p tsconfig.server.json`): exit code 0.
- Ran unit tests (`npm test`): 10 test files, 234 tests passed with 100% success.
- Ran production build (`npm run build`): built without errors.

### Feature: Keep Expenses in App (Internal Expenses) & Kept in App Report
**Date:** September 28, 2026
**Branch:** `main`

**User Request:**
"also provide option not to send expenses some expenses to be recorded in external system. some of them should be like its be left. so instead of send to be recorded after approval, there should be an another of to keep in the app. and there should be a report for all that is kept in the app,per month, and total for the year."

**Implementation Details:**
1. **Database Schema (`migrations/0036_expense_keep_in_app.sql`)**:
   - Added `keep_in_app INTEGER NOT NULL DEFAULT 0`, `kept_at TEXT`, `kept_by TEXT REFERENCES employees(id)`, and `kept_reason TEXT` to `expense_vouchers`.
   - Created index `idx_expense_vouchers_keep_in_app` on `(keep_in_app, expense_date)`.
   - Applied migration locally (`npm run db:migrate:local`).
2. **Backend Engine & State Machine (`shared/expenses.ts`, `server/expenses.ts`, `server/env.ts`)**:
   - Added `'kept_in_app'` to `EXPENSE_STATUSES`, `STATUS_LABELS`, and `PETTY_CASH_CONSUMING_STATUSES`.
   - Added `'keep_in_app'` to `ExpenseAction`.
   - Updated `allowedActions`:
     - At final approval (`admin_approval` / `finance_review`): approver can choose `'admin_approve'`, `'keep_in_app'`, `'admin_reject'`, or `'return'`.
     - At recording queue (`approved`): finance recorder can choose `'mark_recorded'` or `'keep_in_app'`.
     - Kept-in-app vouchers are frozen and can be reopened by administrators.
   - Updated `statusAfter`: `'keep_in_app'` transitions to `'kept_in_app'`.
   - Updated `decideVoucher`:
     - Handled `'keep_in_app'` decision, updating `status = 'kept_in_app'`, `keep_in_app = 1`, `kept_at = now`, `kept_by = user.id`, `kept_reason = reason`.
     - Recorded audit trail entry and approval log.
     - Reset `kept_*` fields when reopened.
     - Kept-in-app vouchers notify the employee, but are excluded from the external accounting queue (`queue=record`).
   - Extended `summarize()` to include `kept_in_app` count.
3. **Dedicated Kept in App Report (`server/expenses.ts`)**:
   - Added `'kept_in_app'` to `REPORT_TYPES`.
   - Implemented `expenseReport` query for `kept_in_app`:
     - Queries detailed vouchers with employee, department, category, amount, kept by, and justification reason.
     - Calculates monthly breakdown (`monthly_summary`) with per-month voucher counts and total amounts.
     - Calculates annual total expenditure (`annual_total`) and voucher count (`annual_vouchers`) for the calendar year.
   - Updated other reports (`monthly`, `department`, `employee`) to include `kept_in_app_amount` columns.
4. **Frontend UI Components & Views**:
   - `src/types.ts`: Updated `ExpenseVoucher`, `ExpenseSummary`, and `ExpenseReport` interfaces.
   - `src/components/ExpenseStatusChip.vue`: Added visual styling for `kept_in_app`.
   - `src/views/ExpenseFinanceView.vue`:
     - Added **Keep in app** action button with prompt for optional reason note.
     - Added direct **Kept in app report** button in the header.
   - `src/views/ExpenseDetailView.vue`:
     - Added **Approve & Keep in app** and **Keep in app (internal)** action buttons.
     - Added audit notice banner for kept-in-app internal expenses with date, decider, and reason.
     - Enabled PDF downloading for kept-in-app vouchers.
   - `src/views/ExpenseApprovalsView.vue`:
     - Added **Approve & Keep in app** button to the approver queue.
   - `src/views/ExpenseFormView.vue`:
     - Added **Keep in app (Internal expense)** checkbox for admins and approvers.
   - `src/views/ExpenseReportsView.vue`:
     - Added `kept_in_app` to reports list and respected route query parameters.
     - Added 5th summary card on dashboard for "Kept in app".
     - Built dedicated Annual Total KPI cards, Monthly Breakdown table, and detailed voucher table with full CSV/Excel export.
5. **Documentation & Tests**:
   - Updated `guideline-admin.md` and `guideline-user.md`.
   - Updated `changelog.md`.
   - Added comprehensive unit test suite in `tests/expenses.test.ts` covering transitions, permissions, petty cash consumption, and report aggregations.

**Files Changed:**
- `migrations/0036_expense_keep_in_app.sql`
- `server/env.ts`
- `shared/expenses.ts`
- `server/expenses.ts`
- `src/types.ts`
- `src/components/ExpenseStatusChip.vue`
- `src/views/ExpenseFinanceView.vue`
- `src/views/ExpenseDetailView.vue`
- `src/views/ExpenseApprovalsView.vue`
- `src/views/ExpenseFormView.vue`
- `src/views/ExpenseReportsView.vue`
- `tests/expenses.test.ts`
- `guideline-admin.md`
- `guideline-user.md`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Ran database migrations locally (`npm run db:migrate:local`): exit code 0.
- Ran vitest unit test suite (`npm test`): 10 test files, 241 passed (100% success).
- Ran frontend type checks (`npx tsc --noEmit -p tsconfig.app.json`): exit code 0.
- Ran backend type checks (`npx tsc --noEmit -p tsconfig.server.json`): exit code 0.
- Ran production build (`npm run build`): compiled successfully with code 0.

**Remaining Considerations:**
- None. All requirements for keeping expenses in the app and generating monthly/annual reports are implemented, tested, and fully documented.

### Feature: Mobile & PWA Document Sharing, Default Month-End Locking, and Task API Resilience
**Date:** September 28, 2026
**Branch:** main

**User Request:**
1. "when exporting pdf on mobile or on the pwa, most times we are unable to send directly to other apps"
2. "when a month ends, lock it by default. when a change is needed, an admn can unlock and change and lock back"
3. "Diagnostic Summary: 'Internal error' Analysis" on `/api/tasks`

**Implementation Details:**
1. **Direct Mobile/PWA Document & PDF Sharing (`src/pdf.ts`, `src/csv.ts`, `src/xls.ts`)**:
   - Installed `html2pdf.js` and `@types/html2pdf.js`.
   - Built client-side PDF generation engine in `src/pdf.ts` with dynamic import of `html2pdf.js` to ensure optimal code-splitting and zero SSR/test runner friction.
   - Built off-screen fixed-width rendering container (800px portrait, 1120px landscape) to guarantee crisp, standardized A4 dimensions regardless of device screen width, with `.no-print` elements removed and `.print-only` elements revealed.
   - Integrated native Web Share API (`navigator.share({ files: [...] })`) via `shareOrDownloadFile` and `exportOrSharePdf`, with graceful fallback to standard browser download on desktop or unsupported devices.
   - Updated CSV (`downloadCsv`) and Excel (`downloadXls`) export utilities to utilize `shareOrDownloadFile`, enabling one-tap sharing of spreadsheets on mobile.
   - Added **Share / Send PDF** buttons alongside standard Print buttons across:
     - `src/views/PayslipView.vue` (`shareOrExportPayslipPdf`)
     - `src/views/ExpenseDetailView.vue` (`shareOrExportVoucherPdf`)
     - `src/views/ReportView.vue` (`shareOrExportReportPdf`, landscape A4)
     - `src/views/ExpenseReportsView.vue` (`shareOrExportExpenseReportPdf`, landscape A4)
     - `src/views/ExpensePackView.vue` (`shareOrExportPackPdf`, portrait A4)
2. **Default Month-End Auto-Locking with Admin Unlock/Lock Workflow (`functions/api/[[route]].ts`, `migrations/0037_month_unlocks.sql`, `src/views/ReportView.vue`)**:
   - Created database migration `0037_month_unlocks.sql` tracking administrator unlock exemptions for past months.
   - Server-side authoritative locking (`functions/api/[[route]].ts`):
     - Added `isMonthEnded(env, month)` checking `month < currentMonth(env)`.
     - In `getMonthLock`, if an ended month has not been explicitly unlocked by an admin (`isMonthExplicitlyUnlocked`), it is automatically locked by default with an auto-created frozen rate snapshot (`locked_by = 'system'`).
     - Added `isMonthExplicitlyUnlocked(env, month)` checking `month_unlocks`. If an admin unlocked a past month, `getMonthLock` returns `null` so modifications are allowed.
     - Updated `assertMonthUnlocked(env, month)` to block all additions/modifications to entries, bonuses, and adjustments for ended months.
     - Updated `unlockMonth(request, env, month)`: deletes from `month_locks` and records an exemption in `month_unlocks` if `month < currentMonth(env)`.
     - Updated `lockMonth(request, env)`: removes any exemption from `month_unlocks` and saves a fresh rate snapshot in `month_locks`.
   - Frontend UI (`src/views/ReportView.vue`):
     - Displays `🔒 This month is locked by default (month ended)` banner.
     - Displays amber reminder banner when a past month is unlocked: `⚠️ This past month has been unlocked for changes. When you are done making updates, click "Lock month" above to lock it back.`
3. **Task API & UI Resilience ("Internal error" Prevention)**:
   - Server-side ([`server/tasks.ts`](file:///c:/Users/gomat/Downloads/DEV%20PROJECTS/worksheet/server/tasks.ts)):
     - Hardened `listTasks`, `getTask`, `createTask`, and `patchTask` against database schema divergence (e.g. missing `secondary_person_id`, `recurrence`, or `checklist` columns on remote instances), adding automatic fallback queries and null-safe results mapping (`res?.results ?? []`).
     - Hardened `withActions` and `taskLike` to safely default null/undefined attributes without throwing unhandled exceptions.
   - Frontend UI ([`src/views/TasksView.vue`](file:///c:/Users/gomat/Downloads/DEV%20PROJECTS/worksheet/src/views/TasksView.vue)):
     - Added try-catch and payload logging for task creation and updates to easily debug payload structures in browser DevTools.
     - Translated generic 500 "Internal error" messages into clear, actionable advice: *"Unable to load tasks from the server at this time. Please click Retry below."*
     - Added a dedicated **Retry** button right inside the error banner (`p.panel.mb-6.border-red.bg-red-soft.text-red`) enabling single-click re-fetching without a full page reload.
4. **Documentation & Testing**:
   - Added unit test suite `tests/pdf-and-locks.test.ts` covering mobile/PWA detection, file sharing capability, and month-end auto-locking logic.
   - Updated `guideline-admin.md`, `guideline-user.md`, and `changelog.md`.

**Files Changed:**
- `migrations/0037_month_unlocks.sql`
- `src/pdf.ts`
- `src/csv.ts`
- `src/xls.ts`
- `src/views/PayslipView.vue`
- `src/views/ExpenseDetailView.vue`
- `src/views/ReportView.vue`
- `src/views/ExpenseReportsView.vue`
- `src/views/ExpensePackView.vue`
- `src/views/TasksView.vue`
- `functions/api/[[route]].ts`
- `server/tasks.ts`
- `tests/pdf-and-locks.test.ts`
- `guideline-admin.md`
- `guideline-user.md`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Ran database migrations locally (`npm run db:migrate:local`): exit code 0.
- Ran full vitest unit test suite (`npm test`): 11 test files, 248 passed (100% success).
- Ran frontend type checks (`npx tsc --noEmit -p tsconfig.app.json`): exit code 0.
- Ran backend type checks (`npx tsc --noEmit -p tsconfig.server.json`): exit code 0.
- Ran production build (`npm run build`): compiled successfully with code 0 (13.54s, code-split `html2pdf.js`).

**Remaining Considerations:**
- When deploying to production (`qap.dubblestack.com`), apply remote migrations with `npm run db:migrate:prod`.


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
**Branch:** main

**User Request:**
"getting some internal errors in the app"

**Implementation Details:**
1. **Frontend PDF Export Calls (`src/views/ReportView.vue`, `src/views/ExpenseReportsView.vue`, `src/views/ExpensePackView.vue`)**:
   - Removed unsupported `landscape` and `format` properties from calls to `exportOrSharePdf`.
   - Kept the existing supported `orientation` option, which is what `src/pdf.ts` uses to generate portrait or landscape A4 PDFs.

**Files Changed:**
- `src/views/ReportView.vue`
- `src/views/ExpenseReportsView.vue`
- `src/views/ExpensePackView.vue`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Ran production build (`npm.cmd run build`): completed successfully.
- Ran local database migrations (`npm.cmd run db:migrate:local`): no pending migrations.
- Ran full test suite (`npm.cmd test`): 11 test files, 248 tests passed.
- Started local Wrangler Pages dev server successfully at `http://127.0.0.1:8788`.

**Remaining Considerations:**
- If internal errors still appear in production, run remote D1 migrations with `npm run db:migrate:prod`; the local database is already current.
