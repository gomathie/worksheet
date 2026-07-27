-- Migration number: 0006  Per-day entry limit
--
-- How many time entries an employee may log per day. Enforced only for
-- employees logging their own time; admins are exempt.
--   Global default: settings key 'max_entries_per_day' (0 = unlimited).
--   Per-employee override: employees.max_entries_per_day (NULL = use global).

ALTER TABLE employees ADD COLUMN max_entries_per_day INTEGER;

INSERT OR IGNORE INTO settings (key, value) VALUES ('max_entries_per_day', '0');
