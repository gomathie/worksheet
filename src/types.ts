import type { DailyTotal, MonthlyReport, RateSettings } from '../shared/logic'
import type {
  ExpenseAction,
  ExpenseStatus,
  ExpenseSummary,
  WorkflowConfig,
} from '../shared/expenses'

export type { MonthlyReport, RateSettings }
export type { ExpenseAction, ExpenseStatus, ExpenseSummary, WorkflowConfig }

export interface Rights {
  add_entries: boolean
  edit_entries: boolean
  delete_entries: boolean
  view_dashboard: boolean
  view_reports: boolean
  view_remuneration: boolean
  view_payslip: boolean
  log_leave: boolean
  add_expenses: boolean
  review_expenses: boolean
  finance_expenses: boolean
}

export interface WorkTypeInfo {
  id: string
  name: string
  // Admin-only fields; absent for regular employees.
  points_per_unit?: number
  active?: number
  position?: number
}

export interface Me {
  id: string
  name: string
  email: string | null
  username: string | null
  role: 'admin' | 'employee'
  rights: Rights
  work_types: WorkTypeInfo[]
  entry_limit: number // 0 = unlimited
  leave_allowance: number | null
  entry_approval: boolean // employee entries need admin approval
  department_id: string | null
  manager_id: string | null
  unread_notifications: number
  /** False when no receipt-storage bucket is bound; uploads are hidden. */
  attachments_enabled: boolean
  today: string
}

export interface Employee {
  id: string
  name: string
  email: string | null
  username: string | null
  role: 'admin' | 'employee'
  rights: Rights
  work_type_ids: string[]
  rate_overrides: Record<string, number>
  max_entries_per_day: number | null
  leave_allowance: number | null
  department_id: string | null
  manager_id: string | null
  has_password?: number
  active: number
  created_at?: string
}

export interface Entry {
  id: string
  employee_id: string
  employee_name?: string
  work_date: string
  time_start: string
  time_end: string
  hours: number
  units: Record<string, number>
  notes: string | null
  status: 'approved' | 'pending' | 'rejected'
}

export interface DailyDetailRow {
  date: string
  employee_id: string
  employee_name: string
  time_start: string
  time_end: string
  hours: number
  units: Record<string, number>
}

// The API strips money fields for non-admin viewers ("limited" scope):
// per-person points/remuneration and money totals are absent, settings only
// carries the currency, and my_summary holds the viewer's own figures.
export interface ReportPerson {
  employee_id: string
  name: string
  days_worked: number
  hours: number
  units: Record<string, number>
  points?: number
  remuneration?: number
  bonus?: number
  reimbursements?: number
  total_due?: number
  paid?: boolean
  confirmed?: boolean
}

export interface ReportPayload {
  month: string
  scope: 'full' | 'limited'
  work_types: WorkTypeInfo[]
  totals: {
    hours: number
    units: Record<string, number>
    days_worked: number
    points?: number
    remuneration?: number
    bonus?: number
    reimbursements?: number
    total_due?: number
  }
  per_person: ReportPerson[]
  daily_totals: DailyTotal[]
  settings: { currency: string } & Partial<RateSettings>
  daily_detail: DailyDetailRow[]
  my_summary?: {
    points: number
    remuneration: number
    bonus: number
    reimbursements: number
    total_due: number
    paid: boolean
    confirmed: boolean
  }
}

export interface Absence {
  id: string
  employee_id: string
  employee_name?: string
  work_date: string
  type: 'leave' | 'sick' | 'holiday' | 'unpaid' | 'other'
  note: string | null
}

export interface Adjustment {
  id: string
  employee_id: string
  employee_name?: string
  month: string
  type: 'bonus' | 'reimbursement'
  amount: number
  description: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export interface TrendData {
  employee_id: string
  employee_name: string
  currency: string
  months: string[]
  work_types: WorkTypeInfo[]
  hours: number[]
  units: Record<string, number[]>
  show_money: boolean
  points?: number[]
  remuneration?: number[]
}

// ------------------------------------------------------------ expense module

export interface Department {
  id: string
  name: string
  active: number
  created_at?: string
}

export interface ExpenseCategory {
  id: string
  name: string
  active: number
  position: number
}

export interface ExpenseVoucher {
  id: string
  voucher_number: string
  employee_id: string
  employee_name?: string
  department_id: string | null
  department_name?: string | null
  expense_date: string
  submission_date: string | null
  category_id: string | null
  category_name?: string | null
  description: string
  vendor: string | null
  amount: number
  currency: string
  payment_method: string
  receipt_available: number
  missing_receipt_reason: string | null
  declaration_accepted: number
  declaration_text: string | null
  status: ExpenseStatus
  created_by: string | null
  paid_at: string | null
  paid_by: string | null
  paid_by_name?: string | null
  paid_reference: string | null
  reopened_at: string | null
  attachment_count?: number
  created_at: string
  updated_at: string
}

export interface ExpenseApproval {
  id: string
  voucher_id: string
  approver_id: string | null
  approver_name: string | null
  role: string
  decision: string
  comments: string | null
  approved_at: string
}

export interface ExpenseAttachment {
  id: string
  voucher_id: string
  file_name: string
  content_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  uploaded_by_name?: string | null
  uploaded_at: string
}

export interface ExpenseAuditEntry {
  id: string
  voucher_id: string
  user_id: string | null
  user_name: string | null
  action: string
  field: string | null
  old_value: string | null
  new_value: string | null
  timestamp: string
}

/** A single voucher with everything the detail page renders. */
export interface ExpenseVoucherDetail extends ExpenseVoucher {
  approvals: ExpenseApproval[]
  attachments: ExpenseAttachment[]
  audit_trail: ExpenseAuditEntry[]
  /** What the current user may do — computed server-side. */
  actions: ExpenseAction[]
}

export interface ExpenseDashboard extends ExpenseSummary {
  month: string
  currency: string
  scope: 'full' | 'team' | 'own'
}

export interface ExpenseReport {
  type: string
  from: string
  to: string
  currency: string
  rows: Record<string, string | number | null>[]
}

export interface AppNotification {
  id: string
  kind: string
  title: string
  body: string | null
  voucher_id: string | null
  read_at: string | null
  created_at: string
}

export interface MyRemuneration {
  month: string
  employee_id: string
  employee_name: string
  currency: string
  hours: number
  units: Record<string, number>
  work_types: WorkTypeInfo[]
  points: number
  base: number
  bonus: number
  reimbursements: number
  total_due: number
  paid_at: string | null
  confirmed_at: string | null
  adjustments: Adjustment[]
}
