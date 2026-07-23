-- Migration number: 0002  Username/password auth + per-employee rights
--
-- Admins assign a username and password to each employee; login is
-- username + password (replaces the one-time email code flow).
-- `rights` is a JSON object: {"edit_entries":bool,"view_dashboard":bool,"view_reports":bool}.
-- Admins implicitly hold every right.

ALTER TABLE employees ADD COLUMN username TEXT;
ALTER TABLE employees ADD COLUMN password_hash TEXT;
ALTER TABLE employees ADD COLUMN rights TEXT NOT NULL
  DEFAULT '{"edit_entries":true,"view_dashboard":false,"view_reports":false}';

CREATE UNIQUE INDEX idx_employees_username
  ON employees(lower(username)) WHERE username IS NOT NULL;

-- One-time login codes are no longer used.
DROP TABLE login_codes;
