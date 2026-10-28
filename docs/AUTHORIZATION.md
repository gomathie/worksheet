# Authorization and Data Scoping

## Server is authoritative

Every protected endpoint must resolve the authenticated viewer from the session and enforce authorization before returning or aggregating data. Vue route guards, hidden controls, disabled buttons, and computed filters are not security boundaries.

## Roles and rights

Employees have one of three roles: `admin`, `manager`, or `employee`. Rights are stored per employee and control actions such as dashboard/report access, entries, expenses, approvals, tasks, announcements, users, points, and impersonation. Approval rights remain explicit even for administrators where the existing model requires it.

## Employee data scopes

`data_scope` determines which employee records a viewer may see:

- `own`: own records only
- `direct_reports`: own records plus direct reports
- `department`: records in the same department
- `all`: all visible employee records

Use the existing helpers in `server/scope.ts` rather than recreating visibility logic in a route.

## Work-type scopes

Standard users may only receive assigned work types. Apply this to raw work-type rows and every derived value: units, totals, per-person metrics, daily totals, dashboard/report cards, columns, and exports. Module expansion rules such as Data Analytics belong in the server assignment query.

Admins retain the complete dataset where the existing authorization model permits it.

## Review checklist

- Is the viewer resolved from trusted server-side session data?
- Is the right/role checked before mutation or protected reads?
- Are employee and work-type filters applied before aggregation?
- Can an unauthorized category be reconstructed from totals or nested data?
- Does the frontend present the same authorized subset without becoming the only protection?
