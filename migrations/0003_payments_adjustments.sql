-- Migration number: 0003  Bonuses, reimbursements, and payment tracking
--
-- adjustments: monetary additions to a month's remuneration.
--   type 'bonus'          — created by an admin, always 'approved'.
--   type 'reimbursement'  — requested by an employee ('pending'), an admin
--                           approves or rejects it. Only 'approved' rows
--                           count toward the amount due.
-- payments: one row per employee per month.
--   paid_at/paid_by       — admin marked the month as paid out.
--   confirmed_at          — the employee confirmed they received it.

CREATE TABLE adjustments (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month        TEXT NOT NULL,               -- YYYY-MM
  type         TEXT NOT NULL,               -- 'bonus' | 'reimbursement'
  amount       REAL NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'approved',  -- 'pending' | 'approved' | 'rejected'
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  decided_by   TEXT,
  decided_at   TEXT
);
CREATE INDEX idx_adjustments_emp_month ON adjustments(employee_id, month);
CREATE INDEX idx_adjustments_month ON adjustments(month);

CREATE TABLE payments (
  employee_id   TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month         TEXT NOT NULL,              -- YYYY-MM
  paid_at       TEXT,
  paid_by       TEXT,
  confirmed_at  TEXT,
  PRIMARY KEY (employee_id, month)
);
