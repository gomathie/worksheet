-- Migration number: 0001  Ledger initial schema

CREATE TABLE employees (
  id          TEXT PRIMARY KEY,       -- uuid
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,            -- used for employee login
  role        TEXT NOT NULL DEFAULT 'employee',  -- 'admin' | 'employee'
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE entries (
  id               TEXT PRIMARY KEY,
  employee_id      TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date        TEXT NOT NULL,     -- YYYY-MM-DD
  time_start       TEXT NOT NULL,     -- HH:MM
  time_end         TEXT NOT NULL,     -- HH:MM
  hours            REAL NOT NULL,     -- computed server-side; overnight = end + 24h
  classifications  INTEGER NOT NULL DEFAULT 0,
  qap              INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entries_employee_date ON entries(employee_id, work_date);
CREATE INDEX idx_entries_date ON entries(work_date);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('points_per_classification', '1'),
  ('points_per_qap', '1'),
  ('point_value', '1'),
  ('currency', '$');

CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  action      TEXT NOT NULL,          -- 'create_entry' | 'update_entry' | 'delete_entry' | 'update_settings' | ...
  target_id   TEXT,
  meta        TEXT,                   -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One-time login codes for the email + code auth flow.
CREATE TABLE login_codes (
  email       TEXT NOT NULL,
  code        TEXT NOT NULL,
  expires_at  TEXT NOT NULL,          -- ISO datetime (UTC)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_login_codes_email ON login_codes(email);
