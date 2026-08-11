import type { DailyTotal, MonthlyReport, RateSettings } from '../shared/logic'
import type { TaskAction, TaskPriority, TaskStatus } from '../shared/tasks'
import type { NewsStyle } from '../shared/news'
import type {
  ExpenseAction,
  ExpenseStatus,
  ExpenseSummary,
  WorkflowConfig,
} from '../shared/expenses'

export type { MonthlyReport, RateSettings }
export type { ExpenseAction, ExpenseStatus, ExpenseSummary, WorkflowConfig }
export type { NewsStyle }

export interface Rights {
  add_entries: boolean
  edit_entries: boolean
  delete_entries: boolean
  view_dashboard: boolean
  view_reports: boolean
  view_remuneration: boolean
  view_payslip: boolean
  /** Points as an output score. Forced off by either pay right — see auth.ts. */
  view_points: boolean
  log_leave: boolean
  /** Type Classification/QAP counts directly instead of logging cards. */
  direct_counts: boolean
  add_expenses: boolean
  review_expenses: boolean
  send_for_approval: boolean
  record_expenses: boolean
  /** Final approval; requires the admin role too. Never implicit. */
  approve_expenses: boolean
  add_users: boolean
  approve_users: boolean
  /** Holds a petty cash float and may charge vouchers to it. */
  use_petty_cash: boolean
  /** Assign tasks to other people and see the whole board. */
  manage_tasks: boolean
  /** Delete a task outright. Separate because deletion cannot be undone. */
  delete_tasks: boolean
  /** Post to the News feed, optionally as a login pop-up. See shared/news.ts. */
  send_announcements: boolean
}

export interface NewsItem {
  id: string
  title: string
  body: string | null
  style: NewsStyle
  created_by: string | null
  created_by_name: string | null
  created_at: string
  expires_at: string
  /** Present when the viewer holds the right — creator or any admin. */
  can_delete?: boolean
}

export type Role = 'admin' | 'manager' | 'employee'

export type DataScope = 'own' | 'direct_reports' | 'department' | 'all'

export const DATA_SCOPE_LABELS: Record<DataScope, string> = {
  own: 'Own records only',
  direct_reports: 'Own plus direct reports',
  department: 'Own department',
  all: 'Everyone',
}

export interface PendingUser {
  id: string
  name: string
  email: string | null
  username: string | null
  role: Role
  department_id: string | null
  manager_id: string | null
  approval_status: 'pending' | 'approved' | 'rejected'
  created_by: string | null
  created_by_name: string | null
  approval_note: string | null
  created_at: string
}

export interface WorkTypeInfo {
  id: string
  name: string
  card_based?: number // 1 = logged as cards
  /** 'audit' (Classification/QAP-style) or 'installation' (type + device).
   * See shared/installations.ts. Only meaningful when card_based. */
  card_style?: string
  // Admin-only fields; absent for regular employees.
  points_per_unit?: number
  active?: number
  position?: number
  /** Grouping label, e.g. 'Data Analytics'. Null when ungrouped. */
  module?: string | null
}

export interface EntryCard {
  id?: string
  work_type_id: string
  card_name: string
  total_audits: number
  time_completed: string | null
  /** Installation-style cards only (see shared/installations.ts). */
  installation_type?: string | null
  device_type?: string | null
  installation_action?: string | null
  replaced_device_type?: string | null
}

export interface Me {
  id: string
  name: string
  email: string | null
  phone: string | null
  username: string | null
  role: Role
  rights: Rights
  work_types: WorkTypeInfo[]
  entry_limit: number // 0 = unlimited
  leave_allowance: number | null
  entry_approval: boolean // employee entries need admin approval
  department_id: string | null
  manager_id: string | null
  data_scope: DataScope
  unread_notifications: number
  /** False when no receipt-storage bucket is bound; uploads are hidden. */
  attachments_enabled: boolean
  today: string
}

export interface Employee {
  id: string
  employee_code: string | null
  name: string
  email: string | null
  phone: string | null
  username: string | null
  role: Role
  rights: Rights
  work_type_ids: string[]
  rate_overrides: Record<string, number>
  max_entries_per_day: number | null
  leave_allowance: number | null
  department_id: string | null
  manager_id: string | null
  data_scope: DataScope
  approval_status: 'pending' | 'approved' | 'rejected'
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
  cards?: EntryCard[]
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
// carries the currency, and my_summary holds the viewer's own figures — as
// cedi amounts only, since points alongside them would reveal point_value.
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
  locked?: boolean
  locked_at?: string | null
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
  // Pay or points, never both, and absent without either right. The two shapes
  // are disjoint so a template cannot render an equation between them.
  my_summary?:
    | {
        remuneration: number
        bonus: number
        reimbursements: number
        total_due: number
        paid: boolean
        confirmed: boolean
        points?: undefined
      }
    | { points: number; remuneration?: undefined }
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
  // 'pending' is raised but unscreened; 'awaiting_approval' is with the approver.
  status: 'pending' | 'awaiting_approval' | 'approved' | 'rejected'
  created_by?: string | null
  /** Who raised it — resolved server-side; null if that account was removed. */
  created_by_name?: string | null
  created_at: string
  decided_by?: string | null
  decided_at?: string | null
  /** Set when an own-pocket expense voucher raised this claim. */
  voucher_id?: string | null
}

