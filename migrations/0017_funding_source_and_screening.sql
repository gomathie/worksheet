-- Migration number: 0017  Funding source, screening stage, linked reimbursements
--
-- Three related changes:
--
-- 1. Who fronted the money stops being a yes/no. `paid_from_petty_cash` only
--    distinguished the employee's float from everything else, which lumped
--    office cash and a company card in with the employee's own money. It is
--    kept in step with the new column because the petty-cash balance is
--    derived from it, but `funding_source` is now the authoritative field.
--
-- 2. A submitted voucher waits to be screened before it reaches an approver.
--    Someone holding `send_for_approval` checks it and requests approval.
--
-- 3. An own-pocket voucher can raise its reimbursement automatically, so the
--    two records are linked and a rejected voucher can withdraw its claim.

ALTER TABLE expense_vouchers ADD COLUMN funding_source TEXT NOT NULL DEFAULT 'own_pocket';

UPDATE expense_vouchers
   SET funding_source = CASE WHEN paid_from_petty_cash = 1 THEN 'petty_cash'
                             ELSE 'own_pocket' END;

CREATE INDEX idx_expense_vouchers_funding ON expense_vouchers(funding_source);

-- The reimbursement a voucher raised, so a decision on one can reach the
-- other. NULL for every reimbursement requested by hand, which stays valid.
ALTER TABLE adjustments ADD COLUMN voucher_id TEXT REFERENCES expense_vouchers(id) ON DELETE SET NULL;

CREATE INDEX idx_adjustments_voucher ON adjustments(voucher_id);

-- Reimbursements gain the same screening step as vouchers: 'pending' is now
-- "raised, not yet checked", and 'awaiting_approval' is "checked, with the
-- approver". Existing pending rows keep their meaning — nothing is rewritten,
-- so a claim already in flight is simply screened before it is decided.
