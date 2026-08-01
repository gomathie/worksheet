-- Migration number: 0015  Petty cash top-up requests
--
-- A float holder asks for cash; an administrator confirms what was actually
-- handed over and how. The amount confirmed may differ from the amount asked
-- for, so the request records what was wanted and the ledger records what was
-- given — they are deliberately separate numbers.
--
-- Only a confirmed request writes to petty_cash_ledger, so a pending request
-- never moves the balance.

CREATE TABLE petty_cash_requests (
  id            TEXT PRIMARY KEY,
  employee_id   TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount        REAL NOT NULL,            -- what was asked for
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  decided_by    TEXT REFERENCES employees(id),
  decided_at    TEXT,
  decision_note TEXT
);
CREATE INDEX idx_petty_cash_requests_employee
  ON petty_cash_requests(employee_id, status);
CREATE INDEX idx_petty_cash_requests_status ON petty_cash_requests(status);

-- How the money actually changed hands, and the request it settles (if any).
--   method: 'cash' | 'mobile_money'
--   reference: mobile-money transaction id, or whatever finance writes down
ALTER TABLE petty_cash_ledger ADD COLUMN method TEXT;
ALTER TABLE petty_cash_ledger ADD COLUMN reference TEXT;
ALTER TABLE petty_cash_ledger ADD COLUMN request_id TEXT REFERENCES petty_cash_requests(id);
