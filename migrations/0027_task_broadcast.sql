-- Migration number: 0027  "Everyone" tasks — an open pool anyone can accept
--
-- A task manager can raise a task for "Everyone" instead of one person: it
-- has no assignee until somebody accepts it, at which point it behaves like
-- any other task (that person owns progress on it, same as if they had been
-- assigned directly). `broadcast` is the marker that a task ever went
-- through the open pool, kept even after it is claimed so the page can still
-- show "opened to everyone, accepted by X" — otherwise a claimed broadcast
-- task would look identical to a normally-assigned one.
--
-- Visibility follows: a broadcast task is visible to every employee, claimed
-- or not, so the team can see what's on offer and who ended up doing it —
-- the same "shared board" idea as Jira's unassigned backlog.

ALTER TABLE tasks ADD COLUMN broadcast INTEGER NOT NULL DEFAULT 0;

-- Unclaimed broadcast tasks are what every employee's task list needs to
-- pull in alongside their own, so a dedicated index pays for itself.
CREATE INDEX idx_tasks_broadcast ON tasks(broadcast, assignee_id);
