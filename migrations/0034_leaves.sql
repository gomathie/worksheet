CREATE TABLE leaves (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  type TEXT NOT NULL, -- 'sick', 'vacation', 'unpaid', 'personal'
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'approved', 'rejected'
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT REFERENCES employees(id),
  reviewed_at TEXT
);
CREATE INDEX idx_leaves_employee ON leaves(employee_id);
CREATE INDEX idx_leaves_dates ON leaves(start_date, end_date);
