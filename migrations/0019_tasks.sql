-- Migration number: 0019  Task management
--
-- A standalone to-do list: a task has someone it belongs to, a state and
-- optionally a date it is wanted by. Deliberately not connected to entries,
-- cards or pay — a task is a note about intent, and nothing here feeds a
-- points or money calculation. If time ever needs to be logged against a task,
-- that is a later migration adding a task_id to entries, not a change here.

CREATE TABLE tasks (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  details      TEXT,
  -- Who is to do it. NULL is a task nobody has picked up yet, which is a real
  -- state rather than a defect.
  assignee_id  TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_by   TEXT REFERENCES employees(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'todo',    -- todo | in_progress | done | cancelled
  priority     TEXT NOT NULL DEFAULT 'normal',  -- low | normal | high
  due_date     TEXT,                            -- YYYY-MM-DD, optional
  -- Set when the task first reaches 'done', so "when was this finished" does
  -- not have to be inferred from updated_at, which any edit moves.
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The two lists the page actually draws: someone's own open work, and
-- everything due soonest.
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id, status);
CREATE INDEX idx_tasks_due ON tasks(due_date);
