// Expense voucher rules shared by the Worker API, the client, and tests.
// Pure functions only — no DB, no fetch. The API is the enforcement point;
// the client uses the same helpers so the UI never offers an action the
// server would reject.

export const EXPENSE_STATUSES = [
  'draft',
  'submitted',
  'manager_review',
  'finance_review',
  'admin_approval',
  'approved',
  'rejected',
  'recorded',
] as const

export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number]

export const PAYMENT_METHODS = [
  'cash',
  'mobile_money',
  'bank',
  'card',
  'other',
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
  bank: 'Bank',
  card: 'Card',
  other: 'Other',
}

export const STATUS_LABELS: Record<ExpenseStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  manager_review: 'Manager Review',
  finance_review: 'Finance Review',
  admin_approval: 'Awaiting Admin Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  recorded: 'Recorded',
}

/** Statuses that still need somebody to act. Drives the "pending" counters. */
export const OPEN_STATUSES: ExpenseStatus[] = [
  'submitted',
  'manager_review',
  'finance_review',
  'admin_approval',
]

export const DEFAULT_DECLARATION =
  'I certify that this expense was incurred for official organizational ' +
  'purposes. As no receipt is available, I declare that the information ' +
  'provided is true and accurate to the best of my knowledge.'

export const ALLOWED_ATTACHMENT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'] as const

export const ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // 10 MB

// ------------------------------------------------------------------ workflow

export interface WorkflowConfig {
  /** Route through the employee's manager before finance. */
  require_manager: boolean
  /** Route through finance before the voucher counts as approved. */
  require_finance: boolean
}

export const DEFAULT_WORKFLOW: WorkflowConfig = {
  require_manager: true,
  require_finance: true,
}

/**
 * Where a voucher lands when the employee submits it. A manager step is only
 * taken when the workflow asks for one *and* the employee actually has a
 * manager assigned — otherwise it would sit in a queue nobody owns.
 *
 * Note that no path here reaches 'approved': final approval always requires an
 * administrator holding `approve_expenses` to act. Switching both optional
 * steps off shortens the chain, it does not auto-approve.
 */
export function statusAfterSubmit(
  workflow: WorkflowConfig,
  hasManager: boolean,
): ExpenseStatus {
  if (workflow.require_manager && hasManager) return 'submitted'
  if (workflow.require_finance) return 'finance_review'
  return 'admin_approval'
}

/** Where a voucher lands once the manager has approved it. */
export function statusAfterManagerApproval(workflow: WorkflowConfig): ExpenseStatus {
  return workflow.require_finance ? 'finance_review' : 'admin_approval'
}

// -------------------------------------------------------------- permissions

/**
 * What the acting user is to this voucher. Built server-side from the session
 * and the voucher row; the client builds the same shape from `/api/me`.
 */
export interface ExpenseActor {
  is_admin: boolean
  /** Holds the `add_expenses` right. */
  can_create: boolean
  /** Holds the `review_expenses` right (manager-side review). */
  can_review: boolean
  /**
   * Holds the `finance_expenses` right. Finance does not approve: it escalates
   * to an approver and, once approved, records the expense in the external
   * accounting system.
   */
  can_finance: boolean
  /**
   * Holds the `approve_expenses` right — final approval authority. This is
   * granted explicitly and is NOT implied by the admin role; an approver is an
   * administrator who also holds it.
   */
  can_approve: boolean
  /** The voucher belongs to this user. */
  is_owner: boolean
  /** This user is the voucher owner's assigned manager. */
  is_manager_of_owner: boolean
}

export type ExpenseAction =
  | 'edit'
  | 'delete'
  | 'submit'
  | 'start_review'
  | 'manager_approve'
  | 'manager_reject'
  | 'request_approval'
  | 'admin_approve'
  | 'admin_reject'
  | 'return'
  | 'mark_recorded'
  | 'reopen'
  | 'add_attachment'
  | 'remove_attachment'

export interface VoucherState {
  status: ExpenseStatus
  /** Set when an administrator reopened an already-decided voucher. */
  reopened: boolean
}

/** May this user take a manager decision right now? */
function canActAsManager(actor: ExpenseActor, status: ExpenseStatus): boolean {
  if (status !== 'submitted' && status !== 'manager_review') return false
  if (actor.is_admin) return true
  // A reviewer only decides for their own direct reports, and never for
  // their own voucher — that would be self-approval.
  return actor.can_review && actor.is_manager_of_owner && !actor.is_owner
}

/**
 * Final approval authority. Deliberately requires BOTH the admin role and the
 * `approve_expenses` right, so approval is something granted rather than
 * something every administrator holds by virtue of being one.
 */
