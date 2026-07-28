-- Migration number: 0010  Approval as a granted right; external-record step
--
-- Two changes to the expense workflow:
--
-- 1. Final approval is now the `approve_expenses` right rather than something
--    every administrator holds. An approver is an admin who has also been
--    granted it, so approval authority can be delegated — and withheld.
--    Finance no longer approves: it escalates ('request_approval') and, once
--    an approver has approved, records the expense externally.
--
-- 2. 'paid' is replaced by 'recorded' — finance confirms the expense has been
--    entered into the external accounting records. Reaching 'recorded'
--    requires 'approved' first, which only an approver can grant.
--
-- The paid_* columns are left in place (SQLite column drops are risky and they
-- are harmless); nothing reads them after this migration.

ALTER TABLE expense_vouchers ADD COLUMN recorded_at TEXT;
ALTER TABLE expense_vouchers ADD COLUMN recorded_by TEXT REFERENCES employees(id);
ALTER TABLE expense_vouchers ADD COLUMN recorded_reference TEXT;

-- Carry over anything already marked paid under the previous model so no
-- voucher is left in a status the application no longer understands.
UPDATE expense_vouchers
   SET recorded_at        = paid_at,
       recorded_by        = paid_by,
       recorded_reference = paid_reference,
       status             = 'recorded'
 WHERE status = 'paid';

-- Seed the new right for existing administrators. Without this nobody could
-- approve anything the moment this migration lands, and every submitted
-- voucher would stall. New accounts start without it — it is ticked
-- deliberately in the Employees tab.
UPDATE employees
   SET rights = json_set(
         CASE
           WHEN rights IS NULL OR rights = '' THEN '{}'
           ELSE rights
         END,
         '$.approve_expenses',
         json('true')
       )
 WHERE role = 'admin';

CREATE INDEX idx_expense_vouchers_recorded ON expense_vouchers(recorded_at);
