-- Migration number: 0007  Leave / absence tracking
--
-- absences: days an employee did not work, by type. Distinct from a missing
-- time entry ("forgot to log"). One record per employee per day.
--   type: 'leave' | 'sick' | 'holiday' | 'unpaid' | 'other'
-- employees.leave_allowance: annual paid-leave days; NULL = not tracked.

CREATE TABLE absences (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date    TEXT NOT NULL,             -- YYYY-MM-DD
  type         TEXT NOT NULL,
  note         TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (employee_id, work_date)
);
CREATE INDEX idx_absences_employee_date ON absences(employee_id, work_date);

ALTER TABLE employees ADD COLUMN leave_allowance INTEGER;