export function isApprover(actor: ExpenseActor): boolean {
  return actor.is_admin && actor.can_approve
}

/** May this user give or refuse final approval right now? */
function canApprove(actor: ExpenseActor, status: ExpenseStatus): boolean {
  if (status !== 'finance_review' && status !== 'admin_approval') return false
  return isApprover(actor)
}

/** Does this user hold the finance desk (escalation and recording)? */
function isFinance(actor: ExpenseActor): boolean {
  return actor.is_admin || actor.can_finance
}

/**
 * Every action the user may take on a voucher in this state. The API calls
 * this before mutating; the UI calls it to decide which buttons to render.
 */
export function allowedActions(
  state: VoucherState,
  actor: ExpenseActor,
): ExpenseAction[] {
  const actions: ExpenseAction[] = []
  const { status } = state
  const decided = status === 'approved' || status === 'recorded'

  // --- owner-side
  if (status === 'draft' && (actor.is_owner ? actor.can_create : actor.is_admin)) {
    actions.push('edit', 'submit', 'delete', 'add_attachment', 'remove_attachment')
  } else if (actor.is_admin) {
    // Administrators hold full CRUD, but an approved or recorded voucher is
    // frozen until it is explicitly reopened — that is the audit boundary.
    if (!decided || state.reopened) {
      actions.push('edit', 'add_attachment', 'remove_attachment')
    }
    actions.push('delete')
  }

  // --- manager-side
  if (canActAsManager(actor, status)) {
    if (status === 'submitted') actions.push('start_review')
    actions.push('manager_approve', 'manager_reject', 'return')
  }

  // --- finance desk: escalate and record, but never approve
  if (status === 'finance_review' && isFinance(actor)) {
    actions.push('request_approval', 'return')
  }
  // Recording is only ever possible once an approver has approved, which is
  // the only route into the 'approved' state.
  if (status === 'approved' && isFinance(actor)) {
    actions.push('mark_recorded')
  }

  // --- final approval
  if (canApprove(actor, status)) {
    actions.push('admin_approve', 'admin_reject', 'return')
  }

  // --- administrator override
  if (actor.is_admin && (decided || status === 'rejected')) {
    actions.push('reopen')
  }

  return [...new Set(actions)]
}

export function can(
  action: ExpenseAction,
  state: VoucherState,
  actor: ExpenseActor,
): boolean {
  return allowedActions(state, actor).includes(action)
}

/** The status a voucher moves to for a given decision. */
export function statusAfter(
  action: ExpenseAction,
  workflow: WorkflowConfig,
  hasManager: boolean,
): ExpenseStatus | null {
  switch (action) {
    case 'submit':
      return statusAfterSubmit(workflow, hasManager)
    case 'start_review':
      return 'manager_review'
    case 'manager_approve':
      return statusAfterManagerApproval(workflow)
    case 'request_approval':
      return 'admin_approval'
    case 'admin_approve':
      return 'approved'
    case 'manager_reject':
    case 'admin_reject':
      return 'rejected'
    case 'return':
    case 'reopen':
      return 'draft'
    case 'mark_recorded':
      return 'recorded'
    default:
      return null
  }
}

// -------------------------------------------------------------- validation

export interface VoucherInput {
  expense_date?: string
  description?: string
  amount?: number
  currency?: string
  payment_method?: string
  category_id?: string | null
  vendor?: string | null
  receipt_available?: boolean
  missing_receipt_reason?: string | null
  declaration_accepted?: boolean
}

export interface ValidationIssue {
  field: string
  message: string
}

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/**
 * Field-level rules. `today` is the team-timezone date so "not in the future"
 * means the same thing on the server and in the browser.
 *
 * `forSubmission` applies the rules that only bite once the voucher leaves
 * draft: a draft may be saved incomplete, but it cannot be submitted that way.
 */
