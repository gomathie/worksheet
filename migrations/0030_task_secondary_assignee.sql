-- Migration number: 0030  Task secondary assignee
--
-- Adds an optional secondary person to a task, and their role (assignee or observer).

ALTER TABLE tasks ADD COLUMN secondary_person_id TEXT REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN secondary_role TEXT; -- 'assignee' | 'observer'
