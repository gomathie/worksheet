-- Migration number: 0016  Split recording out of the finance right
--
-- `finance_expenses` bundled two authorities: escalating a voucher to an
-- approver, and booking an approved one into the external accounting records.
-- Filing, approving and recording are now three separate rights, and the
-- finance review stage is retired — a submitted voucher goes to the manager
-- (when one is assigned) and then straight to an approver.
--
-- Everyone who held the old right keeps the half that survives: recording.
-- The retired key is dropped in the same statement so the stored rights match
-- what the app now reads. parseRights also falls back to the old key, so the
-- window between deploying the code and running this migration is safe.

UPDATE employees
   SET rights = json_remove(
                  json_set(rights, '$.record_expenses',
                           json(CASE WHEN json_extract(rights, '$.finance_expenses') IN (1, true)
                                     THEN 'true' ELSE 'false' END)),
                  '$.finance_expenses')
 WHERE json_extract(rights, '$.finance_expenses') IS NOT NULL;

-- The finance step is no longer configurable because it no longer exists.
DELETE FROM settings WHERE key = 'expense_require_finance';

-- Any voucher left in the retired stage is handed to the approvers, which is
-- where it would have gone next anyway. No rows are expected in practice.
UPDATE expense_vouchers
   SET status = 'admin_approval', updated_at = datetime('now')
 WHERE status = 'finance_review';
