-- Migration 0038: Automatic task-violation point deductions
--
-- Separate from point_deductions (0035) on purpose: that table's admin_id is
-- NOT NULL REFERENCES employees(id) because every row there is something a
-- human admin did. A missed-task penalty has no human actor — it's the
-- system noticing a task went TASK_VIOLATION_DAYS (shared/tasks.ts) without
-- being touched — so it gets its own table rather than forcing a fake
-- "system" employee row into a column that exists specifically to answer
-- "who did this".
--
-- One row per violation *window*: (task_id, violation_at) is unique, where
-- violation_at is the task's updated_at at the moment it went stale. Pinging
-- the task, reopening it, or any other change bumps updated_at, which opens
-- a new window — so a task that goes stale again later can be penalized
-- again, but the same stale window is never double-charged.
-- task_id deliberately has no FK (same as point_deductions.task_id): this
-- table is append-only (see the triggers below), and an ON DELETE CASCADE
-- FK would try to delete these rows when their task is deleted, which the
-- append-only trigger would then abort — SQLite fires BEFORE DELETE triggers
-- for cascade-originated deletes too, not just direct ones. A deleted task's
-- violation history simply outlives it, same as a deleted task's manual
-- point_deductions already do.
CREATE TABLE task_violations (
  id               TEXT PRIMARY KEY,                               -- uuid
  task_id          TEXT NOT NULL,
  employee_id      TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount           REAL NOT NULL,                                  -- points actually deducted (may be less than configured if the balance was short)
  configured_amount REAL NOT NULL,                                 -- the admin-configured penalty at the time, for audit clarity
  previous_balance REAL NOT NULL,
  new_balance      REAL NOT NULL,
  month            TEXT NOT NULL,                                  -- YYYY-MM the deduction counts against
  violation_at     TEXT NOT NULL,                                  -- task's updated_at when it crossed the threshold
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_task_violations_employee ON task_violations(employee_id, month);
CREATE INDEX idx_task_violations_task ON task_violations(task_id);
CREATE UNIQUE INDEX idx_task_violations_window ON task_violations(task_id, violation_at);

-- Append-only, same as point_deductions: these are penalty records.
CREATE TRIGGER task_violations_no_update
BEFORE UPDATE ON task_violations
BEGIN
  SELECT RAISE(ABORT, 'task_violations is append-only');
END;

CREATE TRIGGER task_violations_no_delete
BEFORE DELETE ON task_violations
BEGIN
  SELECT RAISE(ABORT, 'task_violations is append-only');
END;
