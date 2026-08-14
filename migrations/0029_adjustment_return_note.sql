-- Migration number: 0029  Reimbursements can be returned for more information
--
-- Mirrors the voucher flow's "return for more information" step, which had no
-- equivalent for a reimbursement claim: a screener or approver could only
-- approve or reject one outright, with no way to ask the claimant a question
-- and hand it back.
--
-- A returned claim goes back to 'pending' — the state where the employee can
-- still edit or withdraw it — so no new status value is needed. What was
-- missing is *why* it came back, which is what return_note carries.
-- returned_at distinguishes "raised and never screened" from "screened, sent
-- back, and awaiting the employee's answer", since both sit at 'pending'.

ALTER TABLE adjustments ADD COLUMN return_note TEXT;
ALTER TABLE adjustments ADD COLUMN returned_at TEXT;
ALTER TABLE adjustments ADD COLUMN returned_by TEXT;
