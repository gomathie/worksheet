-- Migration number: 0010  Auto-generated employee codes
--
-- A human-readable staff code (e.g. EMP-001) shown on the team list and
-- payslips, separate from the internal UUID primary key. Generated
-- sequentially with a configurable prefix (settings 'employee_code_prefix').

ALTER TABLE employees ADD COLUMN employee_code TEXT;

-- Backfill existing employees, oldest first, as EMP-001, EMP-002, …
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn FROM employees
)
UPDATE employees
SET employee_code = 'EMP-' || printf('%03d', (SELECT rn FROM numbered WHERE numbered.id = employees.id));

CREATE UNIQUE INDEX idx_employees_code ON employees(employee_code);

INSERT OR IGNORE INTO settings (key, value) VALUES ('employee_code_prefix', 'EMP-');
