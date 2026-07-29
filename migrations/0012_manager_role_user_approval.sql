-- Migration number: 0012  Manager role, assignable data scope, user approval
--
-- Three related changes:
--
-- 1. A third role, 'manager'. Unlike 'admin' it implies nothing on its own —
--    it seeds a sensible set of rights when the account is created and the
--    administrator tunes them from there. The role column has no CHECK
--    constraint, so no schema change is needed for the value itself.
--
-- 2. employees.data_scope decides whose records a person can see:
--      'own'            — only their own (the default, unchanged behaviour)
--      'direct_reports' — plus anyone whose manager_id is them
--      'department'     — plus everyone sharing their department_id
--      'all'            — everyone
--    Admins and finance-rights holders see everything regardless.
--
-- 3. Accounts created by a non-administrator start 'pending' and cannot sign
--    in until somebody holding `approve_users` approves them. The two new
--    rights (`add_users`, `approve_users`) live in the rights JSON.

ALTER TABLE employees ADD COLUMN data_scope TEXT NOT NULL DEFAULT 'own';

-- Approval state of the account itself, distinct from `active` (which is the
-- deactivate/reactivate switch). Existing rows are already approved.
ALTER TABLE employees ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE employees ADD COLUMN created_by TEXT REFERENCES employees(id);
ALTER TABLE employees ADD COLUMN approved_by TEXT REFERENCES employees(id);
ALTER TABLE employees ADD COLUMN approved_at TEXT;
ALTER TABLE employees ADD COLUMN approval_note TEXT;

CREATE INDEX idx_employees_approval ON employees(approval_status);

-- Managers get the scope that matches how expense review already works, so
-- the two rules agree out of the box. Admins see everything anyway.
UPDATE employees SET data_scope = 'direct_reports' WHERE role = 'manager';
UPDATE employees SET data_scope = 'all' WHERE role = 'admin';

-- Seed user-approval authority for existing administrators, so the moment
-- this lands there is somebody who can approve a pending account. New
-- accounts get neither right unless it is ticked deliberately.
UPDATE employees
   SET rights = json_set(
         json_set(
           CASE WHEN rights IS NULL OR rights = '' THEN '{}' ELSE rights END,
           '$.add_users', json('true')
         ),
         '$.approve_users', json('true')
       )
 WHERE role = 'admin';
