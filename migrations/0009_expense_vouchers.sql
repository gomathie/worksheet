-- Migration number: 0009  Expense vouchers
--
-- Employees declare business expenses — especially where no receipt exists —
-- and route them through manager then finance approval to payment.
--
-- Workflow (see shared/expenses.ts, which is the single source of truth):
--   draft -> submitted -> manager_review -> finance_review -> approved -> paid
--   with rejected reachable from any review state, and a return-for-info path
--   back to draft. Steps are skippable via the two settings keys below.
--
-- RBAC reuses the existing rights JSON on employees (add_expenses,
-- review_expenses, finance_expenses); "manager" is the employees.manager_id
-- relation rather than a new role, so admins keep implicit full access.

-- ------------------------------------------------------------- departments

CREATE TABLE departments (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_departments_name ON departments(lower(name));

-- An employee belongs to a department and reports to a manager. Both are
-- optional: existing rows keep working, vouchers just carry no department
-- and skip the manager step until an admin fills them in.
ALTER TABLE employees ADD COLUMN department_id TEXT REFERENCES departments(id);
ALTER TABLE employees ADD COLUMN manager_id TEXT REFERENCES employees(id);
CREATE INDEX idx_employees_manager ON employees(manager_id);
CREATE INDEX idx_employees_department ON employees(department_id);

-- -------------------------------------------------------- expense categories

CREATE TABLE expense_categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_expense_categories_name ON expense_categories(lower(name));

INSERT INTO expense_categories (id, name, position) VALUES
  ('ec-transport',    'Transport',            0),
  ('ec-meals',        'Meals & Refreshments', 1),
  ('ec-accom',        'Accommodation',        2),
  ('ec-supplies',     'Office Supplies',      3),
  ('ec-comms',        'Airtime & Data',       4),
  ('ec-fuel',         'Fuel',                 5),
  ('ec-repairs',      'Repairs & Maintenance',6),
  ('ec-other',        'Other',                7);

-- ---------------------------------------------------------- expense vouchers

CREATE TABLE expense_vouchers (
  id                      TEXT PRIMARY KEY,
  voucher_number          TEXT NOT NULL,             -- EV-YYYY-NNNN
  employee_id             TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  department_id           TEXT REFERENCES departments(id),
  expense_date            TEXT NOT NULL,             -- YYYY-MM-DD
  submission_date         TEXT,                      -- YYYY-MM-DD, set on submit
  category_id             TEXT REFERENCES expense_categories(id),
  description             TEXT NOT NULL,
  vendor                  TEXT,
  amount                  REAL NOT NULL,
  currency                TEXT NOT NULL DEFAULT '$',
  payment_method          TEXT NOT NULL,             -- cash|mobile_money|bank|card|other
  receipt_available       INTEGER NOT NULL DEFAULT 0,
  missing_receipt_reason  TEXT,                      -- required when no receipt
  declaration_accepted    INTEGER NOT NULL DEFAULT 0,
  declaration_text        TEXT,                      -- snapshot of what was agreed to
  status                  TEXT NOT NULL DEFAULT 'draft',
  created_by              TEXT REFERENCES employees(id),
  paid_at                 TEXT,
  paid_by                 TEXT REFERENCES employees(id),
  paid_reference          TEXT,                      -- finance's payment reference
  reopened_at             TEXT,                      -- admin reopened after approval
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_expense_vouchers_number ON expense_vouchers(voucher_number);
CREATE INDEX idx_expense_vouchers_employee ON expense_vouchers(employee_id, expense_date);
CREATE INDEX idx_expense_vouchers_status ON expense_vouchers(status);
CREATE INDEX idx_expense_vouchers_date ON expense_vouchers(expense_date);
CREATE INDEX idx_expense_vouchers_department ON expense_vouchers(department_id);

-- Sequence for voucher numbers, one row per year. Bumped inside the same
-- batch as the insert so concurrent creates cannot collide (the UNIQUE index
-- above is the backstop).
CREATE TABLE expense_voucher_seq (
  year  TEXT PRIMARY KEY,
  next  INTEGER NOT NULL DEFAULT 1
);

-- ------------------------------------------------------------- attachments

CREATE TABLE expense_attachments (
  id           TEXT PRIMARY KEY,
  voucher_id   TEXT NOT NULL REFERENCES expense_vouchers(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  file_path    TEXT NOT NULL,          -- R2 object key
  content_type TEXT,
  size_bytes   INTEGER,
  uploaded_by  TEXT REFERENCES employees(id),
  uploaded_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_expense_attachments_voucher ON expense_attachments(voucher_id);

-- --------------------------------------------------------------- approvals

-- One row per decision taken on a voucher, in order.
CREATE TABLE expense_approvals (
  id           TEXT PRIMARY KEY,
  voucher_id   TEXT NOT NULL REFERENCES expense_vouchers(id) ON DELETE CASCADE,
  approver_id  TEXT REFERENCES employees(id),
  role         TEXT NOT NULL,          -- manager|finance|admin
  decision     TEXT NOT NULL,          -- approved|rejected|returned|paid
  comments     TEXT,
  approved_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_expense_approvals_voucher ON expense_approvals(voucher_id, approved_at);

-- --------------------------------------------------------------- audit logs

-- Immutable by construction: the triggers below reject UPDATE and DELETE, so
-- the only legal operation is INSERT. Do not add an ON DELETE CASCADE here —
-- the history must outlive the voucher it describes.
CREATE TABLE expense_audit_logs (
  id          TEXT PRIMARY KEY,
  voucher_id  TEXT NOT NULL,
  user_id     TEXT,
  action      TEXT NOT NULL,          -- created|edited|submitted|approved|...
  field       TEXT,                   -- which field changed, when applicable
  old_value   TEXT,
  new_value   TEXT,
  timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_expense_audit_voucher ON expense_audit_logs(voucher_id, timestamp);

CREATE TRIGGER expense_audit_logs_no_update
BEFORE UPDATE ON expense_audit_logs
BEGIN
  SELECT RAISE(ABORT, 'expense_audit_logs is append-only');
END;

CREATE TRIGGER expense_audit_logs_no_delete
BEFORE DELETE ON expense_audit_logs
BEGIN
  SELECT RAISE(ABORT, 'expense_audit_logs is append-only');
END;

-- ------------------------------------------------------------ notifications

-- In-app notifications. Email delivery reuses server/email.ts; emailed_at
-- records that the SMTP send was attempted so the bell and the inbox agree.
CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  voucher_id  TEXT,                   -- deep link target, when relevant
  read_at     TEXT,
  emailed_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_employee ON notifications(employee_id, read_at, created_at);

-- ------------------------------------------------------------- workflow config

-- '1' = the step is part of the chain, '0' = skip it.
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('expense_require_manager', '1'),
  ('expense_require_finance', '1');
