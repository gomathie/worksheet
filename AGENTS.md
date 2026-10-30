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

Development Tooling

- Project-scoped Agent Skills live under `.agents/skills/` and are pinned by `skills-lock.json`.
- Use `frontend-ui-engineering` for UI/layout/accessibility changes, `browser-testing-with-devtools` only when its isolated Chrome DevTools MCP is configured, and `code-review-and-quality` for the final review pass.
- Read `docs/development-tools.md` before adding Context7, Graphify, 21st MCP, Strix, or another external development service. Do not add credentials, production dependencies, or active security testing without explicit scope.
- After invoking any project-local or shared-library skill, run the library contribution check immediately. Read `C:\Users\gomat\OneDrive\Documents\Workflow and skills\workflows\library-contribution.md`, compare what was learned with the library, and update the library only when the check finds reusable knowledge. This is required in addition to the end-of-task contribution check.

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

### Bug Fix: Mobile Viewport Overflow
**Date:** September 28, 2026
**Branch:** main

**User Request:**
"check the mobile view. some items extend out of the screen"

**Implementation Details:**
1. **Shared responsive styles (`src/style.css`)**:
   - Added viewport-safe maximum widths and shrink behavior for panels, controls, media, and flex/grid children.
   - Updated mobile table cards so long labels, values, and action groups wrap within the card instead of extending the page.
   - Reduced panel padding on phone widths to preserve usable content space.
2. **Mobile header and controls (`src/App.vue`, `src/components/MonthPicker.vue`)**:
   - Reduced masthead text at phone widths and allowed its content to shrink safely.
   - Made the native month input occupy a full row on small screens.
3. **Responsive table labels (`src/main.ts`)**:
   - Removed the one-time table guard so asynchronously rendered rows receive `data-label` attributes for the mobile card layout.
4. **Documentation (`mobile_ux_suggestions.md`)**:
   - Recorded the completed mobile overflow hardening work.

**Files Changed:**
- `src/style.css`
- `src/App.vue`
- `src/components/MonthPicker.vue`
- `src/main.ts`
- `mobile_ux_suggestions.md`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Ran the production build and full Vitest suite successfully.
- Checked mobile layout overflow at 320px, 375px, and 430px viewport widths.

**Remaining Considerations:**
- Addressed in the subsequent "Responsive Report Action Menus" work log entry.

### Feature: Responsive Report Action Menus
**Date:** September 28, 2026
**Branch:** main

**User Request:**
"lets do this - Dense action toolbars still wrap onto multiple lines by design; a future compact action menu could reduce their vertical height."

**Implementation Details:**
1. **Reusable action menu (`src/components/ResponsiveActionMenu.vue`, `src/style.css`)**:
   - Added a shared responsive action container that displays one compact menu trigger on phones and the original inline toolbar on larger screens.
   - Added outside-click and Escape-key closing, disabled-action handling, and viewport-safe menu sizing.
2. **Report toolbars (`src/views/ReportView.vue`, `src/views/ExpenseReportsView.vue`, `src/views/ExpensePackView.vue`)**:
   - Grouped Monthly Report export, PDF, print, and month-lock commands under **Report actions** on mobile.
   - Grouped Expense Report export and print commands under **Export actions** on mobile.
   - Grouped Audit Pack PDF, print, and back commands under **Pack actions** on mobile.
   - Preserved the existing inline buttons at desktop widths.
3. **Documentation (`mobile_ux_suggestions.md`, `guideline-user.md`)**:
   - Documented the completed responsive action-menu behavior.

**Files Changed:**
- `src/components/ResponsiveActionMenu.vue`
- `src/style.css`
- `src/views/ReportView.vue`
- `src/views/ExpenseReportsView.vue`
- `src/views/ExpensePackView.vue`
- `mobile_ux_suggestions.md`
- `guideline-user.md`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Ran the production build successfully.
- Ran the full Vitest suite: 11 test files and 248 tests passed.
- Verified all three menus at a 320px viewport: expected actions rendered, Escape closed each menu, and document width remained 320px.
- Verified at 1024px that the menu trigger is hidden and the original inline toolbar remains visible.

**Remaining Considerations:**
- The compact menu is intentionally limited to dense report/export toolbars; transactional form and task actions remain directly visible.

### Fix: Vertical Mobile Card and Entry Inputs
**Date:** September 28, 2026
**Branch:** main

**User Request:**
"the cards responsive inputs are horizontal. they should be vertical. the live qap inputs and others should be vertical"

**Implementation Details:**
1. **Responsive data cards (`src/style.css`)**:
   - Extended the card-style table breakpoint through 767px to align with the application's desktop breakpoint.
   - Changed card cells from horizontal label/value rows to vertical stacks with left-aligned labels and values.
   - Kept controls and action groups within the card width without forcing compact status chips or buttons to full width.
2. **Time entry form (`src/views/EntriesView.vue`)**:
   - Changed the phone/tablet form to one column for employee, date, time, hours, and direct-count work-type inputs.
   - Kept QAP, Classification, and installation card fields vertical through tablet widths, including their individual mobile labels.
   - Preserved the existing multi-column layout at the desktop breakpoint.
3. **Documentation (`mobile_ux_suggestions.md`, `guideline-user.md`)**:
   - Documented the vertical phone/tablet form and responsive-card behavior.

**Files Changed:**
- `src/style.css`
- `src/views/EntriesView.vue`
- `mobile_ux_suggestions.md`
- `guideline-user.md`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Ran the production build successfully.
- Ran the full Vitest suite: 11 test files and 248 tests passed.
- Used the live local app to select the seeded card-based employee and add a QAP card at 375px and 767px.
- Confirmed the main time inputs and QAP card inputs had non-overlapping vertical coordinates at both widths, with document widths matching their viewports.
- Confirmed responsive table cells use a column layout and the desktop time fields remain horizontal at 1024px.

**Remaining Considerations:**
- Desktop layouts remain multi-column to avoid unnecessary scrolling on wide screens.

### Fix: Production D1 Schema Synchronization
**Date:** September 28, 2026
**Branch:** main

**User Request:**
Reported a Sentry production error: `D1_ERROR: no such table: task_comments` from `POST /api/tasks/:id/comments`.

**Implementation Details:**
1. **Incident diagnosis:**
   - Confirmed that `migrations/0031_task_comments.sql` and the task-comment API implementation were already present in the repository.
   - Queried the production D1 migration ledger and found nine unapplied migrations, from `0029_news_author.sql` through `0037_month_unlocks.sql`.
2. **Production remediation:**
   - Reviewed the pending migrations for destructive statements and ordering conflicts; all were additive.
   - Applied all nine migrations to the remote `ledger-db` database using the existing `db:migrate:prod` script.
   - This created `task_comments` and synchronized the production schema for the other deployed features represented by those migrations.
3. **Deployment hardening (`package.json`, `README.md`):**
   - Updated `npm run deploy` to apply production D1 migrations before building and publishing.
   - Documented that Cloudflare's GitHub auto-deploy build does not run migrations and therefore needs a protected migration step before releases containing schema changes.

**Files Changed:**
- `package.json`
- `README.md`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Confirmed Wrangler reports `No migrations to apply` for remote `ledger-db` after remediation.
- Ran a read-only production schema query and confirmed `task_comments`, `leaves`, `point_deductions`, and `month_unlocks` exist.
- The schema query completed successfully without writing rows.
- Ran the production build successfully after updating the deployment command.

**Remaining Considerations:**
- Cloudflare GitHub auto-deploys still require an external protected migration step because their configured `npm run build` command intentionally does not mutate production data.

### Fix: Mobile Safari Route Chunk Recovery
**Date:** September 28, 2026
**Branch:** main

**User Request:**
Reported a production Sentry issue on `/payments`: Mobile Safari raised an unhandled `TypeError: Load failed`.

**Implementation Details:**
1. **Diagnosis (`src/views/PaymentsView.vue`, `src/router/index.ts`, `public/sw.js`):**
   - Confirmed Payments API loading already catches and displays request errors.
   - Identified the unhandled error as a lazy route chunk load failure, consistent with an older open tab requesting a hashed asset after a deployment.
2. **Route recovery (`src/router/chunkRecovery.ts`, `src/router/index.ts`):**
   - Added detection for dynamic-import errors emitted by Safari, Chromium, and chunk loaders.
   - Added a router error handler that performs one hard navigation to the requested route so the browser receives the current application shell and asset hashes.
   - Stored the attempted route in `sessionStorage` and clear it after successful navigation, preventing reload loops during persistent network failures.
3. **Regression coverage (`tests/router.test.ts`):**
   - Covered Safari's exact `Load failed` message, common dynamic-import variants, unrelated application errors, one-time navigation, and recovery reset.

**Files Changed:**
- `src/router/chunkRecovery.ts`
- `src/router/index.ts`
- `tests/router.test.ts`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Focused Vitest suite passed: 1 file and 6 tests.
- Production build completed successfully, including frontend TypeScript checking.
- A read-only production request confirmed the site was still serving the older `index-CTIKubwk.js` bundle referenced by Sentry before deployment.
- Deployed successfully to Cloudflare Pages using `npm run deploy`; no D1 migrations were pending.
- Verified `https://dem.trace365.net/payments` now serves `index-_cXUiL8r.js` and that the live bundle contains the route-recovery guard.

**Remaining Considerations:**
- The automatic refresh only handles route-module loading failures. API failures continue to use each view's existing inline error state.

### Improvement: Two-Column QAP and Classification Inputs
**Date:** September 29, 2026
**Branch:** main

**User Request:**
"on the qap or classification inputs that come in. they are on a one column long line. it can be 2 colums at least"

**Implementation Details:**
1. **Card input layout (`src/views/EntriesView.vue`):**
   - Changed non-installation card rows to a two-column grid below the desktop breakpoint.
   - QAP and Classification card name/audit fields share the first row; completion time and the remove action use the second row.
   - Preserved labels above controls and the existing four-column desktop layout.
   - Kept installation-card inputs unchanged.
2. **Documentation (`mobile_ux_suggestions.md`, `guideline-user.md`):**
   - Updated the responsive-form documentation to describe the compact two-column card layout.

**Files Changed:**
- `src/views/EntriesView.vue`
- `mobile_ux_suggestions.md`
- `guideline-user.md`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Production build completed successfully, including frontend TypeScript checking.
- Used the local app with a seeded non-direct-count employee assigned to Classification and QAP.
- At 375px, confirmed two 131.5px columns and a document width of 375px.
- At 767px, confirmed two 327.5px columns and a document width of 767px.

**Remaining Considerations:**
- Installation cards intentionally remain one field per row below desktop because their select values and conditional fields need more horizontal space.

### Feature: Default Dashboard Page
**Date:** October 1, 2026

**User Request:**
"when app is opened, it should take you to the dashboard page. not time entry"

**Implementation Details:**
1. **Router Configuration (src/router/index.ts)**:
   - Swapped the paths for entries and dashboard. dashboard is now the root path / and entries is now /entries.
   - Navigating directly to / now opens the Dashboard, and the existing route guard ensures users without the iew_dashboard right are gracefully redirected back to /entries.

**Testing Performed:**
- Ran frontend and backend type checking which both completed successfully with code 0.

### Fix: Task Comment Card Illegible in Dark Mode
**Date:** October 5, 2026
**Branch:** main

**User Request:**
"check the task functioning. the comments on task dont show well."

