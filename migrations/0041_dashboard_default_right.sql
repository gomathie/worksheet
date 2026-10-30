-- The dashboard is the first page after login, but view_dashboard was
-- defaulted off, so a standard employee was always bounced to time entry and
-- never saw their own attendance, pay/points figures, or productivity trend.
--
-- Grant it to every existing non-admin account. This does not widen anyone's
-- data scope: employees.data_scope still decides whose records they can see
-- inside the dashboard (it defaults to 'own', so a standard employee sees only
-- their own figures), and the limited-scope response never carries colleagues'
-- points or remuneration.
--
-- Administrators hold the right implicitly by role. This flips a stored false
-- too, which is the point: those are the accounts that currently cannot open
-- the dashboard at all. Reverse it per person in Employees, or wholesale with
-- the same statement writing json('false').
UPDATE employees
SET rights = json_set(rights, '$.view_dashboard', json('true'))
WHERE role != 'admin'
  AND (
    rights IS NULL
    OR json_extract(rights, '$.view_dashboard') IS NULL
    OR json_extract(rights, '$.view_dashboard') = 0
  );
