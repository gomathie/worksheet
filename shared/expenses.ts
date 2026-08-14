// Expense voucher rules shared by the Worker API, the client, and tests.
// Pure functions only — no DB, no fetch. The API is the enforcement point;
// the client uses the same helpers so the UI never offers an action the
// server would reject.

export const EXPENSE_STATUSES = [
  'draft',
  'submitted',
  'manager_review',
  // Checked by a `send_for_approval` holder before it reaches an approver.
  'screening',
  // Legacy. The finance review stage was retired when recording became its own
  // right: a voucher now goes straight from submission (or manager approval) to
  // the approver. No transition produces this any more, but rows filed under
  // the old flow keep it, so it stays a known status rather than an unlabelled
  // one — and still counts as open and as consuming petty cash.
  'finance_review',
  'admin_approval',
  'approved',
  'rejected',
  'recorded',
] as const

export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number]

/**
 * Who fronted the money. Distinct from PAYMENT_METHODS, which is *how* it was
 * paid: a voucher can be funded from the office cash box and paid by mobile
 * money. Only 'own_pocket' leaves somebody out of pocket, so it is the only
 * source that can raise a reimbursement.
 */
export const FUNDING_SOURCES = [
  'own_pocket',
  'petty_cash',
  'office_cash',
  'company_account',
] as const

export type FundingSource = (typeof FUNDING_SOURCES)[number]

export const FUNDING_SOURCE_LABELS: Record<FundingSource, string> = {
  own_pocket: 'My own pocket',
  petty_cash: 'Petty cash float I hold',
  office_cash: 'Office cash',
  company_account: 'Company account / card',
}

/** Only money the employee personally advanced can be claimed back. */
export function isReimbursable(source: FundingSource): boolean {
  return source === 'own_pocket'
}

export function parseFundingSource(value: unknown): FundingSource | null {
  const s = String(value ?? '')
  return (FUNDING_SOURCES as readonly string[]).includes(s) ? (s as FundingSource) : null
}

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
  screening: 'Being Screened',
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
  'screening',
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
  /** Route through the employee's manager before approval. */
  require_manager: boolean
}

export const DEFAULT_WORKFLOW: WorkflowConfig = {
  require_manager: true,
}

/**
 * Where a voucher lands when the employee submits it. A manager step is only
 * taken when the workflow asks for one *and* the employee actually has a
 * manager assigned — otherwise it would sit in a queue nobody owns.
 *
 * Note that no path here reaches 'approved': final approval always requires an
 * administrator holding `approve_expenses` to act. Switching the manager step
 * off shortens the chain, it does not auto-approve.
 */
export function statusAfterSubmit(
  workflow: WorkflowConfig,
  hasManager: boolean,
): ExpenseStatus {
  if (workflow.require_manager && hasManager) return 'submitted'
  return 'screening'
}

