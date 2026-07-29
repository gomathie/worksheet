-- Migration number: 0011  Month-end locking with rate snapshots
--
-- Locking a month freezes both its rates and its data. The rate snapshot
-- (point value, currency, per-work-type points, per-employee overrides) is
-- captured at lock time as JSON, so later rate changes never alter a locked
-- month's report or payslips. The API also rejects entry/adjustment changes
-- for a locked month, so the frozen figures cannot drift.

CREATE TABLE month_locks (
  month       TEXT PRIMARY KEY,          -- YYYY-MM
  locked_at   TEXT NOT NULL DEFAULT (datetime('now')),
  locked_by   TEXT,
  point_value REAL NOT NULL,
  currency    TEXT NOT NULL,
  rates_json  TEXT NOT NULL              -- { work_types: [...], overrides: {...} }
);