export interface FinanceTrailEntryLine {
  kind: 'entry'
  date: string
  entry_id: string
  work_date: string
  hours: number
  status: 'approved' | 'pending' | 'rejected'
  items: { work_type_id: string; name: string; units: number }[]
  points: number
  value: number
  counted: boolean
  running_total: number
}

export interface FinanceTrailAdjustmentLine {
  kind: 'adjustment'
  date: string
  id: string
  adj_type: 'bonus' | 'reimbursement'
  amount: number
  description: string | null
  status: 'pending' | 'awaiting_approval' | 'approved' | 'rejected'
  created_by_name: string | null
  created_at: string
  decided_by_name: string | null
  decided_at: string | null
  counted: boolean
  running_total: number
}

export interface FinanceTrail {
  employee_id: string
  employee_name: string
  employee_code: string | null
  month: string
  currency: string
  locked: boolean
  point_value: number
  base: number
  bonus: number
  reimbursements: number
  total_due: number
  paid_at: string | null
  confirmed_at: string | null
  trail: (FinanceTrailEntryLine | FinanceTrailAdjustmentLine)[]
}

export interface InstallationsReport {
  year: string
  months: string[]
  total: number[]
  /** Keyed by device name, not id — resolved server-side. */
  by_device: Record<string, number[]>
  by_action: Record<string, number[]>
  /** Which makes came out on a replacement — answers "what's mostly faulty". */
  by_replaced_device: Record<string, number[]>
}

export interface DeviceTypeInfo {
  id: string
  name: string
  active?: number
  position?: number
}

export interface PendingDeviceType {
  id: string
  name: string
  approval_status: 'pending' | 'approved' | 'rejected'
  created_by: string | null
  created_by_name: string | null
  approval_note: string | null
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
  show_points: boolean
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

export type PettyCashMethod = 'cash' | 'mobile_money'

export interface PettyCashEntry {
  id: string
  employee_id: string
  type: 'issue' | 'return' | 'adjustment'
  amount: number
  note: string | null
  method: PettyCashMethod | null
  reference: string | null
  created_by_name: string | null
  created_at: string
}

export interface PettyCashRequest {
  id: string
  employee_id: string
  employee_name: string
  amount: number
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  decision_note: string | null
  decided_by_name: string | null
  decided_at: string | null
  created_at: string
}

export interface PettyCashHolder {
  employee_id: string
  employee_name: string
  employee_code: string | null
  issued: number
  spent: number
  balance: number
  last_issued_at: string | null
}

export interface PettyCashPayload {
  currency: string
  can_use: boolean
  can_issue: boolean
  balance: number
  ledger: PettyCashEntry[]
  spent: {
    id: string
    voucher_number: string
    expense_date: string
    amount: number
    status: ExpenseStatus
  }[]
  holders: PettyCashHolder[]
  requests: PettyCashRequest[]
}

export interface DuplicateMatch {
  id: string
  voucher_number: string
  expense_date: string
  amount: number
  status: ExpenseStatus
  category_name: string | null
}

export interface ExpenseVoucher {
  id: string
  voucher_number: string
  employee_id: string
  employee_name?: string
  employee_code?: string | null
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
  // A voucher only exists when no receipt was issued, so the reason and the
  // declaration are always present. (The DB keeps a receipt_available column
  // for schema compatibility; it is always 0 and nothing reads it.)
  missing_receipt_reason: string | null
  declaration_accepted: number
  declaration_text: string | null
  paid_from_petty_cash: number
  funding_source: string
  status: ExpenseStatus
  created_by: string | null
  recorded_at: string | null
  recorded_by: string | null
  recorded_by_name?: string | null
  recorded_reference: string | null
  reopened_at: string | null
  attachment_count?: number
  /** Near-identical claims by the same employee; 0 unless the API computed it. */
  duplicate_count?: number
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
  possible_duplicates: DuplicateMatch[]
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
  employee_code?: string | null
  currency: string
  hours: number
  units: Record<string, number>
  work_types: WorkTypeInfo[]
  /** Admin viewers only — omitted from an employee's own slip. */
  points?: number
  base: number
  bonus: number
  reimbursements: number
  total_due: number
  paid_at: string | null
  confirmed_at: string | null
  adjustments: Adjustment[]
}

export interface Task {
  id: string
  task_code: string | null
  title: string
  details: string | null
  assignee_id: string | null
  assignee_name: string | null
  created_by: string | null
  created_by_name: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  completed_at: string | null
  created_at: string
  updated_at?: string
  /** Raised for "Everyone" rather than one person; see TaskDetailView. */
  broadcast: number
  /** What the signed-in user may do to this task; computed server-side. */
  actions: TaskAction[]
}