/** Where a voucher lands once the manager has approved it. */
export function statusAfterManagerApproval(): ExpenseStatus {
  return 'screening'
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
   * Holds the `record_expenses` right. Recording does not approve and cannot
   * precede approval: once an approver has approved a voucher, this is who
   * enters it in the external accounting system and marks it recorded.
   */
  can_record: boolean
  /**
   * Holds the `send_for_approval` right. Screens a submitted voucher and puts
   * it in front of an approver, or returns it for more information. Screening
   * is not approval — this actor can never decide a voucher's fate.
   */
  can_send_for_approval: boolean
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

/**
 * May this user give or refuse final approval right now?
 *
 * 'finance_review' is accepted only so that a voucher left in the retired
 * stage can still be cleared — nothing enters it any more, and without this it
 * would have no route forward.
 */
function canApprove(actor: ExpenseActor, status: ExpenseStatus): boolean {
  if (status !== 'admin_approval' && status !== 'finance_review') return false
  return isApprover(actor)
}

/** Does this user keep the external accounting records? */
function isRecorder(actor: ExpenseActor): boolean {
  return actor.is_admin || actor.can_record
}

/**
 * May this user screen a submitted voucher and put it to an approver?
 *
 * Administrators always can, so the screening queue always has an owner — the
 * right can be held by nobody at all without stranding vouchers, which is the
 * same guard the manager step relies on.
 */
function isScreener(actor: ExpenseActor): boolean {
  return actor.is_admin || actor.can_send_for_approval
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

  // --- screening: checks a submitted voucher and puts it to an approver, or
  // sends it back. Never decides it.
  if (status === 'screening' && isScreener(actor)) {
    actions.push('request_approval', 'return')
  }

  // --- recording: books the approved expense, never approves it. Only ever
  // possible once an approver has approved, which is the sole route into the
  // 'approved' state.
  if (status === 'approved' && isRecorder(actor)) {
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
      return statusAfterManagerApproval()
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

  // A voucher exists precisely because no receipt was issued, so the reason
  // and the declaration are always required — there is no "has receipt" case.
  // Only enforced at submission time so a half-finished draft can still be
  // saved.
  if (forSubmission) {
    if (!(input.missing_receipt_reason ?? '').trim()) {
      issues.push({
        field: 'missing_receipt_reason',
        message: 'A reason for the missing receipt is required',
      })
    }
    if (!input.declaration_accepted) {
      issues.push({
        field: 'declaration_accepted',
        message: 'You must accept the declaration before submitting',
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

/** Prefix for every voucher number, e.g. COH-EXP-2026-0007. */
export const VOUCHER_PREFIX = 'COH-EXP'

/**
 * COH-EXP-20260007 — prefix, then the year and a 4-digit per-year sequence
 * run together as one block.
 *
 * Applies to vouchers created from this change onwards only. The earlier
 * shape (COH-EXP-2026-0007, with a hyphen before the sequence) is left
 * untouched on existing rows: a voucher number is quoted in external
 * accounting records, so rewriting one would break the reference it exists
 * to provide. Nothing parses the number — it is only ever displayed,
 * searched by substring, and kept unique — so the two shapes coexist safely.
 */
export function formatVoucherNumber(year: string | number, sequence: number): string {
  return `${VOUCHER_PREFIX}-${year}${String(sequence).padStart(4, '0')}`
}

// ------------------------------------------------------- duplicate detection

/** How many days apart two claims can be and still look like the same one. */
export const DUPLICATE_WINDOW_DAYS = 3

export interface DuplicateCandidate {
  id: string
  employee_id: string
  category_id?: string | null
  expense_date: string
  amount: number
  status: ExpenseStatus
}

/** Whole days between two YYYY-MM-DD dates, ignoring time zones. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) -
    Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
  return Math.abs(Math.round(ms / 86_400_000))
}

/**
 * Would a reviewer reasonably suspect these are the same expense claimed
 * twice? Because a voucher is filed without a receipt, this is the only
 * mechanical check available — so it deliberately flags rather than blocks,
 * and errs toward showing the approver something to look at.
 *
 * Rejected claims are never candidates: refusing one and refiling it properly
 * is exactly what a reviewer asked for.
 */
export function isPossibleDuplicate(
  a: DuplicateCandidate,
  b: DuplicateCandidate,
  windowDays = DUPLICATE_WINDOW_DAYS,
): boolean {
  if (a.id === b.id) return false
  if (a.employee_id !== b.employee_id) return false
  if (a.status === 'rejected' || b.status === 'rejected') return false
  if (Math.round(a.amount * 100) !== Math.round(b.amount * 100)) return false
  return daysBetween(a.expense_date, b.expense_date) <= windowDays
}

/** Every claim in `others` that looks like a repeat of `voucher`. */
export function findPossibleDuplicates<T extends DuplicateCandidate>(
  voucher: DuplicateCandidate,
  others: T[],
  windowDays = DUPLICATE_WINDOW_DAYS,
): T[] {
  return others.filter((o) => isPossibleDuplicate(voucher, o, windowDays))
}

// ----------------------------------------------------------------- petty cash

/** How cash physically changed hands. */
export const PETTY_CASH_METHODS = ['cash', 'mobile_money'] as const
export type PettyCashMethod = (typeof PETTY_CASH_METHODS)[number]

export const PETTY_CASH_METHOD_LABELS: Record<PettyCashMethod, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
}

export const PETTY_CASH_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const
export type PettyCashRequestStatus = (typeof PETTY_CASH_REQUEST_STATUSES)[number]

export const PETTY_CASH_MOVEMENTS = ['issue', 'return', 'adjustment'] as const
export type PettyCashMovement = (typeof PETTY_CASH_MOVEMENTS)[number]

export interface PettyCashEntry {
  type: PettyCashMovement
  amount: number
}

/**
 * Statuses in which a petty-cash voucher has actually consumed the float.
 * A draft has not been claimed yet, and a rejected claim was disallowed — in
 * both cases the money is not accounted for, so it must not be deducted.
 */
export const PETTY_CASH_CONSUMING_STATUSES: ExpenseStatus[] = [
  'submitted',
  'manager_review',
  'screening',
  'finance_review',
  'admin_approval',
  'approved',
  'recorded',
]

export function consumesPettyCash(status: ExpenseStatus): boolean {
  return PETTY_CASH_CONSUMING_STATUSES.includes(status)
}

/** Signed value of one ledger movement: issues add, returns subtract. */
export function movementValue(entry: PettyCashEntry): number {
  if (entry.type === 'issue') return entry.amount
  if (entry.type === 'return') return -entry.amount
  return entry.amount // adjustments are stored signed
}

/**
 * What the employee should still be holding.
 *
 * Derived rather than stored, so it cannot drift from the vouchers: reopening
 * or rejecting a claim automatically returns the money to the float without
 * any compensating entry.
 */
export function pettyCashBalance(
  ledger: PettyCashEntry[],
  spent: { amount: number; status: ExpenseStatus }[],
): number {
  const issued = ledger.reduce((sum, e) => sum + movementValue(e), 0)
  const used = spent
    .filter((v) => consumesPettyCash(v.status))
    .reduce((sum, v) => sum + v.amount, 0)
  return round2(issued - used)
}

/**
 * Can this claim come out of the float? Checked when a voucher is submitted,
 * not while it is a draft — the employee may be filing it before the top-up
 * has been recorded.
 */
export function canSpendFromPettyCash(
  balance: number,
  amount: number,
): { ok: boolean; message?: string } {
  if (amount <= 0) return { ok: true }
  // Compare in minor units; comparing floats directly rejects exact-balance
  // claims that should be allowed.
  if (Math.round(amount * 100) > Math.round(balance * 100)) {
    return {
      ok: false,
      message: `That is more than the petty cash you are holding (${balance.toFixed(2)}).`,
    }
  }
  return { ok: true }
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
