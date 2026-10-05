-- Migration 0039: Repeat automatic task-violation penalties
--
-- 0038 keyed one violation per (task_id, violation_at) — one row per "touch
-- epoch" (violation_at is the task's updated_at at the moment it went
-- stale). That meant a task left untouched forever after its first
-- violation could never be charged again: violation_at never changes
-- without a touch, so the unique index silently blocked every later
-- attempt. This adds a `sequence` column so more than one violation can be
-- recorded within the same touch epoch — see shared/tasks.ts
-- `isTaskViolationDue` and `TASK_VIOLATION_REPEAT_DAYS`: the 1st still waits
-- the full TASK_VIOLATION_DAYS, every one after that only waits
-- TASK_VIOLATION_REPEAT_DAYS from the previous one, for as long as the task
-- stays untouched.

ALTER TABLE task_violations ADD COLUMN sequence INTEGER NOT NULL DEFAULT 1;

DROP INDEX idx_task_violations_window;
CREATE UNIQUE INDEX idx_task_violations_window ON task_violations(task_id, violation_at, sequence);