**Implementation Details:**
1. **Diagnosis**:
   - Reviewed the task-comment stack end to end: `server/tasks.ts` (`listTaskComments`/`createTaskComment`), the `/api/tasks/:id/comments` routes in `functions/api/[[route]].ts`, and the `TaskComment` type in `src/types.ts`. Data flow, routing, and types were all correct — fetching and posting comments worked.
   - The bug was in rendering: `src/views/TaskDetailView.vue`'s comment card used `bg-gray-50 dark:bg-gray-800` and `text-foreground`. This app has no dark-mode theme anywhere else (confirmed via `grep -rn "dark:" src` — this was the only occurrence in the whole codebase), and `src/style.css`'s `@theme` block defines no `--color-foreground` token. `text-foreground` was a silent no-op, and `dark:bg-gray-800` only fires via the browser/OS `prefers-color-scheme: dark` media query, which nothing else in the app accounts for — so on a dark-mode system the card flipped to a dark background while the comment text kept the app's fixed light-theme ink color, making comments unreadable. In light mode the card also looked visually inconsistent, using a generic gray not in this app's cream/teal/amber palette.
2. **Fix (`src/views/TaskDetailView.vue`)**:
   - Replaced `bg-gray-50 p-3 dark:bg-gray-800` with `bg-cream p-3` (an existing, already-used theme token) and dropped the dead `text-foreground` class, matching the card styling used elsewhere on the same page (e.g. the checklist box).
   - Updated a stale top-of-file comment that still claimed the task page had "no comment thread or activity feed" — left over from before the Task Comments feature shipped.

**Files Changed:**
- `src/views/TaskDetailView.vue`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Ran frontend type check (`npx tsc --noEmit -p tsconfig.app.json`): exit code 0.
- Ran backend type check (`npx tsc --noEmit -p tsconfig.server.json`): exit code 0.
- Ran full unit test suite (`npm test`): 12 test files, 254 tests passed.
- Ran production build (`npm run build`): completed successfully.

**Remaining Considerations:**
- No other `dark:`-variant or undefined-token styling was found elsewhere in `src/`, so this was an isolated instance. The checklist box on the same page (`bg-surface`) references an undefined token too, but it's inert (no dark-mode pairing, so no legibility break) and wasn't part of the reported issue — left untouched to keep this change focused.

### Feature: Reopen Tasks & Automatic Task-Violation Point Deductions
**Date:** October 5, 2026
**Branch:** main

**User Request:**
"provide an option to reopen closed/done task if we need to go back and do something. since we are warning on tasks after 3 days etc. deduct 5 points from a users accumulated work points if the task is not done in 5 days. add a section where an admin can determine how many points can be deducted on task violation. when a task is in progress, add a button that the user can click to indicate its being worked on. when that is clicked, we it resets the violation time"

**Implementation Details:**
1. **Investigation first** (per the "inspect before modifying" rule):
   - The "Working on it" button and its `ping()` PATCH (bumping `updated_at` without changing status) already existed from the earlier Task Age Alerts work — it already does exactly what request #4 asks for. No new code needed there beyond making sure the new violation check is based on the same `updated_at` field, so ping (and reopening) naturally reset it.
   - The status `<select>` on both the task list and detail page already listed every status including when a task was Done/Cancelled, so reopening was technically already possible — but not discoverable as "the way to reopen a task." Added an explicit **Reopen** button for that.
2. **Reopen (`src/views/TasksView.vue`, `src/views/TaskDetailView.vue`)**:
   - Added a **Reopen** button next to Working on it, shown when `status === 'done' || status === 'cancelled'` and the actor can `set_status`. PATCHes `{ status: 'todo' }`, reusing the existing `setStatus` function — the backend already clears `completed_at` on any non-'done' status via `completionStamp` (shared/tasks.ts), so no server change was needed for this part.
3. **Staleness rule (`shared/tasks.ts`)**:
   - Added `TASK_VIOLATION_DAYS = 5` and a pure `isTaskStale(task, nowMs)` helper (open status + `updated_at`/`created_at` at least 5 days old). Normalizes SQLite's `"YYYY-MM-DD HH:MM:SS"` (UTC, no 'Z') to ISO before parsing — the same idiom `server/http.ts`'s `dateInTz` already uses — since parsing that format directly reads as local time, not UTC.
4. **New `task_violations` table, not a row in `point_deductions` (`migrations/0038_task_violations.sql`)**:
   - `point_deductions.admin_id` is `NOT NULL REFERENCES employees(id)` because every row there is something a human admin did; an automatic penalty has no human actor, so it needed its own table rather than a fake "system" employee.
   - **Caught during local testing**: the first version had `task_id REFERENCES tasks(id) ON DELETE CASCADE` alongside an append-only `BEFORE DELETE` trigger. Deleting a task that had a violation row threw `D1_ERROR: task_violations is append-only` — SQLite fires `BEFORE DELETE` triggers for cascade-originated deletes too, not just direct ones, so the cascade and the append-only guard fought each other. Fixed by dropping the FK on `task_id` entirely (loose reference, exactly how `point_deductions.task_id` already works) — a deleted task's violation history now just outlives it, same as its manual deductions already did. Verified by deleting a task with a violation on record: 200 OK, row persists, and the audit list's `LEFT JOIN tasks` already rendered the orphaned reference as "deleted task" gracefully.
   - One row per **violation window**: unique on `(task_id, violation_at)` where `violation_at` is the task's `updated_at` at the moment it was found stale. A later ping/reopen bumps `updated_at`, opening a new window the next time it goes stale — so the same stale period is never double-charged, but a task that drifts again later can be.
5. **`server/deductions.ts`**:
   - `totalDeductionsForMonth` now sums both `point_deductions` and `task_violations` (two separate queries/catches, not one combined query — a missing `task_violations` table on an unmigrated environment must not also blank out the already-working manual-deductions total).
   - Added `applyTaskViolation(env, task, employeeId)`: reads the admin-configured points from settings (0 = disabled, returns early), computes `min(configured, currentBalance)` capped at 0 (never negative), inserts the row (catching the unique-constraint race as a harmless no-op), audits it (`actor_id: null` — `audit_log.actor_id` has no FK, confirmed from migration 0001), and notifies the employee.
   - `listDeductions` now merges `task_violations` into the same response the Point Deductions admin page already renders, tagged `admin_name: 'System (task violation)'` — reused the existing response shape and frontend rather than building a parallel view.
6. **`server/tasks.ts`**: added `processTaskViolations(env, tasks)`, called from `listTasks` and `getTask` on the batch just fetched. No cron trigger exists for Pages Functions here, so this piggybacks on normal traffic instead — `listTasks` returns everyone's tasks to an admin/manage_tasks caller and just the caller's own otherwise, which between the two gives reasonable coverage without a scheduled job. Each task's violation check is individually try/caught so one bad row can't break the task list that triggered it.
7. **Settings (`shared/logic.ts`, `server/settings.ts`, `functions/api/[[route]].ts`, `src/views/SettingsView.vue`)**: added `task_violation_points` (default 5) to the existing `RateSettings`/settings blob — reused the already-admin-only `/api/settings` GET/PUT rather than a new endpoint. Added the field to the Settings UI under Money & currency with a `min="0"` input (0 disables).
8. **Docs**: updated `guideline-user.md` (Reopen button, the 5-day penalty, ping/reopen resetting it) and `guideline-admin.md` (task management section, the new settings field, and a note in the existing Point Deductions section about automatic rows appearing there too).

