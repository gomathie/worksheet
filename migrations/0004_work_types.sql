-- Migration number: 0004  Admin-defined work types replace fixed classification/QAP
--
-- work_types: admin-managed catalog (name + points per unit), e.g.
--   Classification, QAP, Graphic design, Social media post.
-- entry_items: units logged per work type per entry (replaces the fixed
--   entries.classifications / entries.qap columns, which are kept but frozen).
-- employee_work_types: which types each employee may log. Employees not
--   assigned Classification/QAP cannot record such units — enforced in the API.

CREATE TABLE work_types (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  points_per_unit  REAL NOT NULL DEFAULT 1,
  active           INTEGER NOT NULL DEFAULT 1,
  position         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE entry_items (
  entry_id      TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  work_type_id  TEXT NOT NULL REFERENCES work_types(id) ON DELETE CASCADE,
  units         REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (entry_id, work_type_id)
);
CREATE INDEX idx_entry_items_type ON entry_items(work_type_id);

CREATE TABLE employee_work_types (
  employee_id   TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_type_id  TEXT NOT NULL REFERENCES work_types(id) ON DELETE CASCADE,
  PRIMARY KEY (employee_id, work_type_id)
);

-- Seed the catalog from the current settings so past rates carry over.
INSERT INTO work_types (id, name, points_per_unit, position)
  SELECT 'wt-classification', 'Classification',
    COALESCE((SELECT CAST(value AS REAL) FROM settings WHERE key = 'points_per_classification'), 1), 0;
INSERT INTO work_types (id, name, points_per_unit, position)
  SELECT 'wt-qap', 'QAP',
    COALESCE((SELECT CAST(value AS REAL) FROM settings WHERE key = 'points_per_qap'), 1), 1;

-- Move existing counts into entry_items.
INSERT INTO entry_items (entry_id, work_type_id, units)
  SELECT id, 'wt-classification', classifications FROM entries WHERE classifications > 0;
INSERT INTO entry_items (entry_id, work_type_id, units)
  SELECT id, 'wt-qap', qap FROM entries WHERE qap > 0;

-- Every existing employee keeps the two original work types.
INSERT INTO employee_work_types (employee_id, work_type_id)
  SELECT id, 'wt-classification' FROM employees;
INSERT INTO employee_work_types (employee_id, work_type_id)
  SELECT id, 'wt-qap' FROM employees;
