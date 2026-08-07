-- Migration number: 0021  Employee codes switch to the ID-2023 prefix
--
-- Replaces the original EMP-00X scheme with ID-2023001, ID-2023002, ... for
-- every employee — existing and future. Existing codes are rewritten in the
-- same relative order they were originally assigned (oldest first), mirroring
-- how 0010_employee_code.sql did the initial backfill, so relative ordering
-- is preserved even though the numbers themselves change.

UPDATE settings SET value = 'ID-2023' WHERE key = 'employee_code_prefix';
INSERT OR IGNORE INTO settings (key, value) VALUES ('employee_code_prefix', 'ID-2023');

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn FROM employees
)
UPDATE employees
SET employee_code = 'ID-2023' || printf('%03d', (SELECT rn FROM numbered WHERE numbered.id = employees.id));
