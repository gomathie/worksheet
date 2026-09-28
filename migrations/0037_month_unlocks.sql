-- Migration number: 0037  Month unlocks exemption
--
-- Ended months (month < currentMonth) are locked by default.
-- When an administrator unlocks an ended month to make changes, an exemption
-- record is stored here until they explicitly lock it back.

CREATE TABLE IF NOT EXISTS month_unlocks (
  month       TEXT PRIMARY KEY,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  unlocked_by TEXT REFERENCES employees(id) ON DELETE SET NULL
);
