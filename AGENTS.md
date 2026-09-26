# Agent Instructions & Work Log

Agent Instructions
1. General Rules

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
