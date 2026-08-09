-- Migration number: 0022  Task codes (TASK-001, TASK-002, ...)
--
-- A short, human-readable id for each task — same idea as employee codes and
-- voucher numbers, so a task can be pointed at ("what's the status on
-- TASK-014?") without quoting the internal uuid. Uses a dedicated sequence
-- table (like expense_voucher_seq) rather than MAX(...)+1, so two concurrent
-- creates cannot land on the same number.

CREATE TABLE task_seq (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  next  INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE tasks ADD COLUMN task_code TEXT;

-- Backfill existing tasks, oldest first, as TASK-001, TASK-002, ...
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn FROM tasks
)
UPDATE tasks
SET task_code = 'TASK-' || printf('%03d', (SELECT rn FROM numbered WHERE numbered.id = tasks.id));

CREATE UNIQUE INDEX idx_tasks_code ON tasks(task_code);

-- Seed the sequence to the last number just handed out, so the next call to
-- nextTaskCode() (which does next = next + 1 then reads it) continues on
-- from there rather than colliding with the backfill.
INSERT INTO task_seq (id, next) SELECT 1, COUNT(*) FROM tasks;
