-- Migration number: 0036  Option to keep expenses in app (internal expenses)
--
-- Adds support for approved expenses that should be retained internally within
-- the app rather than sent to the external accounting/ERP recording system.

ALTER TABLE expense_vouchers ADD COLUMN keep_in_app INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expense_vouchers ADD COLUMN kept_at TEXT;
ALTER TABLE expense_vouchers ADD COLUMN kept_by TEXT REFERENCES employees(id);
ALTER TABLE expense_vouchers ADD COLUMN kept_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_expense_vouchers_keep_in_app ON expense_vouchers(keep_in_app);