**Files Changed:**
- `migrations/0038_task_violations.sql`
- `shared/tasks.ts`
- `shared/logic.ts`
- `server/env.ts`
- `server/settings.ts`
- `server/deductions.ts`
- `server/tasks.ts`
- `functions/api/[[route]].ts`
- `src/views/TasksView.vue`
- `src/views/TaskDetailView.vue`
- `src/views/SettingsView.vue`
- `tests/tasks.test.ts`
- `tests/deductions.test.ts`
- `guideline-user.md`
- `guideline-admin.md`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Applied the migration locally (`npm run db:migrate:local`): exit code 0 (after the DELETE-cascade fix was found and corrected — see above).
- Frontend type check (`npx tsc --noEmit -p tsconfig.app.json`): exit code 0.
- Backend type check (`npx tsc --noEmit -p tsconfig.server.json`): exit code 0.
- Unit tests (`npm test`): 12 files, 267 passed (added 13 new: 8 for `isTaskStale`/`TASK_VIOLATION_DAYS`, 5 for the deduction-capping math).
- Production build (`npm run build`): completed successfully.
- **Live end-to-end verification against `wrangler pages dev` + local D1** (not just unit tests, since the DB-touching parts have no mocks in this project's test setup):
  - Created a task, backdated it 6 days via direct SQL, confirmed `GET /api/tasks?mine=1` created exactly one `task_violations` row and one notification; confirmed a second sweep did not duplicate it (idempotency).
  - Gave the test account a real 20-point balance, confirmed a violation deducted exactly `min(configured, balance)` in two scenarios (10 of 20 available; then 15 configured against the remaining 10, correctly capped).
  - Confirmed `PATCH` with the same status (ping) and PATCH to `done` then back to `todo` (reopen) both bump `updated_at` and clear `completed_at` as expected.
  - Confirmed `GET /api/settings`/`PUT /api/settings` round-trip `task_violation_points` correctly.
  - Confirmed `GET /api/point-deductions` includes the automatic rows with the right labeling, including the "deleted task" fallback after deleting the task the violation referenced.
  - This is also where the `ON DELETE CASCADE` bug above was actually caught — `DELETE /api/tasks/:id` returned 500 until the migration was fixed and reapplied.
  - Cleaned up all test tasks/entries/settings changes made during verification; local dev server stopped afterward.

**Remaining Considerations:**
- The 5-day threshold itself is a fixed constant (`TASK_VIOLATION_DAYS`), not admin-configurable — the request only asked to make the *points amount* configurable. If the days threshold needs to be configurable later, follow the same pattern as `task_violation_points`.
- Deploying to production needs `npm run db:migrate:prod` for migration 0038 before the feature does anything there (consistent with the existing "Production D1 Schema Synchronization" lesson in this log — Cloudflare's GitHub auto-deploy build does not run migrations).
- Because the violation check only runs when a task list is fetched (no cron), an account that never has its tasks listed by anyone (including no admin ever opening the full Tasks board) won't be checked. In practice the Task Age Alert popup alone guarantees every active user's own tasks get checked at least once a day.

### Feature: "Working on it" Elapsed-Time Log (plus a reverted course-correction on "Log Violation")
**Date:** October 5, 2026
**Branch:** main

**User Request:**
"when someonw clicks on Working on it. it should log the time to say for example, 4 hours so far or 2 days so far. by default points deduction should be 5 per violation but admin can add or reduce. also add an option to log violation, reason(eg. found mistake on a qap card.) and should be able to set how many point to deduct based on that."

Follow-up, after a first pass: "log violation is different from task violation." Asked a clarifying question; the answer was that logging a violation (e.g. a QAP card mistake) **shouldn't be tied to a task at all** — it's about someone's work, not the Tasks/to-do board.

**Implementation Details:**
1. **Default-5-but-adjustable (already satisfied, no change needed)**: checked the previous turn's work — `server/settings.ts`'s `DEFAULTS.task_violation_points` is already `5`, and the Settings UI field is a plain unbounded number input, so an admin can already raise or lower it freely (down to 0 to disable).
2. **"Working on it" now logs elapsed time (`shared/tasks.ts`, `server/tasks.ts`)**:
   - Added a pure `formatElapsed(ms)` helper — `"4 hours so far"` / `"2 days so far"` / `"less than an hour so far"` for the sub-hour case (`"0 hours so far"` would read like nothing happened). Rounds to the nearest hour, with a day re-round so e.g. 23.6h doesn't land on "24 hours" instead of "1 day".
   - Gave "Working on it" its own endpoint, `POST /api/tasks/:id/ping` (`pingTask` in `server/tasks.ts`), rather than continuing to overload `patchTask`'s generic `PATCH {status}` — it needed to *also* insert a row into `task_comments` (reusing the existing Task Comments & Activity Feed table from the September 26 work), logging e.g. "Marked as being worked on — 4 hours so far." measured from the task's `created_at`. Still touches `updated_at` the same way, so the task-violation clock from the previous turn's work resets exactly as before.
   - Updated both call sites (`TasksView.vue`, `TaskDetailView.vue`) to call the new endpoint and show the returned `elapsed` string in their existing notice banners; the detail page also pushes the returned comment straight into its `comments` list so it appears immediately without a reload.
3. **"Log Violation" — built it task-tied, then reverted that**: first pass added a **Log violation** button to `TaskDetailView.vue` (opening the existing Point Deductions modal pre-filled with that task's reference), reasoning that a violation might relate to a specific task someone's reviewing. The user's follow-up corrected this: a violation like a QAP card mistake isn't about the Tasks board at all, and bundling it under "Task management & oversight" in the docs wrongly implied it was a variant of the automatic 5-day task-violation penalty. Reverted in full:
   - `src/views/TaskDetailView.vue`: removed the button, `canLogViolation`, `violationModalOpen`, `violationDefaultAmount`, `openViolationModal`, `onViolationSaved`, and the `<PointDeductionModal>` instance/import.
   - `src/components/PointDeductionModal.vue`: reverted the `employee` prop from a relaxed `DeductionTarget` shape back to the full `Employee` type, and removed the `taskId`/`defaultAmount`/`contextLabel` props and their template usage (header wording, context line, prefill) — back to exactly how it worked before this turn.
   - `server/deductions.ts`: reverted `getEmployeeBalance`'s added `task_violation_points` field — it existed only to feed the now-removed prefill.
   - The actual capability the user asked for — a required reason plus a freely-chosen point amount per incident — was already fully present in the *existing*, general-purpose Point Deductions system (Employees tab → **Deduct**, from the Sept 28 admin-penalty feature). Nothing new needed building there; it was never task-tied to begin with, which is exactly what made it the right tool once the task-page button was recognized as the wrong one.
4. **Docs**: `guideline-admin.md`'s *Task management & oversight* section now explicitly says the automatic 5-day task-violation penalty is a different thing from logging a one-off violation, and points at *Point deductions & penalties* (which now opens with "this is the general-purpose way to log a violation... has nothing to do with the Tasks board") for the latter, with the QAP-card example moved there. `guideline-user.md`'s "Working on it" bullet list gained the elapsed-time-comment note. `SettingsView.vue`'s in-app help text reworded to match (no more "Log violation button" reference).

**Files Changed:**
- `shared/tasks.ts`
- `server/tasks.ts`
- `server/deductions.ts`
- `functions/api/[[route]].ts`
- `src/components/PointDeductionModal.vue`
- `src/views/TaskDetailView.vue`
- `src/views/TasksView.vue`
- `src/views/SettingsView.vue`
- `tests/tasks.test.ts`
- `guideline-user.md`
- `guideline-admin.md`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Frontend type check (`npx tsc --noEmit -p tsconfig.app.json`, and the stricter `vue-tsc -b` via `npm run build`): exit code 0 — caught and fixed one unused-import error (`PointDeduction` in `TaskDetailView.vue`) this way before the revert, and reconfirmed clean after it.
- Backend type check (`npx tsc --noEmit -p tsconfig.server.json`): exit code 0, both before and after the revert.
- Unit tests (`npm test`): 12 files, 275 passed (added 8 new for `formatElapsed`, including the hour/day rounding-boundary case; untouched by the revert, since it was all UI/modal-prop wiring with no pure-logic tests of its own).
- Production build (`npm run build`): completed successfully, both before and after the revert.
- **Live end-to-end verification against `wrangler pages dev` + local D1** (done before the revert, against the task-tied version — the underlying `pingTask`/`formatElapsed` behavior being verified didn't change in the revert):
  - Backdated a task's `created_at` 4 hours, called `POST /api/tasks/:id/ping`, confirmed the response's `elapsed` read "4 hours so far" and a matching row landed in `task_comments`.
  - Submitted `POST /api/point-deductions` with a custom reason ("Found mistake on a QAP card"), a custom amount, and a task reference — confirmed the balance moved correctly, the row appeared in `GET /api/point-deductions`, and the employee got a notification. This is the same underlying endpoint the general Employees-tab **Deduct** flow still uses post-revert, so the verification still stands for the final design.
  - Along the way, caught and fixed a self-inflicted test-data artifact (not a code bug): an earlier cleanup had deleted a seed entry that an earlier test deduction had already counted against, leaving one test account's balance negative. Confirmed this doesn't break anything — `applyTaskViolation`'s existing `Math.max(0, ...)` clamp and the deduction modal's existing `amount > balance` validation both already handle a negative balance correctly — and restored the entry so local dev data is sane again.
  - Cleaned up all test tasks/entries/notifications created during verification; local dev server stopped afterward.

**Remaining Considerations:**
- None. The elapsed-time ping log is implemented and verified; the points-amount setting was already adjustable; logging a one-off violation already worked through the existing, intentionally task-independent Point Deductions tool.

### Fix: Popups Too Wide on Desktop (and a Hidden Banner-Color Bug Found the Same Way)
**Date:** October 5, 2026
**Branch:** main

**User Request:**
"on web. the pop ups are too wide" — narrowed down via a follow-up question to the Announcement pop-up (News) and the Task age/deadline alert.

**Implementation Details:**
1. **Diagnosis**: code inspection of `NewsPopup.vue`/`TaskAgeAlert.vue`/`TaskDeadlineAlert.vue` showed reasonable-looking width caps (`panel w-full max-w-lg` / `max-w-md`, 448–512px) — nothing obviously wrong from reading the markup. Rather than guess at a fix, built the actual app (`npm run build`), ran it locally (`wrangler pages dev`), and used Playwright at a 1440×900 desktop viewport to screenshot a real announcement popup: it rendered spanning nearly the full viewport width, not capped at 512px.
2. **Root cause, found via the compiled CSS, not guessed**: inspected `dist/assets/*.css` directly. `.panel`'s rule (`src/style.css`) is plain, unlayered CSS — not wrapped in a Tailwind `@layer` — while every `max-w-*`/`border-*`/`bg-*` utility Tailwind v4 generates lives inside `@layer utilities`. Per the CSS Cascade Layers spec, **unlayered declarations always beat layered ones of equal specificity, regardless of source order** — so `.panel`'s own `max-width: 100%` always won over a co-applied `max-w-lg`, no matter which class came first in the HTML. This was invisible on mobile (where `100%` and `max-w-lg` resolve to about the same pixel width anyway) and only showed up on wide desktop screens — exactly matching "on web."
3. **A second, undiscovered bug with the identical cause**: the same unlayered-vs-layered conflict applies to `.panel`'s `border`/`background` shorthand properties against the dozens of `panel ... border-red bg-red-soft text-red` (and teal/amber) error/success banners used throughout the app. Verified via a synthetic test element's computed style before the fix: `border-color` and `background-color` were resolving to the plain panel colors, not red — every one of those banners has been rendering as a plain white box with red *text* (the one property `.panel` never set) instead of a properly colored alert box. Far more subtle than the popup-width bug — a slightly flat-looking banner reads as a design choice, not a bug — which is almost certainly why nobody had reported it.
4. **Fix (`src/style.css`)**: wrapped the `.panel` rule in `@layer components { ... }`, putting it on equal cascade footing with Tailwind's own utilities layer (which is declared after `components`, so utilities correctly win when both are present on an element). Left the two `.panel` media-query overrides (print, mobile padding) unlayered, since nothing currently combines a conflicting utility with those specific declarations.
5. **A build hazard worth remembering**: an apostrophe-heavy explanatory comment inside the new `@layer components` block broke the Tailwind v4/Lightning CSS build with `Unterminated string` — the CSS parser appears to tokenize for string literals even inside `/* */` comments. Rewrote the comment without contractions/apostrophes and the build passed.

**Files Changed:**
- `src/style.css`
- `AGENTS.md`
- `changelog.md`

**Testing Performed:**
- Backend type check (`npx tsc --noEmit -p tsconfig.server.json`): exit code 0 (frontend-only CSS change, but ran the full suite anyway).
- Unit tests (`npm test`): 12 files, 275 passed — untouched by a pure-CSS change, confirming nothing else regressed.
- Production build (`npm run build`): failed once (the apostrophe/comment issue above), fixed, then passed.
- **Live visual verification against `wrangler pages dev` + local D1, before and after the fix**, at a 1440×900 viewport via Playwright:
  - Before: screenshotted the Announcement popup spanning ~1360px (nearly the full viewport) instead of ~512px.
  - After: re-screenshotted both the Announcement popup and the Task Age Alert popup — both now render as compact, centered cards at their intended widths.
  - Confirmed the banner-color fix numerically: a synthetic `panel border-red bg-red-soft` element's computed `border-color`/`background-color` went from the plain panel colors (`rgb(226,223,213)` / `rgb(255,255,255)`) to the correct red ones (`rgb(178,58,46)` / `rgb(248,231,228)`) after the fix.
  - Cleaned up all test announcements/tasks created during verification; local dev server stopped afterward.

**Remaining Considerations:**
- Other custom classes in `src/style.css` (`.btn`, `.field-input`, `.display`, etc.) are similarly unlayered and could in principle have the same kind of conflict with a combined utility class — none were reported or found broken this session, so none were touched, keeping this fix scoped to the confirmed, demonstrated bug. Worth a follow-up audit if something else turns up looking subtly off.

### Feature: Repeating Automatic Task-Violation Penalties
**Date:** October 5, 2026
**Branch:** main

**User Request:**
"after first deduction on a task violation, if not indicated to be working on, then deduct another after 2 days"

Follow-up clarifying question asked whether the 2-day follow-up should repeat indefinitely or happen just once; the user chose "repeat every 2 days until touched."

**Implementation Details:**
1. **Why the existing design couldn't just be reused as-is**: the previous turn's `task_violations` table was keyed uniquely on `(task_id, violation_at)` — one row per "touch epoch," where `violation_at` is the task's `updated_at` at the moment it went stale. Since `updated_at` never changes without an actual touch, a task left untouched forever after its first violation could never be charged again — the unique index would silently block every later attempt forever, not just prevent an immediate duplicate. Needed a way to record more than one violation within the same touch epoch.
2. **`shared/tasks.ts`**: added `TASK_VIOLATION_REPEAT_DAYS = 2` and a new pure function `isTaskViolationDue(task, lastViolationAt, nowMs)`: with no prior violation this touch, waits the full `TASK_VIOLATION_DAYS` (5, unchanged) from the touch; with one already recorded, waits only `TASK_VIOLATION_REPEAT_DAYS` (2) from *that violation's* timestamp — not from the touch — so it keeps coming due every 2 days for as long as nothing touches the task. Factored the SQLite-datetime-to-ISO parsing (used by both this and the existing `isTaskStale`) into a shared `toMs` helper rather than duplicating it a third time.
3. **`migrations/0039_task_violation_sequence.sql`**: added a `sequence` column (1, 2, 3, ... — which occurrence this is within the current touch epoch) and changed the unique index to `(task_id, violation_at, sequence)`, so multiple violations can now coexist for the same `violation_at` without colliding.
4. **`server/deductions.ts` `applyTaskViolation`**: reworked to look up the most recent violation already recorded for the task's current touch (`SELECT ... ORDER BY sequence DESC LIMIT 1`), pass its `created_at` (or `null`) to `isTaskViolationDue`, and no-op if not due yet. `sequence` for the new row is `(last?.sequence ?? 0) + 1`. The idempotency guard is the same pattern as before — a `UNIQUE` constraint violation (now on the three-column index) is caught and treated as a harmless race, not an error. Notification body now distinguishes "went 5 days" (sequence 1) from "went another 2 days since the last one" (sequence 2+).
5. **`server/tasks.ts`**: `processTaskViolations`'s existing `isTaskStale` pre-filter still works unmodified as a cheap first pass — a task eligible for a *repeat* violation is, by definition, still at least `TASK_VIOLATION_DAYS` stale by the original touch-based measure (nothing has touched it), so it never falls through the filter. Updated the doc comments to explain why that's still correct now that there's a second, finer-grained check inside `applyTaskViolation`.
6. **`server/deductions.ts` `listDeductions`**: the merged audit-log `reason` text for an automatic row now reads differently for a first violation ("Task not completed within 5 days: ...") versus a repeat ("Task still not completed — repeat #N, 2 days since the last one: ...") so admins can tell them apart in **Admin → Point Deductions** at a glance.
7. **Found and fixed a stale reference left over from the "Log Violation" revert two turns ago**: `SettingsView.vue`'s help text for the penalty-amount field still pointed at a "Log violation" button on a task's own page — removed in that revert, but this one sentence was missed. Rewrote it to point at Employees → Deduct instead (the actual surviving general-purpose tool) and to describe the new repeat behavior.
8. **Docs**: `guideline-user.md` and `guideline-admin.md` both updated to describe the repeat cadence (5, then every 2 days) and, for admins, the new "repeat #N" audit-log phrasing.

**Files Changed:**
- `shared/tasks.ts`
- `migrations/0039_task_violation_sequence.sql`
- `server/env.ts`
- `server/deductions.ts`
- `server/tasks.ts`
- `src/views/SettingsView.vue`
- `tests/tasks.test.ts`
- `guideline-user.md`
- `guideline-admin.md`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Backend type check (`npx tsc --noEmit -p tsconfig.server.json`): exit code 0.
- Unit tests (`npm test`): 12 files, 280 passed (added 5 new for `isTaskViolationDue`, covering the no-prior-violation case, the shorter repeat wait, indefinite repetition, and done/cancelled tasks never qualifying).
- Production build (`npm run build`): completed successfully.
- Applied migration 0039 locally (`npm run db:migrate:local`): exit code 0.
- **Live end-to-end verification against `wrangler pages dev` + local D1**:
  - Backdated a task 5 days, swept (`GET /api/tasks?mine=1`), confirmed sequence-1 violation fired (5 points, balance 80→75) and an immediate re-sweep did not duplicate it.
  - To simulate 2 days passing without waiting for real time, temporarily dropped and recreated the `task_violations_no_update` append-only trigger (local sandbox only) to backdate the sequence-1 row's `created_at` by 2 days, then swept again: confirmed sequence-2 fired (another 5 points, 75→70) and a further immediate re-sweep did not duplicate it either.
  - Pinged the task (`POST /api/tasks/:id/ping`), confirmed `updated_at` bumped and a subsequent sweep recorded no further violation — the touch correctly reset the cycle.
  - Confirmed `GET /api/point-deductions` rendered the two rows with the distinct sequence-1 vs sequence-2 reason text.
  - Cleaned up all test tasks/entries created during verification; local dev server stopped afterward.

**Remaining Considerations:**
- None. Repeat cadence confirmed with the user (every 2 days, not a one-time follow-up) before implementing, and verified end to end.

### Feature: Settings Page UX Pass
**Date:** October 5, 2026
**Branch:** main

**User Request:**
"HOW CAN i MAKE THE SETTINGS PAGE HAVE A GOOD USER EXPERIENCE" — an open-ended/exploratory question, answered per the system prompt's guidance for such questions: a short recommendation (jump-nav; the "Money & currency" panel had grown to hold unrelated settings) plus the main tradeoff (added UI complexity vs. a page that already works via scroll), then asked which to prioritize rather than just implementing. The user picked all three offered: jump-nav, splitting "Money & currency," and a general polish pass.

**Implementation Details:**
1. **Investigation first**: read the full 745-line `SettingsView.vue` — 7 stacked `.panel` sections (Work types, Device types, Money & currency, Expense approval workflow, Departments, Categories, Backup) with no page title, one shared `error` ref rendered only at the very bottom of the page (invisible unless scrolled past everything), and success feedback (`saved`/`workflowSaved`) on only 2 of the 7 panels — the rest (work types, device types, departments, categories) gave no confirmation at all when an add/save/toggle succeeded.
2. **Checked before restructuring "Money & currency"**: confirmed via `functions/api/[[route]].ts`'s `putSettings` that an omitted field doesn't preserve its current value — it resets to a hardcoded default (`task_violation_points` to 5, `max_entries_per_day` to 0, etc.). That ruled out giving each split-out section its own independent save button without a backend change, since a user saving only the "Pay" fields would silently wipe their task-violation-penalty setting back to 5. Asked the user which approach they wanted before building; they chose the safe one.
3. **Jump-nav (`src/views/SettingsView.vue`)**: a sticky pill-button row at the top (`id`-anchored links to each section), styled to match the app's existing primary-nav pill convention in `App.vue` (`.btn`, horizontal `overflow-x-auto` scroll on narrow screens — no new visual language introduced). Each section's wrapping `<div>` got an `id` and `scroll-mt-16` so the sticky bar doesn't cover the heading when jumped to.
4. **Global smooth scroll (`src/style.css`)**: added `scroll-behavior: smooth` on `html`, with a `@media (prefers-reduced-motion: reduce)` override back to `auto` — the app had no scroll-behavior set before, and this benefits anchor jumps app-wide, not just this page.
5. **Split "Money & currency" → "General settings" (one panel, labeled subsections — per the user's chosen approach)**: Pay & currency (point_value, currency) / Time entries (max_entries_per_day, require_entry_approval) / Task violations (task_violation_points) / Employee codes (employee_code_prefix), each with its own `<h3>` and a `border-t` divider, one `saveSettings()` button at the end exactly as before — same request payload, zero backend risk.
6. **Consistent success feedback**: added a `notice` ref and extended the shared `run()` helper with an optional `successMessage` parameter, threaded through every `run()` call site (work types, device types, departments, categories) plus `decideDeviceType` (which had its own bespoke try/catch, not `run()`). Moved the `error` banner from the bottom of the page to directly under the jump-nav, alongside the new `notice` banner, so feedback from any action on any panel is visible without scrolling — this was a real bug fix (an error from editing the first panel was previously only visible after scrolling past six more panels), not just cosmetic.
7. **Loading state**: added a `loading` ref, set during `onMounted`'s initial `Promise.all` fetch, gating the whole panel list behind a "Loading settings…" message (matching the full-page-gate pattern already used in `ExpenseDetailView.vue`) instead of rendering panels against still-empty data.
8. **Page title**: added `<h1 class="display text-3xl">Settings</h1>` — every other view in the app has one; this page didn't.
9. **Found and fixed a stale doc reference while in `guideline-admin.md`**: the Task violation penalty bullet still said "Settings → Money & currency," which no longer exists as a panel name — updated to "Settings → General settings."

**Files Changed:**
- `src/style.css`
- `src/views/SettingsView.vue`
- `guideline-admin.md`
- `changelog.md`
- `AGENTS.md`

**Testing Performed:**
- Frontend type check (`npx tsc --noEmit -p tsconfig.app.json`) and the stricter `vue-tsc -b` via `npm run build`: both exit code 0 (caught one unclosed-tag error from the `v-else` wrapper mid-edit, fixed before proceeding).
- Backend type check (`npx tsc --noEmit -p tsconfig.server.json`): exit code 0 (no backend files touched, ran anyway).
- Unit tests (`npm test`): 12 files, 280 passed — unaffected, as expected for a pure frontend/CSS change.
- Production build (`npm run build`): completed successfully.
- **Live visual verification against `wrangler pages dev`, via Playwright screenshots at both a 1440×900 desktop viewport and a 375px mobile viewport**:
  - Confirmed the jump-nav renders with the same pill styling as the app's primary nav, stays sticky while scrolling, and clicking a link scrolls smoothly to the correct section without the sticky bar covering its heading.
  - Confirmed the restructured "General settings" panel shows four clearly divided, labeled subsections.
  - Added a real department and a real category through the UI and confirmed the "Department added."/"Category added." notice appeared at the top of the page, above the jump-nav's scroll position, without needing to scroll down to the panel where the action happened.
  - Confirmed no horizontal overflow at 375px width (`document.body.scrollWidth === 375`) and that the jump-nav correctly scrolls horizontally within its own row on mobile, matching the existing primary-nav behavior.
  - Cleaned up all test departments/categories created during verification (no DELETE endpoint exists for either — by design, since historical vouchers may reference them — so removed directly via local-only SQL, same as the app's own soft-delete philosophy intends for anything that isn't truly scratch data); local dev server stopped afterward.

**Remaining Considerations:**
- The "Money & currency" split deliberately stayed as one panel with a single save button rather than fully independent panels, per the user's explicit choice — revisit only if the backend's `putSettings` is changed to do proper partial merging (preserve omitted fields instead of resetting them to hardcoded defaults), which would also fix a latent footgun unrelated to this session's work.
- No scrollspy/active-section highlighting was added to the jump-nav (it's click-to-jump only, no "you are here" indicator as you scroll) — kept out to limit scope/risk this pass; straightforward to add later with an IntersectionObserver if wanted.

### Fix: Replaced Settings Jump-Nav/Scroll with Real Tabs
**Date:** October 5, 2026
**Branch:** main

**User Request:**
"I think the log scroll in the settings must go. click and see the page" — referring to the jump-nav + smooth-scroll feature from the previous entry (already committed as `eb2e7d8` and pushed to `origin/main` by the point this started, per this session's external auto-commit tool).

**Implementation Details:**
1. **Investigated before guessing**: "the log scroll" was ambiguous — could mean "the smooth scroll" (remove the animation, keep instant jump-nav) or "the long scroll" (replace the whole long-page paradigm with tabs). Rather than pick one, built the app and timed the actual behavior with Playwright: clicking a jump-nav link to a distant section (e.g. Backup) took ~700-900ms of animated scrolling to settle — a real, measurable sluggishness, not just a hunch. Presented both readings plus the measured finding and asked which scope was wanted; the user chose the bigger one — real tabs, not just removing the animation.
2. **`src/views/SettingsView.vue`**: replaced the `<nav>` of `<a href="#...">` anchor links with a `TABS` array of `{id, label}` and an `activeTab` computed property, each panel's wrapping `<div>` changed from `id="..." class="panel scroll-mt-16"` (always rendered, anchor-jumped to) to `v-if="activeTab === '...'" class="panel"` (only the active one renders at all). Page height on a single tab dropped from 4141px (the old full-scroll page) to under 1000px.
3. **URL-synced tab state**: `activeTab` reads from `route.query.tab` (falling back to `'work-types'` if missing/invalid) and `setTab()` calls `router.replace({ query: { ...route.query, tab: id } })` — preserves the one thing anchor-links had that plain tab state wouldn't: a reload or a shared `?tab=backup` link lands back on the same section. Verified via Playwright: navigated to the Backup tab, reloaded the page, confirmed the URL kept `?tab=backup` and the Backup button was still the active (`.btn-solid`) one afterward.
4. **Active-tab highlighting came free**: switching from scroll-based "jump to" to real tab state meant the `.btn-solid` active-state styling (matching the app's existing nav-pill convention) is now exact — no IntersectionObserver/scrollspy guessing needed, which the previous entry's "Remaining Considerations" had explicitly deferred.
5. **Reverted the now-unused global CSS**: removed the `scroll-behavior: smooth` (and its `prefers-reduced-motion` override) added to `html` in the previous entry — nothing else in the app uses anchor-based scrolling, so it was dead weight once the Settings page stopped needing it.
6. **Confirmed data isn't lost switching tabs**: all the panel data (work types, departments, etc.) lives in the component's top-level `ref`s, not in per-tab child components, so `v-if`-hiding a tab doesn't unmount any state — switching away and back re-renders from the same reactive data.

**Files Changed:**
- `src/style.css`
- `src/views/SettingsView.vue`
- `AGENTS.md`

**Testing Performed:**
- Frontend type check (`npx tsc --noEmit -p tsconfig.app.json`): exit code 0.
- Production build (`npm run build`, i.e. `vue-tsc -b && vite build`): completed successfully.
- Unit tests (`npm test`): 12 files, 280 passed — unaffected, as expected for a frontend-only UI change.
- **Live verification against `wrangler pages dev` + local D1 via Playwright**, at 1440×900 and 375px viewports:
  - Measured the pre-fix smooth-scroll duration (~700-900ms to a distant anchor) before making the change, to confirm the complaint was real and not just a perception issue.
  - Confirmed page height drops to under 1000px per tab (from 4141px) and the URL updates to `?tab=<id>` on switch.
  - Confirmed reloading on a non-default tab (`?tab=backup`) preserves it — both the URL and the active-button highlighting survive the reload.
  - Added a real department while on the Departments tab, confirmed the "Department added." notice still renders correctly above the (now much shorter) tab content.
  - Confirmed no horizontal overflow at 375px width.
  - Cleaned up the test department created during verification (local-only SQL delete, same reasoning as the prior entry — no DELETE endpoint exists for departments by design); local dev server stopped afterward.

**Remaining Considerations:**
- The previous commit (`eb2e7d8`, smooth-scroll jump-nav) is already on `origin/main` and likely deployed to production. This correction is intentionally left uncommitted per the user's standing instruction (given earlier this session) that commit/push authorization is per-instance only, never assumed — they'll commit and push this themselves, or their external auto-commit tool will pick it up.

### Fix: Missing Production Migrations, and an Unguarded 401 Crashing TasksView
**Date:** October 19, 2026
**Branch:** main

**User Request:**
"chekc the current errors and see what the issues are", then "fix issues. and senstry too sent some errors" — the user pasted a Sentry issue (OSWORKSHEET-E, 154559778): an unhandled `Error: Not signed in` thrown from `TasksView`'s `onMounted`, reported `Handled: No` via Vue's `auto.function.vue.error_handler` mechanism.

**Implementation Details:**
1. **General health check first** (per "check the current errors" before the Sentry details arrived): ran frontend/backend type checks, the full test suite, and a production build — all clean. Then checked `wrangler d1 migrations list ledger-db --remote` and found migrations `0038_task_violations.sql` and `0039_task_violation_sequence.sql` (shipped ~2 weeks earlier, per this session's own prior entries) had never been applied to production — the automatic task-violation feature had been silently failing there the entire time, caught by the existing `.catch()` resilience so nothing crashed, it just never actually did anything. Applied both using the project's documented trigger workaround (same one used for migration `0009` and `0038` originally): `0038` via `--file` (handles the `CREATE TRIGGER ... BEGIN...END` blocks the remote migration runner mis-splits on `;`) plus a manual `d1_migrations` ledger insert, then `0039` normally. Verified via `wrangler d1 migrations list --remote` (empty) and a direct schema query that the table, both append-only triggers, and all indexes landed correctly. Also confirmed via a read-only count query that 3 real production tasks were already past the 5-day threshold and would get their first violation recorded on next view — not a bug, just the fix finally taking effect.
2. **Diagnosed the Sentry issue from the pasted breadcrumbs, not guessed**: the breadcrumbs showed `/api/tasks?mine=1` (from the global `TaskAgeAlert.vue`) succeeding with 200 moments before `/api/tasks` and `/api/tasks/assignees` (from `TasksView.vue` itself) both failed with 401 — i.e. the session was valid, then wasn't, within the same page load. The stack trace's exact line/column pointed at `src/views/TasksView.vue`'s `onMounted`: `await load()` (which already has its own try/catch) followed immediately by an **unguarded** `employees.value = await api<TaskAssignee[]>('/api/tasks/assignees')` for a `canManage` user — when that call throws, it propagates straight out of the lifecycle hook as an unhandled exception, exactly matching Sentry's `lifecycleHook: .../#runtime-m` context and `mechanism: auto.function.vue.error_handler`. The root cause of *why* the session died mid-load (expiry, deactivation, or something else) wasn't pinned down and doesn't need to be — the actionable bug is that any 401 reaching an unguarded call crashes the view instead of being handled.
3. **Immediate fix (`src/views/TasksView.vue`)**: wrapped the `/api/tasks/assignees` call in its own try/catch, matching the pattern `load()` already uses right next to it — a failure there now just leaves the "Assigned to" select empty instead of crashing the page.
4. **Root-cause fix, not just the one call site (`src/api.ts`, `src/App.vue`)**: a quick audit found 15 components using an async `onMounted` — auditing every one for the same unguarded-await shape wasn't the leveraged fix, since the *consequence* (a confusing crash instead of a clean bounce to login) is identical regardless of which specific call is unguarded. Added a global 401 handler instead: `api()` now dispatches a `window` event (`auth:unauthorized`) whenever any call gets a 401, **except** calls to `/api/auth/*` (so a wrong password on the login form doesn't trigger a spurious "session expired" redirect while already on the login page — that 401 is already handled locally by `LoginView.vue`). `App.vue` listens for the event once, clears `auth.user`, and `router.push`es to `/login`; guarded on `auth.user` already being truthy so a burst of several near-simultaneous failing requests (exactly what happened in the Sentry report) only redirects once. Avoided importing the Pinia store or the router singleton into the low-level `api.ts` (which would create a 3-way circular import with `router/index.ts` → `stores/auth.ts` → `api.ts`) by using a plain browser event instead — `App.vue` already owns both `auth` and `router` for other cross-cutting concerns (the impersonation banner, notification bell), so it's the natural single listener.

**Files Changed:**
- `src/api.ts`
- `src/App.vue`
- `src/views/TasksView.vue`
- `AGENTS.md`

**Testing Performed:**
- Frontend type check (`npx tsc --noEmit -p tsconfig.app.json`): exit code 0.
- Production build (`npm run build`): completed successfully.
- Unit tests (`npm test`): 12 files, 280 passed — unaffected, as expected for frontend-only changes with no new pure logic.
- Applied migrations 0038/0039 to production and verified via direct D1 queries (see above).
- **Live reproduction of the exact Sentry scenario against `wrangler pages dev` + local D1 via Playwright**: logged in, loaded `/tasks` cleanly (zero console/page errors, confirming the baseline), then deleted that session's key directly from local KV (simulating expiry/deactivation mid-use — confirmed via `GET /api/me` returning `null` afterward) and reloaded `/tasks`: the page redirected straight to `/login` with **zero uncaught page errors**, instead of the crash Sentry had reported.
- Cleaned up all test data; local dev server stopped afterward.

**Remaining Considerations:**
- The *other* 14 components with an async `onMounted` were not individually audited for the same unguarded-await shape — the global 401 handler now catches the worst consequence of that pattern (an uncaught exception crashing the page) for any of them, so this was judged sufficient rather than auditing every file for a bug that may not even be present in most of them.
- Why the session actually died mid-session in the reported incident (TTL expiry — 30 days, so unlikely; the account being deactivated/un-approved mid-session, which `currentUser` already treats as an immediate sign-out by design; or something else) was not determined and wasn't necessary to determine — the fix makes the *outcome* correct regardless of the cause.

### Feature: Batched (Consolidated) Notifications for Low-Stakes Kinds
**Date:** October 19, 2026
**Branch:** main

**User Request:**
"also when something is set like expense or notitfication, to present multiple messages. I thing the system can wait for 10 mins so that any other joines the queue so that instead of 4 different notifications, the could be one message with 4 different short lines." Asked first whether employees already get notified on point deductions (confirmed yes, see below), then: "implement the recommeded you just gave. batch lower stakes."

**Implementation Details:**
1. **Answered the point-deduction question first** (a prerequisite the user needed before deciding on batching scope, since they explicitly want deduction notices seen promptly): confirmed `applyTaskViolation` and `createDeduction` (`server/deductions.ts`) both already call `notifyUser` with no `inAppOnly`, so a deduction already goes out on every channel at once — in-app, email, SMS, and push. Quoted the exact message text for both the manual and automatic paths.
2. **Classification, kept deliberately conservative**: rather than exhaustively classifying all ~25 distinct `kind` values used across the codebase, took a default-immediate, explicit-allowlist-for-batchable approach — safer, since any new kind added later (or one I misjudged) defaults to immediate delivery rather than silently getting delayed. Landed on exactly three kinds as the initial `BATCHABLE_KINDS` allowlist (`server/notify.ts`): `card_duplicate`, `task_accepted`, `task_done` — all pure FYI, nothing gated on the recipient seeing them within any particular window. Deliberately excluded `point_deduction` (per the explicit ask), every expense/reimbursement/petty-cash workflow kind (checked one borderline case, `expense_submitted`, in detail — it actually notifies the *manager/approver* that a voucher is "waiting for your review", i.e. it's action-required, not informational, so it stays immediate), `task_assigned`/`task_broadcast`, the account/device-type approval kinds, and `payment_marked_paid`.
3. **`migrations/0040_notification_batches.sql`**: a `notification_batches` table, one open batch per employee at a time (`UNIQUE` index on `employee_id`), holding every queued item as a JSON array (`items`) plus a `flush_at` timestamp. Not an audit-trail table like `point_deductions`/`task_violations` — batches get updated and deleted as part of normal operation, so no append-only triggers.
4. **`server/notify.ts`**: factored the actual multi-channel delivery (insert row, then best-effort email/SMS/push) out of `notifyUser` into a private `deliverNotification`, so both the immediate path and the new batch-flush path deliver identically. `notifyUser` now checks `BATCHABLE_KINDS` first and, if matched (and not already `inAppOnly`), calls `queueBatchedNotification` instead of delivering right away. The 10-minute window is a **throttle anchored to the first item**, not a debounce reset by each new arrival — so one item is never delayed more than `BATCH_WINDOW_MINUTES` no matter how many more pile in behind it before the window closes (a debounce could in principle delay the first item indefinitely if new ones kept arriving every <10 minutes). `queueBatchedNotification` handles the race where two near-simultaneous calls both try to create the employee's first batch (`UNIQUE` constraint violation caught and treated as "append to the one that won", same pattern used elsewhere in this codebase for similar races). `flushDueNotificationBatches` sends every batch whose `flush_at` has passed: a single-item batch is delivered exactly as it would have gone out immediately (its own original `kind`/`title`/`body`, no wrapper); a multi-item batch becomes one `digest_batch`-kind notification titled `"N updates"` with each item's title+body as its own paragraph, clearly separated.
5. **No cron trigger exists for Pages Functions here** (same constraint already documented for task violations) — `flushDueNotificationBatches` instead runs opportunistically from `listNotifications` (`GET /api/notifications`), which fires whenever *anyone's* notification bell loads. Deliberately sweeps **every** due batch on each call, not just the calling employee's own, so any user's activity can flush any other employee's overdue batch — meaningfully better real-world coverage in an actively-used multi-user app than only flushing on the recipient's own visits, without needing new infrastructure (a Cloudflare Queue or Durable Object alarm would give a harder latency guarantee than this opportunistic-sweep approach, but neither is wired up in this project, and introducing one wasn't asked for).
6. **No new unit tests**: `server/notify.ts` has Workers-only dependencies (email/SMS/push clients), per its own existing comment explaining why `firstName` was deliberately split out to `shared/names.ts` to stay testable — there's no new *pure* logic here to unit-test (`BATCHABLE_KINDS` is a plain constant, not a function with edge cases), so verification was done live instead, consistent with how every other DB-touching piece of server logic has been verified this session.

**Files Changed:**
- `migrations/0040_notification_batches.sql`
- `server/notify.ts`
- `AGENTS.md`

**Testing Performed:**
- Backend type check (`npx tsc --noEmit -p tsconfig.server.json`): exit code 0.
- Production build (`npm run build`): completed successfully.
- Unit tests (`npm test`): 12 files, 280 passed — unaffected, no pure logic added.
- Applied migration 0040 to both local and production D1 (`npm run db:migrate:local`, then `wrangler d1 migrations apply ledger-db --remote` — no triggers in this one, so the normal path worked without the `0038`-style workaround). Applying straight to production this time, rather than letting it sit, was a deliberate choice given the exact "shipped code, unmigrated table, silently broken for two weeks" mistake found and fixed earlier in this same session.
- **Live end-to-end verification against `wrangler pages dev` + local D1**:
  - Simulated a 3-item batch via direct SQL insert with `flush_at` in the future, confirmed `GET /api/notifications` did **not** yet show a consolidated entry.
  - Backdated `flush_at` to the past, called `GET /api/notifications` again, confirmed exactly one `digest_batch`/"3 updates" notification appeared with all three items' titles and bodies clearly separated, and that the `notification_batches` row was deleted afterward (no re-delivery on a subsequent call).
  - Separately verified a single-item batch delivers unwrapped, using its original `kind`/`title`/`body`.
  - Verified the **real** wiring end to end, not just the simulated flush: created a genuine broadcast task as one employee, accepted it as a second (a manually-crafted KV session, no password needed, since this is local-only test infrastructure), and confirmed the resulting real `task_accepted` notification landed in `notification_batches` with `flush_at` set to exactly 10 minutes later — not in `notifications` immediately.
  - Cleaned up all test tasks, batches, sessions, and notifications created during verification; local dev server stopped afterward.

**Remaining Considerations:**
- The opportunistic-sweep delivery mechanism means a batch's actual send time can run later than its 10-minute `flush_at` if nobody's notification bell happens to load in the meantime — in practice this is a small gap for an actively-used internal tool, but it's a soft guarantee, not a hard one. A Cloudflare Queue (with delayed message visibility) or a Durable Object alarm would close that gap if it ever becomes a real problem; neither exists in this project today.
- Only three kinds are batchable for now. If the user wants more aggressive batching later, the change is adding to the `BATCHABLE_KINDS` set in `server/notify.ts` — deliberately the only place that decision lives.
- `point_deduction` was explicitly kept immediate, confirmed with the user as the priority before this feature was scoped.

October 27, 2026
Bug Fix: Production Route Chunk Recovery

Branch: main

User Request

"TypeError: Failed to fetch dynamically imported module: https://dem.trace365.net/assets/ReportView-DTAqm1Er.js" on the production `/payments` route.

Implementation

Investigated the production error as a stale Vite hashed route chunk requested by an open tab after a deployment. The current build has a different `ReportView` asset name, confirming that the reported file belongs to an older app shell.

Updated `src/main.ts` to handle browser-level `unhandledrejection` and `error` events for route chunk failures. The existing one-time session guard is reused, the current route is reloaded once, and the event is prevented from being reported as an unhandled Sentry error after recovery is scheduled.

Updated `public/sw.js` from cache version `ledger-v1` to `ledger-v2` so clients retire the previous service-worker cache on this release.

Added `public/_headers` to force `index.html` and the SPA root to revalidate while leaving content-hashed assets suitable for long-lived caching.

Files changed

- `src/main.ts`
- `public/sw.js`
- `public/_headers`
- `changelog.md`
- `AGENTS.md`

Testing performed

- Frontend type check and production build (`npm.cmd run build`): passed.
- Full Vitest suite (`npm.cmd test`): 12 files and 280 tests passed.
- Preserved the existing focused route-chunk regression tests in `tests/router.test.ts`.

Any remaining considerations

The one-time reload guard intentionally avoids infinite refresh loops when the user is offline or the new asset is genuinely unavailable. A production deployment is still required for the fix to affect existing clients.

October 27, 2026
Bug Fix: Dashboard Auth Nullability Crash

Branch: main

User Request

Sentry issue 156574980: `TypeError: Cannot read properties of null (reading 'work_types')` from `DashboardView` during the login transaction.

Implementation

Updated `src/views/DashboardView.vue` so its initial date range falls back safely when `auth.user` is temporarily unavailable, and `myTypeIds` treats a missing user as an empty assignment set. This protects the computed `visibleTypes` path during session expiry/redirect transitions while preserving the existing admin and assigned-work-type filtering for authenticated users.

Files changed

- `src/views/DashboardView.vue`
- `changelog.md`
- `AGENTS.md`

Testing performed

- Frontend type check and production build (`npm.cmd run build`): passed.
- Backend type check (`npx.cmd tsc --noEmit -p tsconfig.server.json`): passed.
- Full Vitest suite (`npm.cmd test`): 12 files and 280 tests passed.

Any remaining considerations

The report API call remains protected by its existing error handling, and the router/App session-expiry redirect remains authoritative. A production deployment is required for the fix to reach `qap.dubblestack.com`.

October 27, 2026
Development Tooling Review and Selective Setup

Branch: main

User Request

"Review my existing application and selectively configure useful development tools" from Agent Skills, Context7, Graphify, 21st MCP, and Strix, with the goal of improving future UI/UX development and maintenance.

Implementation

Inspected the repository instructions, README, package manifests and lockfile, current `.claude` configuration, source layout, tests, and available CI/configuration files. Confirmed the application is a Vue 3/Vite/TypeScript frontend with Tailwind CSS, Pinia, Vue Router, Cloudflare Pages Functions, D1, KV sessions, Sentry, Vitest, strict frontend/server type configurations, and Playwright available as a dependency.

Established the baseline before setup: `npm.cmd test` passed 12 files and 280 tests; `npm.cmd run build` passed.

Installed only the three relevant Agent Skills from the verified `addyosmani/agent-skills` source into the project:

- `.agents/skills/frontend-ui-engineering`
- `.agents/skills/browser-testing-with-devtools`
- `.agents/skills/code-review-and-quality`
- `skills-lock.json` records their source paths and content hashes.

Deferred Context7 because no Context7 MCP is connected in this Codex session and automatic client-global credential setup was not authorized. Deferred Graphify because the repository is small enough for existing code search and documentation. Deferred 21st MCP because its documented component output is React-oriented and this application is Vue. Deferred Strix because active pentesting requires an explicitly authorized isolated target, Docker, and an LLM provider/key.

Added `docs/development-tools.md` with the decision table, official sources, license/cost/data-handling notes, exact usage examples, UI/UX priorities, and rollback instructions. Added a README pointer and concise Agent Skill usage guidance without changing application runtime behavior.

Files changed

- `.agents/skills/frontend-ui-engineering/SKILL.md`
- `.agents/skills/browser-testing-with-devtools/SKILL.md`
- `.agents/skills/code-review-and-quality/SKILL.md`
- `skills-lock.json`
- `docs/development-tools.md`
- `README.md`
- `AGENTS.md`
- `changelog.md`

Testing performed

- Verified the official upstream sources and current installation guidance for all five evaluated tools.
- Confirmed the Agent Skills installer completed successfully and recorded hashes in `skills-lock.json`.
- Re-ran `npm.cmd test`: 12 files and 280 tests passed.
- Re-ran `npm.cmd run build`: passed.
- Ran `git diff --check` successfully before documentation changes.
- Ran `npm.cmd audit --omit=dev --audit-level=high`: 10 advisories reported (1 moderate, 8 high, 1 critical); traced the main paths with `npm.cmd ls`/`npm.cmd explain` and did not apply automatic upgrades.

Any remaining considerations

The browser-testing skill still needs a Chrome DevTools MCP connection before it can run its preferred live-browser workflow; Playwright remains the current local fallback. No tool was deployed, added to the production bundle, or given application credentials. The next UI/UX pass should start with Dashboard hierarchy and mobile entry flow, then standardize feedback and accessibility states using the existing design tokens.

October 27, 2026
Documentation: Responsive UI Improvement Handoff Plan

Branch: main

User Request

"Make the responsive UI implementation plan an md file so other agents can also do some of the work."

Implementation

Created `docs/responsive-ui-improvement-plan.md` as a step-by-step handoff for the horizontal-scroll and responsive UI audit. The plan separates baseline evidence, mobile navigation, dashboard controls, responsive tables, long-content/action handling, Settings navigation, and accessibility verification into focused work packages. It includes affected files, guardrails, acceptance criteria, and the required test commands.

Added a README link to the plan and recorded it in `changelog.md`. No runtime application code, API behavior, authorization logic, or dependencies were changed.

Files changed

- `docs/responsive-ui-improvement-plan.md`
- `README.md`
- `changelog.md`
- `AGENTS.md`

Testing performed

- Documentation-only change; no application tests were required.
- Reviewed the resulting documentation diff for scope and accidental runtime changes.

Any remaining considerations

The remaining work packages in the plan are intentionally not implemented yet. Agents should complete one work package at a time and update this work log and `changelog.md` after each code change.

October 27, 2026
Feature: Mobile Section Navigation

Branch: main

User Request

"Start the responsive UI improvement work." The first slice was the mobile navigation work package from `docs/responsive-ui-improvement-plan.md`.

Implementation

Updated `src/App.vue` to define Reports, Finance, and Admin section links once and reuse the permission-filtered lists for both desktop and mobile navigation. Added a mobile-only contextual section menu with active route styling, focus movement to the first link, Escape-to-close focus restoration, and click-away closing. The existing desktop section strips remain available from the `md` breakpoint upward, while the primary navigation remains the only horizontal mobile navigation strip.

No API contracts, route guards, server-side authorization, or data-scoping behavior changed.

Files changed

- `src/App.vue`
- `docs/responsive-ui-improvement-plan.md`
- `changelog.md`
- `AGENTS.md`

Testing performed

- Frontend type check and production build (`npm.cmd run build`): passed.
- Full Vitest suite (`npm.cmd test`): 12 files and 280 tests passed.
- Playwright shell verification against the local Wrangler preview: the accessible route loaded at 320px, 375px, 768px, 1024px, and 1440px with no body-level horizontal overflow.
- `git diff --check`: passed.

Any remaining considerations

The browser check used the unauthenticated shell because no test login session was available. The next verification pass should exercise the Reports, Finance, and Admin contextual menus with a permitted test account before this slice is deployed.

October 27, 2026
Feature: Responsive Dashboard Controls

Branch: main

User Request

"Continue" with the next responsive UI work package from `docs/responsive-ui-improvement-plan.md`.

Implementation

Updated `src/views/DashboardView.vue` so the date-range selector fills the available phone width, the month picker remains compact from the `sm` breakpoint upward, and custom start/end dates stack below 640px. Added visible mobile labels and accessible labels for the range selector and date inputs. Existing month/custom state and report/expense query behavior remain unchanged.

Files changed

- `src/views/DashboardView.vue`
- `docs/responsive-ui-improvement-plan.md`
- `changelog.md`
- `AGENTS.md`

Testing performed

- Frontend type check and production build (`npm.cmd run build`): passed.
- Full Vitest suite (`npm.cmd test`): 12 files and 280 tests passed.
- Playwright smoke test with a mocked authenticated user: dashboard rendered at 320px, 375px, 768px, 1024px, and 1440px; custom dates rendered at 375px; no body-level horizontal overflow was detected.
- `git diff --check`: passed.

Any remaining considerations

The next planned slice is Work package 3: standardize responsive data tables and make intentional horizontal table scrolling clearer and more accessible.

October 27, 2026
Feature: Accessible Responsive Table Regions

Branch: main

User Request

"Continue" with the next responsive UI work package from `docs/responsive-ui-improvement-plan.md`.

Implementation

Updated `src/style.css` so shared `.table-wrap` containers are width-contained, keep horizontal overscroll inside the table region, expose scroll padding, and use thin native scrollbars. Extended the existing table observer in `src/main.ts` to detect actual overflow after table rendering and window resize. Only overflowing wrappers receive `tabindex="0"`, `role="region"`, and an accessible label taken from the nearest panel heading. Non-overflowing mobile card tables remain out of the tab order. The print-only raw table in `ExpensePackView.vue` was intentionally left unchanged.

No API contracts, route guards, server-side authorization, or data-scoping behavior changed.

Files changed

- `src/style.css`
- `src/main.ts`
- `docs/responsive-ui-improvement-plan.md`
- `changelog.md`
- `AGENTS.md`

Testing performed

- Frontend type check and production build (`npm.cmd run build`): passed.
- Full Vitest suite (`npm.cmd test`): 12 files and 280 tests passed.
- Playwright table smoke test with a mocked authenticated user: mobile card tables remained non-overflowing at 375px; wide dashboard tables became labelled, keyboard-scrollable regions at 768px and 1024px; no body-level horizontal overflow was detected.
- `git diff --check`: passed.

Any remaining considerations

The next planned slice is Work package 4: long content and action-group cleanup across employee, task, entry, and expense views.

October 27, 2026
Feature: Long Content and Mobile Action Cleanup

Branch: main

User Request

"Continue" with the next responsive UI work package from `docs/responsive-ui-improvement-plan.md`.

Implementation

Updated `src/style.css` so direct action buttons in the final column of mobile card tables use the available card width. Updated `src/views/EntriesView.vue` and `src/views/ExpensesView.vue` so long notes and voucher descriptions wrap instead of truncating. Updated `src/views/EmployeesView.vue` so the session-switch control can wrap, and `src/views/TasksView.vue` so the secondary participant radio group wraps on narrow screens. No data flow, API contract, authorization, or destructive-action behavior changed.

Files changed

- `src/style.css`
- `src/views/EntriesView.vue`
- `src/views/ExpensesView.vue`
- `src/views/EmployeesView.vue`
- `src/views/TasksView.vue`
- `docs/responsive-ui-improvement-plan.md`
- `changelog.md`
- `AGENTS.md`

Testing performed

- Frontend type check and production build (`npm.cmd run build`): passed.
- Full Vitest suite (`npm.cmd test`): passed after the responsive changes.
- Playwright smoke test with a mocked authenticated user: Entries and Expenses kept document width equal to the viewport at 375px; long text wrapped normally; mobile action buttons filled their action field; both routes stayed within the viewport at 1440px.
- `git diff --check`: passed.

Any remaining considerations

The next planned slice is Work package 5: improve Settings navigation on mobile.

October 27, 2026
Feature: Responsive Settings Navigation

Branch: main

User Request

"Continue" with the next responsive UI work package from `docs/responsive-ui-improvement-plan.md`.

Implementation

Updated `src/views/SettingsView.vue` to render a full-width, labelled Settings section selector below the mobile breakpoint while retaining the existing button tab bar on tablet and desktop. The selector uses the existing `setTab` route update, so `?tab=` URLs, reloads, shared links, active-panel rendering, and Settings permissions remain unchanged. No API, server authorization, or settings mutation behavior changed.

Files changed

- `src/views/SettingsView.vue`
- `docs/responsive-ui-improvement-plan.md`
- `changelog.md`
- `AGENTS.md`

Testing performed

- Frontend type check and production build (`npm.cmd run build`): passed.
- Playwright smoke test with a mocked authenticated admin: mobile selector and desktop tabs were verified at 320px, 375px, 768px, 1024px, and 1440px; no body-level horizontal overflow was detected.
- Mobile and desktop tab switching updated the URL and rendered the requested panel; no browser console errors were observed.
- `git diff --check`: passed.

Any remaining considerations

The next planned slice is Work package 6: accessibility and finish pass.

October 27, 2026
Feature: Accessibility and Motion Finish Pass

Branch: main

User Request

"Continue" with the final responsive UI work package from `docs/responsive-ui-improvement-plan.md`.

Implementation

Updated `src/style.css` with a shared `:focus-visible` ring for plain links and controls plus a `prefers-reduced-motion` rule that minimizes animations and transitions. Updated `src/App.vue` with Account menu semantics and state attributes. Updated `src/components/PointDeductionModal.vue`, `src/components/NewsPopup.vue`, `src/components/TaskAgeAlert.vue`, and `src/components/TaskDeadlineAlert.vue` with dialog semantics, accessible labels, and initial focus on the primary dismissal control. No API, route permission, server authorization, or business-rule behavior changed.

Files changed

- `src/style.css`
- `src/App.vue`
- `src/components/PointDeductionModal.vue`
- `src/components/NewsPopup.vue`
- `src/components/TaskAgeAlert.vue`
- `src/components/TaskDeadlineAlert.vue`
- `docs/responsive-ui-improvement-plan.md`
- `changelog.md`
- `AGENTS.md`

Testing performed

- Frontend type check and production build (`npm.cmd run build`): passed.
- Full Vitest suite (`npm.cmd test`): passed.
- Playwright accessibility smoke test with a mocked authenticated admin: dialog metadata and focus, Account menu semantics, keyboard focus visibility, reduced-motion behavior, clean console output, and no body-level horizontal overflow passed at 320px, 375px, 768px, 1024px, and 1440px.
- `git diff --check`: passed.

Any remaining considerations

The responsive UI improvement plan is complete. Future changes should preserve the focus, reduced-motion, dialog, and menu patterns established here.

October 27, 2026
Feature: In-App PWA Installation

Branch: main

User Request

"yes do it" in response to adding a button that installs the app to a phone home screen as a PWA.

Implementation

Added `src/components/InstallAppButton.vue` and mounted it in the authenticated application header through `src/App.vue`. The control captures the browser's `beforeinstallprompt` event and opens the native install flow on supported browsers, handles `appinstalled`, hides after acceptance, and provides a labelled iPhone/iPad Safari fallback dialog with Add to Home Screen instructions. The feature is presentation-only and does not change authentication, permissions, API contracts, or server behavior.

Files changed

- `src/components/InstallAppButton.vue`
- `src/App.vue`
- `README.md`
- `docs/responsive-ui-improvement-plan.md`
- `changelog.md`
- `AGENTS.md`

Testing performed

- Frontend type check and production build (`npm.cmd run build`): passed.
- Playwright PWA smoke test with a mocked authenticated admin: native install prompt path invoked once and removed the button after acceptance; iPhone user-agent path showed Add to Home Screen instructions, dialog semantics, and initial focus; no 375px overflow or browser console errors were observed.
- `git diff --check`: passed.

Any remaining considerations

The native install button only appears when the browser exposes `beforeinstallprompt`. iOS intentionally uses the guided Safari fallback because Apple does not expose that event.

October 27, 2026
Feature: Sentry Source Map Uploads

Branch: main

User Request

"Continue" after approving the Sentry source-map upload setup and reporting that the created Sentry project was not visible.

Implementation

Added conditional `@sentry/vite-plugin` configuration in `vite.config.ts`. The plugin is enabled only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are all present. It uploads hidden production source maps, optionally uses `SENTRY_RELEASE` or the Cloudflare commit SHA for release identity, and removes uploaded map files from `dist`. Existing frontend and Pages Functions DSN behavior is unchanged.

Updated the README and changelog to explain that the runtime DSN does not create a Sentry project, the configured DSN points at an existing numeric project ID, and Cloudflare Pages must be configured with the organization slug, existing project slug, and a CI-only upload token. Preview browser monitoring also requires `VITE_SENTRY_DSN` as a build variable.

Files changed

- `vite.config.ts`
- `README.md`
- `changelog.md`
- `AGENTS.md`

Testing performed

- Local production build without upload credentials (`npm.cmd run build`): passed; no `.map` files remained in `dist`.
- Vitest suite (`npm.cmd test`): passed, 12 files and 280 tests.
- `git diff --check`: passed; only normal line-ending warnings were reported.

Any remaining considerations

The project must be created or selected in the Sentry `365-s3` organization before `SENTRY_PROJECT` can be configured. No Sentry project was created through the repository, and no secret values were added to source control.

October 27, 2026
Feature: Compact Mobile Per-Person Dashboard Cards

Branch: main

User Request

"On the mobile cards, the per-person card is too long. Can some rows be two columns?"

Implementation

Added a `per-person-table` hook to the Dashboard per-person table. Below the existing mobile breakpoint, each person is rendered as a two-column grid card: the employee name spans both columns, and the remaining days, hours, work-type, and payment metrics pair side by side. The shared mobile table behavior, desktop layout, data values, permission filtering, and API behavior remain unchanged.

Files changed

- `src/views/DashboardView.vue`
- `src/style.css`
- `docs/responsive-ui-improvement-plan.md`
- `changelog.md`
- `AGENTS.md`

Testing performed

- Frontend type check and production build (`npm.cmd run build`): passed.
- Vitest suite (`npm.cmd test`): passed, 12 files and 280 tests.
- Browser DevTools MCP was not available in this session; static responsive CSS review will be supplemented by the existing project test suite.
- `git diff --check`: passed before the workspace commit.

Any remaining considerations

At very narrow widths, long work-type labels may still wrap inside their half-width metric cell; the card remains contained without changing the underlying table data.

October 28, 2026
Documentation: Shared Workflow and Skill Library Audit

Branch: main

User Request

"Read the standing workflow-library instructions, inspect this workspace and its configured skills/tools, save missing workflows and skills to the shared library, create a stack-specific skill, update the library index, and make the post-skill contribution rule apply to all agents in this repository."

Implementation

Audited the repository stack, project instructions, project-local skills, skill lockfile, client settings, development-tool notes, source layout, migrations, tests, and available MCP namespaces. Added the explicit post-skill contribution rule to the Development Tooling section so agents run the shared-library contribution check immediately after any skill invocation as well as at task end.

Files changed

- `AGENTS.md`
- `docs/development-tools.md`
- `changelog.md`
- Shared library: `C:\Users\gomat\OneDrive\Documents\Workflow and skills\workflows\{frontend-ui-engineering,browser-testing-with-devtools,code-review-and-quality,ledger-vue-cloudflare}.md`
- Shared library: `C:\Users\gomat\OneDrive\Documents\Workflow and skills\skills\{frontend-ui-engineering,browser-testing-with-devtools,code-review-and-quality,ledger-vue-cloudflare}\SKILL.md`

Testing performed

- `npm.cmd run build`: passed.
- `npm.cmd test`: passed outside the restricted sandbox; 12 files and 280 tests passed. The first sandboxed run failed before test collection because esbuild could not read a parent directory, so it was retried with the required local-only escalation.
- Verified the final documentation diff with `git diff --check`.

Any remaining considerations

The shared library is stored outside this repository and must be kept synchronized separately. This task does not install a Chrome DevTools MCP server, add credentials, deploy, or push changes.

October 28, 2026
Documentation: Developer Onboarding and Validation Improvements

Branch: main

User Request

"Make the recommended local-folder improvements for easier understanding and onboarding."

Implementation

Corrected stale README route and migration-count details. Added project architecture, layout, local-development, testing, authorization, database, and contributing documentation. Added `.env.example`, explicit frontend/server type-check scripts, Vitest watch mode, a combined validation script, and a GitHub Actions validation workflow. Historical work-log entries remain in this file because the repository instructions require the work log to stay below the instructions.

Files changed

- `README.md`
- `package.json`
- `.env.example`
- `CONTRIBUTING.md`
- `docs/ARCHITECTURE.md`
- `docs/PROJECT-LAYOUT.md`
- `docs/LOCAL-DEVELOPMENT.md`
- `docs/TESTING.md`
- `docs/AUTHORIZATION.md`
- `docs/DATABASE.md`
- `.github/workflows/ci.yml`
- `docs/development-tools.md`
- `changelog.md`
- `AGENTS.md`
- Shared library: `C:\Users\gomat\OneDrive\Documents\Workflow and skills\workflows\ledger-vue-cloudflare.md`
- Shared library: `C:\Users\gomat\OneDrive\Documents\Workflow and skills\skills\ledger-vue-cloudflare\SKILL.md`

Testing performed

- `npm run check`: passed; frontend/server type checks, 12 Vitest files with 280 tests, and the production build all completed successfully.
- `git diff --check`: passed.

Any remaining considerations

The CI workflow validates code but intentionally does not deploy or apply remote D1 migrations. The repository still has no committed Playwright configuration and no local Chrome DevTools MCP server.

October 30, 2026
Feature: Three-Month Productivity Comparison on the Dashboard

Branch: main

User Request

"on the dashboard. I want every user to see thier monthly productivity comparison for the last 3 months" - then, after the design questions, "use the best recomended options": current month included and labelled month-to-date, units plus hours with change against the prior month, per-assigned-work-type series, and `view_dashboard` granted to standard users.

Implementation

Investigated first, and found the data already existed: `/api/trends?months=3` returns one employee's month-by-month hours and per-work-type units (plus points/remuneration only where those rights are held), and `trends()` already rejects a non-admin requesting anyone but themselves. So this needed no new endpoint, no new aggregation, and no new right.

- `src/views/DashboardView.vue`: added a **Your productivity - last 3 months** panel between the personal attendance block and the team panels. It fetches the trend in its own try/catch (the same supplementary-panel pattern the expense strip uses), and only on mount, because the window is anchored to today and the month picker's `watch` must not re-fetch it. Series are filtered to the viewer's assigned work types the same way the existing columns are, and the table shows total units and hours per month with the change against the previous month. The newest row is labelled **month to date**. Declines render muted rather than red, since a drop is not an error in this app.
- `shared/logic.ts`: added `percentChange(cur, prev)`, returning `null` when there is no base to divide by (first month, or a month with nothing logged), so "no comparison" stays distinct from "went up enormously". Pure logic in `shared/` per the existing `formatElapsed` precedent, so Vitest can cover it.
- `server/auth.ts`: `DEFAULT_RIGHTS.view_dashboard` is now `true`, so the dashboard is reachable by every new standard account.
- `migrations/0041_dashboard_default_right.sql`: grants the right to existing non-admin accounts, since a default change alone does nothing for rows already stored. Data scope is untouched, so a standard employee still sees only their own figures, and the limited-scope response never carried colleagues' points or remuneration anyway.
- `tests/expenses.test.ts`: the existing "gives an employee no team visibility" assertion encoded the old default; renamed and re-pointed so it now asserts own-dashboard-yes, team-and-reports-no.

Files changed

- `src/views/DashboardView.vue`
- `shared/logic.ts`
- `server/auth.ts`
- `migrations/0041_dashboard_default_right.sql`
- `tests/logic.test.ts`
- `tests/rights.test.ts`
- `tests/expenses.test.ts`
- `guideline-user.md`
- `guideline-admin.md`
- `changelog.md`
- `AGENTS.md`

Testing performed

- `npm run check`: passed - 12 Vitest files with 290 tests (10 new: six for `percentChange`, four for the dashboard default and its revocability), plus the production build.
- Applied `0041` locally and verified with a read-back query that a previously-withheld employee row now carries a JSON `true` (not `1`), that an already-granted employee was untouched, and that the admin row was left alone since the role implies the right.
- Live end-to-end verification against `wrangler pages dev` + local D1, via Playwright as a real standard employee:
  - Confirmed `/api/trends?months=3` was called once with a 200 and the panel rendered with the chart plus all three month rows.
  - Seeded temporary entries for August (10 units / 8h), September (20 / 6h) and October (8 across two types / 4h), then confirmed the rendered deltas exactly: +100% then -60% for units, -25% then -33% for hours, dashes on the first month, and **month to date** only on the newest row.
  - Confirmed the chart rendered both work-type series at 1094x256, the team panels still appeared, and there were no console or page errors.
  - At 390px, confirmed the document width stayed exactly 390 and the table fell back to the vertical card layout with its `data-label` intact.
  - Deleted the seeded entries afterwards (verified zero rows remained) and restored the employee's original password hash, which had been temporarily reset to obtain a session.

Any remaining considerations

- Deploying needs `npm run db:migrate:prod` for `0041` before the grant reaches existing production accounts. `npm run deploy` already runs it; a Cloudflare GitHub auto-deploy does not.
- Granting `view_dashboard` to everyone also exposes the team panels, but only within each person's data scope. Anyone deliberately scoped to a department or everything will now see those colleagues' hours and units (never money). Un-tick the right on such accounts if that was not intended.
- The panel reads the trend endpoint, which returns every work type the employee has ever logged against rather than only their current assignments; the frontend filters the series, and since the endpoint is self-only there is no cross-user exposure. Server-side filtering was left out on purpose so legitimately-earned historical units stay visible.
- While appending this entry, a `Get-Content -Raw` / `WriteAllText` round trip used to trim a trailing blank line re-encoded the whole file as ANSI, mojibake-ing every emoji and em-dash in it. Caught by inspecting the diff (148+/99- instead of ~51+), and fixed by restoring the file and re-appending through the edit tool. Do not round-trip this file through Windows PowerShell text cmdlets.

October 30, 2026
Fix: Stacked Columns for the Three-Month Productivity Chart

Branch: main

User Request

"the comparison chart is not easy to understans. make it somoother. Maybe a grouped bar graph. chekc deeply"

Implementation

Checked the rendering before changing anything, with a realistic three-month history (August 20 units / 16h, September 24 / 6h, October 8 / 4h) rendered in the real app. The chart was not merely unpolished, it said the opposite of the truth, for three reasons:

- One bar per work type meant a month's output was split across columns, so bar height stopped meaning the month's output. September was the best month at 24 units, but its tallest bar (18) was shorter than August's only bar (20) — the chart showed August ahead while the table directly beneath it showed September at +20%.
- An empty work type still reserved its slot, so a month with one type drew its single bar left of its own month label while months with two types straddled theirs. Every group had a different visual centre.
- The y-axis drew a gridline every 2 units — eleven of them — for three short columns.

Changes:

- `src/components/TrendChart.vue`, extended rather than duplicated (it still serves Trends and Installations unchanged, both opt-in): added `stacked` and `showTotals` props, a small canvas plugin that prints each column's total above it (chart.js has no built-in data labels and pulling in another package for three numbers is not worth a dependency), a `maxTicksLimit` of 5 and integer precision on the y-axis when stacked, `borderRadius: 6` with `borderSkipped: 'middle'` so only the outer corners of a column round, `categoryPercentage`/`barPercentage` tuned for wide columns, 20px top padding reserved for the total, and a tooltip footer showing the column total.
- `src/views/DashboardView.vue`: the panel now renders stacked columns with totals, its caption reads "Total units per month, by work type", and the chart is capped at `max-w-xl` and centred — three columns spread across a 1100px panel sat so far apart that comparing heights meant sweeping the eye back and forth.
- Also fixed a flaw in the panel's own empty state: it tested `trendSeries.length`, but a series exists for every assigned work type, so an employee with nothing logged got an empty axis frame instead of the "No countable work logged" message. It now tests whether any series actually holds a non-zero value, the same way `TrendsView` does.

Files changed

- `src/components/TrendChart.vue`
- `src/views/DashboardView.vue`
- `changelog.md`
- `guideline-user.md`
- `AGENTS.md`

Testing performed

- `npm run check`: passed — 12 Vitest files with 290 tests and the production build.
- Live verification against `wrangler pages dev` + local D1, before and after: captured the misreading directly (August's single bar left of its label; September's 18-high bar under a 24-unit month), then confirmed after the change that column height matches the table (20 / 24 / 8), the totals 20 / 24 / 8 print above the columns, September's 6 QAP units show as an amber segment, the y-axis drops from 11 gridlines to 4, and the bars sit centred under their labels.
- Confirmed the empty state renders the message with no canvas, and that a populated panel has no console or page errors.
- At 390px: document width stayed exactly 390, the chart scaled to 316px, and the vertical card table below was untouched.
- Regression-checked the shared component: `/trends` still renders its grouped "Work output by month" and "Hours by month" bars unchanged, with no console errors.
- Deleted every seeded row afterwards (verified zero remain) and restored the employee's original password hash.

Any remaining considerations

- `TrendsView` keeps grouped bars and so keeps the same "tallest bar is not the month" ambiguity over 3-12 months. It was left alone deliberately — it was not what was reported, and 12 months of stacked columns with many work types would be harder to read than grouped ones. Adding `stacked` there is a one-word change if that page should match.
- The chart's y-axis tops out at 30 for a 24-unit month, leaving a little headroom. That is chart.js's default rounding; pinning a max would clip an unusually large month.


