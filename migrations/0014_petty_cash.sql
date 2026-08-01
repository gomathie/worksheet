-- Migration number: 0014  Petty cash floats
--
-- An administrator hands an employee cash to spend on the organization's
-- behalf. When that employee files a voucher and marks it as paid from the
-- float, what they are still holding goes down by the same amount.
--
-- The balance is deliberately NOT a stored column. It is derived:
--
--   balance = SUM(ledger movements) - SUM(petty-cash vouchers in play)
--
-- where "in play" means any status except draft and rejected. Deriving it
-- means the figure can never drift out of step with the vouchers, and a
-- voucher being rejected, returned to draft, reopened or deleted needs no
-- compensating entry — the sum simply stops including it.

-- Money handed out, handed back, or corrected. Expenses are NOT recorded
-- here; they come from expense_vouchers, which is the single source of truth
-- for what was spent.
CREATE TABLE petty_cash_ledger (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- 'issue'      cash given to the employee            (increases the float)
  -- 'return'     cash handed back                      (decreases the float)
  -- 'adjustment' correction, signed as stored          (either direction)
  type         TEXT NOT NULL,
  amount       REAL NOT NULL,
  note         TEXT,
  created_by   TEXT REFERENCES employees(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_petty_cash_employee ON petty_cash_ledger(employee_id, created_at);

-- Did this expense come out of the employee's float, or their own pocket?
ALTER TABLE expense_vouchers
  ADD COLUMN paid_from_petty_cash INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_expense_vouchers_petty
  ON expense_vouchers(employee_id, paid_from_petty_cash);
