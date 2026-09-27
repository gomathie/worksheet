-- Migration 0035: Point deductions / admin penalty system
--
-- Points are normally computed on the fly from entries × work-type rates.
-- This table records explicit admin-initiated deductions (or "let it go"
-- decisions) so the monthly report can subtract them and every change to
-- an employee's effective score is auditable.

CREATE TABLE point_deductions (
  id               TEXT PRIMARY KEY,                          -- uuid
  employee_id      TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  admin_id         TEXT NOT NULL REFERENCES employees(id),    -- who performed it
  amount           REAL NOT NULL,                             -- points deducted (positive)
  reason           TEXT NOT NULL,                             -- required explanation
  task_id          TEXT,                                       -- optional related task
  warning_ref      TEXT,                                       -- optional warning/incident ref
  previous_balance REAL NOT NULL,                             -- balance before deduction
  new_balance      REAL NOT NULL,                             -- balance after deduction
  month            TEXT NOT NULL,                             -- YYYY-MM
  decision         TEXT NOT NULL DEFAULT 'deducted',          -- 'deducted' | 'let_it_go'
  idempotency_key  TEXT,                                       -- prevents duplicate submissions
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_point_deductions_employee ON point_deductions(employee_id, month);
CREATE INDEX idx_point_deductions_admin    ON point_deductions(admin_id);
CREATE INDEX idx_point_deductions_month    ON point_deductions(month);
CREATE UNIQUE INDEX idx_point_deductions_idempotency ON point_deductions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Append-only: deductions are immutable records.
CREATE TRIGGER point_deductions_no_update
BEFORE UPDATE ON point_deductions
BEGIN
  SELECT RAISE(ABORT, 'point_deductions is append-only');
END;

CREATE TRIGGER point_deductions_no_delete
BEFORE DELETE ON point_deductions
BEGIN
  SELECT RAISE(ABORT, 'point_deductions is append-only');
END;