export function validateVoucher(
  input: VoucherInput,
  today: string,
  forSubmission = true,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!input.expense_date || !DATE_RE.test(input.expense_date)) {
    issues.push({ field: 'expense_date', message: 'Expense date must be YYYY-MM-DD' })
  } else if (input.expense_date > today) {
    issues.push({
      field: 'expense_date',
      message: 'Expense date cannot be in the future',
    })
  }

  const description = (input.description ?? '').trim()
  if (!description) {
    issues.push({ field: 'description', message: 'Purpose / description is required' })
  }

  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    issues.push({ field: 'amount', message: 'Amount must be greater than zero' })
  }

  if (!input.currency || !String(input.currency).trim()) {
    issues.push({ field: 'currency', message: 'Currency is required' })
  }

  if (
    !input.payment_method ||
    !PAYMENT_METHODS.includes(input.payment_method as PaymentMethod)
  ) {
    issues.push({ field: 'payment_method', message: 'Choose a valid payment method' })
  }

  // Missing-receipt declaration. Only enforced at submission time so a
  // half-finished draft can still be saved.
  if (forSubmission && !input.receipt_available) {
    if (!(input.missing_receipt_reason ?? '').trim()) {
      issues.push({
        field: 'missing_receipt_reason',
        message: 'A reason is required when no receipt is available',
      })
    }
    if (!input.declaration_accepted) {
      issues.push({
        field: 'declaration_accepted',
        message: 'You must accept the declaration when no receipt is available',
      })
    }
  }

  return issues
}

/** Filename/MIME check for receipt uploads. */
export function validateAttachment(
  fileName: string,
  contentType: string | null,
  sizeBytes: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (!(ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    issues.push({
      field: 'file',
      message: 'Receipts must be PDF, JPG, JPEG, or PNG',
    })
  }
  if (
    contentType &&
    !(ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(contentType.split(';')[0])
  ) {
    issues.push({ field: 'file', message: `Unsupported file type: ${contentType}` })
  }
  if (sizeBytes <= 0) {
    issues.push({ field: 'file', message: 'File is empty' })
  } else if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    issues.push({ field: 'file', message: 'File must be 10 MB or smaller' })
  }
  return issues
}

// ------------------------------------------------------------- voucher number

/** EV-2026-0007 */
export function formatVoucherNumber(year: string | number, sequence: number): string {
  return `EV-${year}-${String(sequence).padStart(4, '0')}`
}

// -------------------------------------------------------------- aggregation

export interface VoucherLike {
  id: string
  employee_id: string
  employee_name?: string | null
  department_id?: string | null
  department_name?: string | null
  category_id?: string | null
  category_name?: string | null
  expense_date: string
  amount: number
  status: ExpenseStatus
  receipt_available: number | boolean
}

export interface Bucket {
  key: string
  label: string
  count: number
  amount: number
}

export interface ExpenseSummary {
  counts: Record<ExpenseStatus, number>
  pending_approval: number
  /** Approved but not yet entered into the external accounting system. */
  approved: number
  rejected: number
  recorded: number
  total_this_month: number
  missing_receipt_count: number
  by_category: Bucket[]
  by_employee: Bucket[]
  by_department: Bucket[]
  total_amount: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

function bucketBy(
  vouchers: VoucherLike[],
  keyOf: (v: VoucherLike) => string,
  labelOf: (v: VoucherLike) => string,
): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const v of vouchers) {
    const key = keyOf(v)
    const b = map.get(key) ?? { key, label: labelOf(v), count: 0, amount: 0 }
    b.count += 1
    b.amount = round2(b.amount + v.amount)
    map.set(key, b)
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount)
}

/**
 * Dashboard figures for a set of vouchers.
 *
 * Rejected vouchers are counted but excluded from every money total — the
 * organization never owed that money, so rolling it into "total expenses"
 * would overstate spend.
 */
export function summarize(vouchers: VoucherLike[], month: string): ExpenseSummary {
  const counts = Object.fromEntries(
    EXPENSE_STATUSES.map((s) => [s, 0]),
  ) as Record<ExpenseStatus, number>
  for (const v of vouchers) counts[v.status] = (counts[v.status] ?? 0) + 1

  const billable = vouchers.filter((v) => v.status !== 'rejected')
  const thisMonth = billable.filter((v) => v.expense_date.startsWith(month))

  return {
    counts,
    pending_approval: OPEN_STATUSES.reduce((n, s) => n + counts[s], 0),
    approved: counts.approved,
    rejected: counts.rejected,
    recorded: counts.recorded,
    total_this_month: round2(thisMonth.reduce((s, v) => s + v.amount, 0)),
    missing_receipt_count: vouchers.filter((v) => !v.receipt_available).length,
    by_category: bucketBy(
      billable,
      (v) => v.category_id ?? 'uncategorized',
      (v) => v.category_name ?? 'Uncategorized',
    ),
    by_employee: bucketBy(
      billable,
      (v) => v.employee_id,
      (v) => v.employee_name ?? 'Unknown',
    ),
    by_department: bucketBy(
      billable,
      (v) => v.department_id ?? 'none',
      (v) => v.department_name ?? 'No department',
    ),
    total_amount: round2(billable.reduce((s, v) => s + v.amount, 0)),
  }
}
