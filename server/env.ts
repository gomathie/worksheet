export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  TEAM_TZ?: string
  // Receipt storage for expense vouchers. Optional: without the binding the
  // module works in full except uploads, which return a clear 503 rather
  // than failing obscurely. See README "Receipt attachments".
  ATTACHMENTS?: R2Bucket
}

export interface Employee {
  id: string
  name: string
  email: string | null
  username: string | null
  password_hash: string | null
  role: 'admin' | 'manager' | 'employee'
  rights: string // JSON — see Rights in auth.ts
  employee_code: string | null // human-readable staff code, e.g. EMP-001
  max_entries_per_day: number | null // per-employee override; NULL = use global
  leave_allowance: number | null // annual paid-leave days; NULL = not tracked
  department_id: string | null
  manager_id: string | null // who reviews this employee's expense vouchers
  data_scope: string // 'own' | 'direct_reports' | 'department' | 'all'
  approval_status: string // 'pending' | 'approved' | 'rejected'
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  approval_note: string | null
  active: number
  created_at: string
}

export interface DepartmentRow {
  id: string
  name: string
  active: number
  created_at: string
}

export interface ExpenseCategoryRow {
  id: string
  name: string
  active: number
  position: number
  created_at: string
}

export interface ExpenseVoucherRow {
  id: string
  voucher_number: string
  employee_id: string
  department_id: string | null
  expense_date: string
  submission_date: string | null
  category_id: string | null
  description: string
  vendor: string | null
  amount: number
  currency: string
  payment_method: string
  receipt_available: number
  missing_receipt_reason: string | null
  declaration_accepted: number
  declaration_text: string | null
  paid_from_petty_cash: number
  /** Who fronted the money; authoritative over paid_from_petty_cash. */
  funding_source: string
  status: string
  created_by: string | null
  // Legacy payment columns, superseded by the recorded_* set in 0010.
  paid_at: string | null
  paid_by: string | null
  paid_reference: string | null
  recorded_at: string | null
  recorded_by: string | null
  recorded_reference: string | null
  reopened_at: string | null
  created_at: string
  updated_at: string
}

export interface ExpenseAttachmentRow {
  id: string
  voucher_id: string
  file_name: string
  file_path: string
  content_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  uploaded_at: string
}

export interface ExpenseApprovalRow {
  id: string
  voucher_id: string
  approver_id: string | null
  role: string
  decision: string
  comments: string | null
  approved_at: string
}

export interface ExpenseAuditRow {
  id: string
  voucher_id: string
  user_id: string | null
  action: string
  field: string | null
  old_value: string | null
  new_value: string | null
  timestamp: string
}

export interface NotificationRow {
  id: string
  employee_id: string
  kind: string
  title: string
  body: string | null
  voucher_id: string | null
  read_at: string | null
  emailed_at: string | null
  created_at: string
}

export interface MonthLockRow {
  month: string
  locked_at: string
  locked_by: string | null
  point_value: number
  currency: string
  rates_json: string
}

export interface AbsenceRow {
  id: string
  employee_id: string
  work_date: string
  type: string
  note: string | null
  created_by: string | null
  created_at: string
}

export interface WorkTypeRow {
  id: string
  name: string
  points_per_unit: number
  active: number
  position: number
  card_based: number // 1 = logged as individual cards, not a typed count
  /** Optional grouping label, e.g. 'Data Analytics'. NULL = ungrouped. */
  module: string | null
  created_at: string
}

export interface EntryItemRow {
  entry_id: string
  work_type_id: string
  units: number
}

export interface EntryCardRow {
  id: string
  entry_id: string
  work_type_id: string
  card_name: string
  total_audits: number
  time_completed: string | null
  created_at: string
}

export interface AdjustmentRow {
  id: string
  employee_id: string
  month: string
  type: 'bonus' | 'reimbursement'
  amount: number
  description: string | null
  // 'pending' is raised but not yet screened; 'awaiting_approval' has been put
  // to an approver by a `send_for_approval` holder.
  status: 'pending' | 'awaiting_approval' | 'approved' | 'rejected'
  created_by: string | null
  created_at: string
  decided_by: string | null
  decided_at: string | null
  /** The expense voucher that raised this claim, when it was automatic. */
  voucher_id: string | null
}

export interface PaymentRow {
  employee_id: string
  month: string
  paid_at: string | null
  paid_by: string | null
  confirmed_at: string | null
}

export interface EntryRow {
  id: string
  employee_id: string
  work_date: string
  time_start: string
  time_end: string
  hours: number
  classifications: number
  qap: number
  notes: string | null
  status: 'approved' | 'pending' | 'rejected'
  created_at: string
  updated_at: string
}
