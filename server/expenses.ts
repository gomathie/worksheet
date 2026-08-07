// Expense voucher API handlers.
//
// Rules live in shared/expenses.ts; this module is the enforcement point —
// it resolves who the caller is relative to each voucher, applies the state
// machine, writes the immutable audit trail, and fans out notifications.

import type {
  Employee,
  Env,
  ExpenseApprovalRow,
  ExpenseAttachmentRow,
  ExpenseAuditRow,
  ExpenseCategoryRow,
  ExpenseVoucherRow,
  DepartmentRow,
} from './env'
import { ApiError, json, readJson, todayInTz } from './http'
import { audit, parseRights, requireAdmin, requireUser } from './auth'
import { loadSettings } from './settings'
import { employeesWithRight, notifyUser, notifyUsers } from './notify'
import { scopeClause, visibleEmployeeIds } from './scope'
import { balanceFor } from './pettycash'
import {
  DEFAULT_DECLARATION,
  PAYMENT_METHODS,
  DUPLICATE_WINDOW_DAYS,
  canSpendFromPettyCash,
  consumesPettyCash,
  formatVoucherNumber,
  parseFundingSource,
  isReimbursable,
  allowedActions,
  statusAfter,
  summarize,
  validateAttachment,
  validateVoucher,
  type ExpenseAction,
  type ExpenseActor,
  type ExpenseStatus,
  type FundingSource,
  type PaymentMethod,
  type WorkflowConfig,
} from '../shared/expenses'

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function today(env: Env): string {
  return todayInTz(env.TEAM_TZ ?? 'Africa/Accra')
}

function fail(issues: { field: string; message: string }[]): never {
  throw new ApiError(400, issues.map((i) => i.message).join('; '))
}

// ------------------------------------------------------------------ workflow

export async function loadWorkflow(env: Env): Promise<WorkflowConfig> {
  const { results } = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key = 'expense_require_manager'",
  ).all<{ key: string; value: string }>()
  const m = new Map(results.map((r) => [r.key, r.value]))
  return {
    require_manager: (m.get('expense_require_manager') ?? '1') === '1',
  }
}

async function saveWorkflow(env: Env, w: WorkflowConfig): Promise<void> {
  const stmt = env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  await env.DB.batch([
    stmt.bind('expense_require_manager', w.require_manager ? '1' : '0'),
  ])
}

// -------------------------------------------------------------- audit trail

/**
 * Append to the immutable trail. The table rejects UPDATE and DELETE at the
 * database level (see migration 0009), so this is the only way in.
 */
async function trail(
  env: Env,
  voucherId: string,
  userId: string | null,
  action: string,
  field: string | null = null,
  oldValue: unknown = null,
  newValue: unknown = null,
): Promise<void> {
  const str = (v: unknown) =>
    v === null || v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v)
  await env.DB.prepare(
    `INSERT INTO expense_audit_logs (id, voucher_id, user_id, action, field, old_value, new_value)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), voucherId, userId, action, field, str(oldValue), str(newValue))
    .run()
}

/** Record one audit row per changed field. */
async function trailDiff(
  env: Env,
  voucherId: string,
  userId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  for (const [field, next] of Object.entries(after)) {
    const prev = before[field]
    if (String(prev ?? '') === String(next ?? '')) continue
    await trail(env, voucherId, userId, 'edited', field, prev, next)
  }
}

// --------------------------------------------------------------- actor model

async function buildActor(
  env: Env,
  user: Employee,
  voucher: Pick<ExpenseVoucherRow, 'employee_id'>,
): Promise<ExpenseActor> {
  const rights = parseRights(user)
  let isManagerOfOwner = false
  if (rights.review_expenses && voucher.employee_id !== user.id) {
    const owner = await env.DB.prepare('SELECT manager_id FROM employees WHERE id = ?')
      .bind(voucher.employee_id)
      .first<{ manager_id: string | null }>()
    isManagerOfOwner = owner?.manager_id === user.id
  }
  return {
    is_admin: user.role === 'admin',
    can_create: rights.add_expenses,
    can_review: rights.review_expenses,
    can_record: rights.record_expenses,
    can_send_for_approval: rights.send_for_approval,
    can_approve: rights.approve_expenses,
    is_owner: voucher.employee_id === user.id,
    is_manager_of_owner: isManagerOfOwner,
  }
}

/** Readable phrasing for refusals — "add attachment this voucher" reads badly. */
const ACTION_PHRASES: Record<ExpenseAction, string> = {
  edit: 'edit this voucher',
  delete: 'delete this voucher',
  submit: 'submit this voucher',
  start_review: 'start reviewing this voucher',
  manager_approve: 'approve this voucher as a manager',
  manager_reject: 'reject this voucher as a manager',
  request_approval: 'send this voucher for approval',
  admin_approve: 'give final approval on this voucher',
  admin_reject: 'reject this voucher',
  return: 'return this voucher for more information',
  mark_recorded: 'mark this voucher as recorded',
  reopen: 'reopen this voucher',
  add_attachment: 'attach a receipt to this voucher',
  remove_attachment: 'remove a receipt from this voucher',
}

function requireAction(
  action: ExpenseAction,
  voucher: ExpenseVoucherRow,
  actor: ExpenseActor,
): void {
  const state = {
    status: voucher.status as ExpenseStatus,
    reopened: Boolean(voucher.reopened_at),
  }
  if (!allowedActions(state, actor).includes(action)) {
    throw new ApiError(403, `You cannot ${ACTION_PHRASES[action]}`)
  }
}

async function loadVoucher(env: Env, id: string): Promise<ExpenseVoucherRow> {
  const voucher = await env.DB.prepare('SELECT * FROM expense_vouchers WHERE id = ?')
    .bind(id)
    .first<ExpenseVoucherRow>()
  if (!voucher) throw new ApiError(404, 'Voucher not found')
  return voucher
}

/** Direct reports of a user, used to scope a reviewer's queue. */
async function directReportIds(env: Env, managerId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    'SELECT id FROM employees WHERE manager_id = ?',
  )
    .bind(managerId)
    .all<{ id: string }>()
  return results.map((r) => r.id)
}

// ------------------------------------------------------------ voucher number

async function nextVoucherNumber(env: Env, year: string): Promise<string> {
  // Increment and read in one batch so two concurrent creates cannot land on
  // the same number; the UNIQUE index on voucher_number is the backstop.
  const batch = await env.DB.batch<{ next: number }>([
    env.DB.prepare(
      'INSERT INTO expense_voucher_seq (year, next) VALUES (?, 1) ON CONFLICT(year) DO UPDATE SET next = next + 1',
    ).bind(year),
    env.DB.prepare('SELECT next FROM expense_voucher_seq WHERE year = ?').bind(year),
  ])
  const seq = batch[1].results?.[0]?.next ?? 1
  return formatVoucherNumber(year, seq)
}

// ------------------------------------------------------- duplicate detection

/**
 * Claims by the same employee for the same amount within a few days of this
 * one. Filed without receipts, a voucher has no external artefact to check
 * against, so surfacing near-identical claims is the one mechanical control
 * available. It informs the reviewer; it never blocks a submission.
 */
async function possibleDuplicates(
  env: Env,
  voucher: Pick<ExpenseVoucherRow, 'id' | 'employee_id' | 'amount' | 'expense_date'>,
) {
  const { results } = await env.DB.prepare(
    `SELECT v.id, v.voucher_number, v.expense_date, v.amount, v.status,
            c.name AS category_name
       FROM expense_vouchers v
       LEFT JOIN expense_categories c ON c.id = v.category_id
      WHERE v.employee_id = ?
        AND v.id <> ?
        AND v.status <> 'rejected'
        AND ROUND(v.amount, 2) = ROUND(?, 2)
        AND ABS(julianday(v.expense_date) - julianday(?)) <= ?
      ORDER BY v.expense_date DESC
      LIMIT 10`,
  )
    .bind(
      voucher.employee_id,
      voucher.id,
      voucher.amount,
      voucher.expense_date,
      DUPLICATE_WINDOW_DAYS,
    )
    .all()
  return results
}

/** Duplicate counts for a whole queue, in one query rather than N. */
async function duplicateCounts(
  env: Env,
  ids: string[],
): Promise<Record<string, number>> {
  if (ids.length === 0) return {}
  const placeholders = ids.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT v.id, COUNT(d.id) AS n
       FROM expense_vouchers v
       LEFT JOIN expense_vouchers d
         ON d.employee_id = v.employee_id
        AND d.id <> v.id
        AND d.status <> 'rejected'
        AND ROUND(d.amount, 2) = ROUND(v.amount, 2)
        AND ABS(julianday(d.expense_date) - julianday(v.expense_date)) <= ?
      WHERE v.id IN (${placeholders})
      GROUP BY v.id`,
  )
    .bind(DUPLICATE_WINDOW_DAYS, ...ids)
    .all<{ id: string; n: number }>()
  const out: Record<string, number> = {}
  for (const r of results) if (r.n > 0) out[r.id] = r.n
  return out
}

/** Attach duplicate counts to a list of voucher rows. */
async function withDuplicateCounts<T extends { id: string }>(
  env: Env,
  rows: T[],
): Promise<(T & { duplicate_count: number })[]> {
  const counts = await duplicateCounts(env, rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, duplicate_count: counts[r.id] ?? 0 }))
}

// ------------------------------------------------------------- departments

export async function listDepartments(request: Request, env: Env): Promise<Response> {
  await requireUser(request, env)
  const { results } = await env.DB.prepare(
    'SELECT * FROM departments ORDER BY name',
  ).all<DepartmentRow>()
  return json(results)
}

export async function createDepartment(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const body = await readJson<{ name?: string }>(request)
  const name = (body.name ?? '').trim().slice(0, 80)
  if (!name) throw new ApiError(400, 'name is required')
  const id = crypto.randomUUID()
  try {
    await env.DB.prepare('INSERT INTO departments (id, name) VALUES (?, ?)')
      .bind(id, name)
      .run()
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new ApiError(409, 'That department already exists')
    throw e
  }
  await audit(env, admin.id, 'create_department', id, { name })
  return json(await env.DB.prepare('SELECT * FROM departments WHERE id = ?').bind(id).first(), 201)
}

export async function patchDepartment(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const existing = await env.DB.prepare('SELECT * FROM departments WHERE id = ?')
    .bind(id)
    .first<DepartmentRow>()
  if (!existing) throw new ApiError(404, 'Department not found')
  const body = await readJson<{ name?: string; active?: number | boolean }>(request)
  const name = body.name !== undefined ? String(body.name).trim().slice(0, 80) : existing.name
  if (!name) throw new ApiError(400, 'name cannot be empty')
  const active = body.active !== undefined ? (body.active ? 1 : 0) : existing.active
  try {
    await env.DB.prepare('UPDATE departments SET name = ?, active = ? WHERE id = ?')
      .bind(name, active, id)
      .run()
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new ApiError(409, 'That department already exists')
    throw e
  }
  await audit(env, admin.id, 'update_department', id, { name, active })
  return json(await env.DB.prepare('SELECT * FROM departments WHERE id = ?').bind(id).first())
}

// --------------------------------------------------------------- categories

export async function listCategories(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const { results } = await env.DB.prepare(
    'SELECT * FROM expense_categories ORDER BY position, name',
  ).all<ExpenseCategoryRow>()
  if (user.role === 'admin') return json(results)
  return json(results.filter((c) => c.active))
}

export async function createCategory(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const body = await readJson<{ name?: string }>(request)
  const name = (body.name ?? '').trim().slice(0, 80)
  if (!name) throw new ApiError(400, 'name is required')
  const id = crypto.randomUUID()
  try {
    await env.DB.prepare(
      'INSERT INTO expense_categories (id, name, position) VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM expense_categories))',
    )
      .bind(id, name)
      .run()
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new ApiError(409, 'That category already exists')
    throw e
  }
  await audit(env, admin.id, 'create_expense_category', id, { name })
  return json(
    await env.DB.prepare('SELECT * FROM expense_categories WHERE id = ?').bind(id).first(),
    201,
  )
}

export async function patchCategory(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const existing = await env.DB.prepare('SELECT * FROM expense_categories WHERE id = ?')
    .bind(id)
    .first<ExpenseCategoryRow>()
  if (!existing) throw new ApiError(404, 'Category not found')
  const body = await readJson<{ name?: string; active?: number | boolean }>(request)
  const name = body.name !== undefined ? String(body.name).trim().slice(0, 80) : existing.name
  if (!name) throw new ApiError(400, 'name cannot be empty')
  const active = body.active !== undefined ? (body.active ? 1 : 0) : existing.active
  try {
    await env.DB.prepare('UPDATE expense_categories SET name = ?, active = ? WHERE id = ?')
      .bind(name, active, id)
      .run()
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new ApiError(409, 'That category already exists')
    throw e
  }
  await audit(env, admin.id, 'update_expense_category', id, { name, active })
  return json(
    await env.DB.prepare('SELECT * FROM expense_categories WHERE id = ?').bind(id).first(),
  )
}

// ----------------------------------------------------------------- workflow

export async function getWorkflow(request: Request, env: Env): Promise<Response> {
  await requireUser(request, env)
  return json(await loadWorkflow(env))
}

export async function putWorkflow(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const body = await readJson<Partial<WorkflowConfig>>(request)
  const current = await loadWorkflow(env)
  const next: WorkflowConfig = {
    require_manager: body.require_manager ?? current.require_manager,
  }
  await saveWorkflow(env, next)
  await audit(env, admin.id, 'update_expense_workflow', null, next)
  return json(next)
}

// ------------------------------------------------------------------ listing

const SELECT_VOUCHER = `
  SELECT v.*,
         emp.name  AS employee_name,
         emp.employee_code AS employee_code,
         d.name    AS department_name,
         c.name    AS category_name,
         recorder.name AS recorded_by_name,
         (SELECT COUNT(*) FROM expense_attachments a WHERE a.voucher_id = v.id) AS attachment_count
  FROM expense_vouchers v
  JOIN employees emp ON emp.id = v.employee_id
  LEFT JOIN departments d ON d.id = v.department_id
  LEFT JOIN expense_categories c ON c.id = v.category_id
  LEFT JOIN employees recorder ON recorder.id = v.recorded_by
`

/**
 * Restrict a query to what the caller may see:
 *   admin / recorder — everything
 *   reviewer         — their own plus their direct reports'
 *   everyone else    — their own only, or whatever their data scope allows
 */
async function visibilityClause(
  env: Env,
  user: Employee,
): Promise<{ sql: string; binds: unknown[] }> {
  const rights = parseRights(user)
  // Whoever books the accounts reconciles the whole organization's spend, so
  // it is unrestricted regardless of the assigned data scope.
  if (user.role === 'admin' || rights.record_expenses || rights.send_for_approval)
    return { sql: '', binds: [] }

  const scoped = await visibleEmployeeIds(env, user)
  const ids = new Set<string>(scoped ?? [])
  if (scoped === null) return { sql: '', binds: [] }
  ids.add(user.id)
  // Reviewing your reports' vouchers is part of the manager step, so the
  // right widens visibility even when the data scope is narrower.
  if (rights.review_expenses) {
    for (const id of await directReportIds(env, user.id)) ids.add(id)
  }

  const clause = scopeClause([...ids], 'v.employee_id')
  return { sql: clause.sql, binds: clause.binds }
}

export async function listVouchers(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const url = new URL(request.url)
  const p = url.searchParams

  let sql = `${SELECT_VOUCHER} WHERE 1 = 1`
  const binds: unknown[] = []

  const scope = await visibilityClause(env, user)
  sql += scope.sql
  binds.push(...scope.binds)

  const employeeId = p.get('employee_id')
  if (employeeId) {
    sql += ' AND v.employee_id = ?'
    binds.push(employeeId)
  }
  const departmentId = p.get('department_id')
  if (departmentId) {
    sql += ' AND v.department_id = ?'
    binds.push(departmentId)
  }
  const categoryId = p.get('category_id')
  if (categoryId) {
    sql += ' AND v.category_id = ?'
    binds.push(categoryId)
  }
  const status = p.get('status')
  if (status) {
    const wanted = status.split(',').filter(Boolean)
    if (wanted.length) {
      sql += ` AND v.status IN (${wanted.map(() => '?').join(',')})`
      binds.push(...wanted)
    }
  }
  const from = p.get('from')
  if (from && DATE_RE.test(from)) {
    sql += ' AND v.expense_date >= ?'
    binds.push(from)
  }
  const to = p.get('to')
  if (to && DATE_RE.test(to)) {
    sql += ' AND v.expense_date <= ?'
    binds.push(to)
  }
  const q = (p.get('q') ?? '').trim()
  if (q) {
    sql += ' AND (v.voucher_number LIKE ? OR v.description LIKE ? OR v.vendor LIKE ?)'
    const like = `%${q}%`
    binds.push(like, like, like)
  }

  sql += ' ORDER BY v.expense_date DESC, v.created_at DESC LIMIT 500'

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all<ExpenseVoucherRow & { employee_name: string }>()
  return json(results)
}

/** The queues that drive the approval and finance screens. */
export async function listQueue(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const rights = parseRights(user)
  const url = new URL(request.url)
  const which = url.searchParams.get('queue') ?? 'manager'

  if (which === 'manager') {
    if (!rights.review_expenses && user.role !== 'admin') {
      throw new ApiError(403, 'You do not have permission for this')
    }
    let sql = `${SELECT_VOUCHER} WHERE v.status IN ('submitted', 'manager_review')`
    const binds: unknown[] = []
    if (user.role !== 'admin') {
      // Reviewers see their own direct reports only, never their own voucher.
      const reports = await directReportIds(env, user.id)
      if (reports.length === 0) return json([])
      sql += ` AND v.employee_id IN (${reports.map(() => '?').join(',')}) AND v.employee_id <> ?`
      binds.push(...reports, user.id)
    }
    sql += ' ORDER BY v.submission_date, v.created_at'
    const { results } = await env.DB.prepare(sql)
      .bind(...binds)
      .all<{ id: string }>()
    return json(await withDuplicateCounts(env, results))
  }

  if (which === 'screening') {
    if (!rights.send_for_approval && user.role !== 'admin') {
      throw new ApiError(403, 'You do not have permission for this')
    }
    const { results } = await env.DB.prepare(
      `${SELECT_VOUCHER} WHERE v.status = 'screening'
       ORDER BY v.submission_date, v.created_at`,
    ).all<{ id: string }>()
    return json(await withDuplicateCounts(env, results))
  }

  if (which === 'record') {
    if (!rights.record_expenses && user.role !== 'admin') {
      throw new ApiError(403, 'You do not have permission for this')
    }
    // Only approved vouchers can be booked; nothing earlier is actionable
    // here, because recording cannot precede approval.
    const { results } = await env.DB.prepare(
      `${SELECT_VOUCHER} WHERE v.status = 'approved'
       ORDER BY v.submission_date, v.created_at`,
    ).all<{ id: string }>()
    return json(await withDuplicateCounts(env, results))
  }

  if (which === 'approver') {
    // Approval is admin + the explicit right; neither alone is enough.
    if (!(user.role === 'admin' && rights.approve_expenses)) {
      throw new ApiError(403, 'You do not have expense approval rights')
    }
    // 'finance_review' is legacy — no voucher enters it any more, but one
    // filed under the old flow still needs an approver to be able to clear it.
    const { results } = await env.DB.prepare(
      `${SELECT_VOUCHER} WHERE v.status IN ('admin_approval', 'finance_review')
       ORDER BY CASE v.status WHEN 'admin_approval' THEN 0 ELSE 1 END, v.submission_date, v.created_at`,
    ).all<{ id: string }>()
    return json(await withDuplicateCounts(env, results))
  }

  throw new ApiError(400, "queue must be 'manager', 'screening', 'record', or 'approver'")
}

export async function getVoucher(request: Request, env: Env, id: string): Promise<Response> {
  const user = await requireUser(request, env)
  const voucher = await env.DB.prepare(`${SELECT_VOUCHER} WHERE v.id = ?`)
    .bind(id)
    .first<ExpenseVoucherRow & { employee_name: string }>()
  if (!voucher) throw new ApiError(404, 'Voucher not found')

  const actor = await buildActor(env, user, voucher)
  const rights = parseRights(user)
  const visible =
    actor.is_admin ||
    actor.is_owner ||
    actor.is_manager_of_owner ||
    rights.record_expenses ||
    rights.send_for_approval
  if (!visible) throw new ApiError(403, 'You cannot view this voucher')

  const [approvals, attachments, trailRows, duplicates] = await Promise.all([
    env.DB.prepare(
      'SELECT a.*, e.name AS approver_name FROM expense_approvals a LEFT JOIN employees e ON e.id = a.approver_id WHERE a.voucher_id = ? ORDER BY a.approved_at',
    )
      .bind(id)
      .all<ExpenseApprovalRow & { approver_name: string | null }>(),
    env.DB.prepare(
      'SELECT a.*, e.name AS uploaded_by_name FROM expense_attachments a LEFT JOIN employees e ON e.id = a.uploaded_by WHERE a.voucher_id = ? ORDER BY a.uploaded_at',
    )
      .bind(id)
      .all<ExpenseAttachmentRow & { uploaded_by_name: string | null }>(),
    env.DB.prepare(
      'SELECT l.*, e.name AS user_name FROM expense_audit_logs l LEFT JOIN employees e ON e.id = l.user_id WHERE l.voucher_id = ? ORDER BY l.timestamp DESC, l.rowid DESC',
    )
      .bind(id)
      .all<ExpenseAuditRow & { user_name: string | null }>(),
    possibleDuplicates(env, voucher),
  ])

  return json({
    ...voucher,
    approvals: approvals.results,
    attachments: attachments.results,
    audit_trail: trailRows.results,
    possible_duplicates: duplicates,
    actions: allowedActions(
      { status: voucher.status as ExpenseStatus, reopened: Boolean(voucher.reopened_at) },
      actor,
    ),
  })
}

// ----------------------------------------------------------- create / update

interface VoucherBody {
  employee_id?: string
  department_id?: string | null
  expense_date?: string
  category_id?: string | null
  description?: string
  vendor?: string | null
  amount?: number
  currency?: string
  payment_method?: string
  missing_receipt_reason?: string | null
  declaration_accepted?: boolean
  paid_from_petty_cash?: boolean
  funding_source?: string
  /** Save and submit in one step. */
  submit?: boolean
  /**
   * Raise a reimbursement alongside an own-pocket voucher. Set from the
   * dialog shown at submission time; ignored for every other funding source,
   * because nobody else is out of pocket.
   */
  request_reimbursement?: boolean
}

function normalizeBody(body: VoucherBody, currency: string) {
  // `funding_source` is authoritative; `paid_from_petty_cash` is derived from
  // it so the petty-cash balance (which is computed from that column) stays
  // correct. A body that only sends the old boolean still works.
  const funding =
    parseFundingSource(body.funding_source) ??
    (body.paid_from_petty_cash ? 'petty_cash' : 'own_pocket')
  return {
    funding_source: funding,
    expense_date: (body.expense_date ?? '').trim(),
    category_id: body.category_id || null,
    description: (body.description ?? '').trim().slice(0, 1000),
    vendor: (body.vendor ?? '')?.toString().trim().slice(0, 160) || null,
    amount: Math.round(Number(body.amount ?? 0) * 100) / 100,
    currency: (body.currency ?? currency).toString().trim().slice(0, 4) || currency,
    payment_method: (body.payment_method ?? '') as PaymentMethod,
    // A voucher is by definition raised when no receipt exists; the column
    // is retained for schema compatibility and always stored as 0.
    receipt_available: 0,
    missing_receipt_reason:
      (body.missing_receipt_reason ?? '')?.toString().trim().slice(0, 500) || null,
    declaration_accepted: body.declaration_accepted ? 1 : 0,
    paid_from_petty_cash: funding === 'petty_cash' ? 1 : 0,
  }
}

/**
 * A petty-cash claim only makes sense from somebody holding a float, and only
 * up to what they hold. Checked when the voucher is actually submitted, not
 * while it is a draft — an employee may well write the voucher up before the
 * top-up has been recorded.
 *
 * The voucher's own amount is excluded from the balance so that editing and
 * resubmitting an already-counted claim does not compare it against itself.
 */
async function assertPettyCashAllowed(
  env: Env,
  employeeId: string,
  amount: number,
  excludeVoucherId: string | null,
): Promise<void> {
  const owner = await env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(employeeId)
    .first<Employee>()
  if (!owner || !parseRights(owner).use_petty_cash) {
    throw new ApiError(
      400,
      'This employee does not hold a petty cash float, so the expense cannot be charged to one.',
    )
  }

  let available = await balanceFor(env, employeeId)
  if (excludeVoucherId) {
    const prior = await env.DB.prepare(
      `SELECT amount, status FROM expense_vouchers
        WHERE id = ? AND paid_from_petty_cash = 1`,
    )
      .bind(excludeVoucherId)
      .first<{ amount: number; status: string }>()
    // Already deducted? Add it back before comparing, or a resubmit of the
    // same claim would look like a second withdrawal.
    if (prior && consumesPettyCash(prior.status as ExpenseStatus)) {
      available = Math.round((available + prior.amount) * 100) / 100
    }
  }

  const check = canSpendFromPettyCash(available, amount)
  if (!check.ok) throw new ApiError(400, check.message!)
}

export async function createVoucher(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const rights = parseRights(user)
  if (!rights.add_expenses && user.role !== 'admin') {
    throw new ApiError(403, 'You do not have permission to create expense vouchers')
  }
  const body = await readJson<VoucherBody>(request)
  const settings = await loadSettings(env)

  // Employees file for themselves; admins may file on anyone's behalf.
  const employeeId =
    user.role === 'admin' && body.employee_id ? body.employee_id : user.id
  const owner = await env.DB.prepare(
    'SELECT id, department_id, manager_id FROM employees WHERE id = ? AND active = 1',
  )
    .bind(employeeId)
    .first<{ id: string; department_id: string | null; manager_id: string | null }>()
  if (!owner) throw new ApiError(400, 'Unknown employee')

  const fields = normalizeBody(body, settings.currency)
  const wantsSubmit = Boolean(body.submit)
  const issues = validateVoucher(
    { ...fields, declaration_accepted: Boolean(fields.declaration_accepted) },
    today(env),
    wantsSubmit,
  )
  if (issues.length) fail(issues)

  if (fields.category_id) {
    const cat = await env.DB.prepare('SELECT id FROM expense_categories WHERE id = ?')
      .bind(fields.category_id)
      .first()
    if (!cat) throw new ApiError(400, 'Unknown expense category')
  }

  // Department defaults to the employee's own; admins may override.
  const departmentId =
    body.department_id !== undefined && user.role === 'admin'
      ? body.department_id
      : owner.department_id

  if (fields.paid_from_petty_cash && wantsSubmit) {
    await assertPettyCashAllowed(env, employeeId, fields.amount, null)
  }

  const workflow = await loadWorkflow(env)
  const now = new Date().toISOString()
  const status: ExpenseStatus = wantsSubmit
    ? statusAfter('submit', workflow, Boolean(owner.manager_id))!
    : 'draft'

  const id = crypto.randomUUID()
  const number = await nextVoucherNumber(env, fields.expense_date.slice(0, 4))

  await env.DB.prepare(
    `INSERT INTO expense_vouchers
       (id, voucher_number, employee_id, department_id, expense_date, submission_date,
        category_id, description, vendor, amount, currency, payment_method,
        receipt_available, missing_receipt_reason, declaration_accepted,
        declaration_text, status, created_by, paid_from_petty_cash, funding_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      number,
      employeeId,
      departmentId,
      fields.expense_date,
      wantsSubmit ? today(env) : null,
      fields.category_id,
      fields.description,
      fields.vendor,
      fields.amount,
      fields.currency,
      fields.payment_method,
      fields.receipt_available,
      fields.missing_receipt_reason,
      fields.declaration_accepted,
      fields.declaration_accepted ? DEFAULT_DECLARATION : null,
      status,
      user.id,
      fields.paid_from_petty_cash,
      fields.funding_source,
    )
    .run()

  await trail(env, id, user.id, 'created', null, null, {
    voucher_number: number,
    amount: fields.amount,
    status,
  })
  await audit(env, user.id, 'create_expense_voucher', id, { voucher_number: number, status })

  if (wantsSubmit) {
    await trail(env, id, user.id, 'submitted', 'status', 'draft', status)
    if (body.request_reimbursement) {
      const fresh = await loadVoucher(env, id)
      await raiseReimbursement(env, fresh, user.id)
    }
    await announceSubmission(env, id, number, employeeId, status, fields.amount, fields.currency, now)
  }

  return json(await env.DB.prepare(`${SELECT_VOUCHER} WHERE v.id = ?`).bind(id).first(), 201)
}

export async function patchVoucher(request: Request, env: Env, id: string): Promise<Response> {
  const user = await requireUser(request, env)
  const voucher = await loadVoucher(env, id)
  const actor = await buildActor(env, user, voucher)
  requireAction('edit', voucher, actor)

  const body = await readJson<VoucherBody>(request)
  const settings = await loadSettings(env)

  const merged = {
    expense_date: body.expense_date ?? voucher.expense_date,
    category_id: body.category_id !== undefined ? body.category_id : voucher.category_id,
    description: body.description ?? voucher.description,
    vendor: body.vendor !== undefined ? body.vendor : voucher.vendor,
    amount: body.amount !== undefined ? body.amount : voucher.amount,
    currency: body.currency ?? voucher.currency,
    payment_method: body.payment_method ?? voucher.payment_method,
    missing_receipt_reason:
      body.missing_receipt_reason !== undefined
        ? body.missing_receipt_reason
        : voucher.missing_receipt_reason,
    declaration_accepted:
      body.declaration_accepted !== undefined
        ? body.declaration_accepted
        : Boolean(voucher.declaration_accepted),
    paid_from_petty_cash:
      body.paid_from_petty_cash !== undefined
        ? body.paid_from_petty_cash
        : Boolean(voucher.paid_from_petty_cash),
    // Bug: this was missing entirely, so normalizeBody's fallback
    // (paid_from_petty_cash ? 'petty_cash' : 'own_pocket') decided funding on
    // every edit — collapsing 'office_cash' and 'company_account' to
    // 'own_pocket' on any resubmit, since that boolean can't tell them apart.
    funding_source: body.funding_source ?? voucher.funding_source,
  }
  const fields = normalizeBody(merged as VoucherBody, settings.currency)
  const wantsSubmit = Boolean(body.submit)
  const issues = validateVoucher(
    {
      ...fields,
      declaration_accepted: Boolean(fields.declaration_accepted),
    },
    today(env),
    wantsSubmit,
  )
  if (issues.length) fail(issues)

  if (fields.category_id) {
    const cat = await env.DB.prepare('SELECT id FROM expense_categories WHERE id = ?')
      .bind(fields.category_id)
      .first()
    if (!cat) throw new ApiError(400, 'Unknown expense category')
  }

  if (fields.paid_from_petty_cash && wantsSubmit) {
    await assertPettyCashAllowed(env, voucher.employee_id, fields.amount, voucher.id)
  }

  const departmentId =
    body.department_id !== undefined && actor.is_admin
      ? body.department_id
      : voucher.department_id

  await env.DB.prepare(
    `UPDATE expense_vouchers SET
       expense_date = ?, category_id = ?, description = ?, vendor = ?, amount = ?,
       currency = ?, payment_method = ?, receipt_available = ?,
       missing_receipt_reason = ?, declaration_accepted = ?, declaration_text = ?,
       paid_from_petty_cash = ?, funding_source = ?, department_id = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      fields.expense_date,
      fields.category_id,
      fields.description,
      fields.vendor,
      fields.amount,
      fields.currency,
      fields.payment_method,
      fields.receipt_available,
      fields.missing_receipt_reason,
      fields.declaration_accepted,
      fields.declaration_accepted ? DEFAULT_DECLARATION : null,
      fields.paid_from_petty_cash,
      fields.funding_source,
      departmentId,
      id,
    )
    .run()

  await trailDiff(
    env,
    id,
    user.id,
    {
      expense_date: voucher.expense_date,
      category_id: voucher.category_id,
      description: voucher.description,
      vendor: voucher.vendor,
      amount: voucher.amount,
      currency: voucher.currency,
      payment_method: voucher.payment_method,
      missing_receipt_reason: voucher.missing_receipt_reason,
      declaration_accepted: voucher.declaration_accepted,
      paid_from_petty_cash: voucher.paid_from_petty_cash,
      funding_source: voucher.funding_source,
      department_id: voucher.department_id,
    },
    { ...fields, department_id: departmentId },
  )
  await audit(env, user.id, 'update_expense_voucher', id)

  if (wantsSubmit) {
    return submitVoucher(request, env, id, user)
  }
  return json(await env.DB.prepare(`${SELECT_VOUCHER} WHERE v.id = ?`).bind(id).first())
}

/**
 * Copy a voucher into a fresh draft. Recurring claims (the same fare each
 * week) are the common case, so everything but the dates carries over.
 *
 * The declaration is deliberately NOT copied: accepting it is a statement
 * about a specific expense, and re-accepting it is the whole point.
 */
export async function duplicateVoucher(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const user = await requireUser(request, env)
  const source = await loadVoucher(env, id)
  const actor = await buildActor(env, user, source)
  if (!(actor.is_admin || (actor.is_owner && actor.can_create))) {
    throw new ApiError(403, 'You cannot duplicate this voucher')
  }

  const newId = crypto.randomUUID()
  const today_ = today(env)
  const number = await nextVoucherNumber(env, today_.slice(0, 4))

  await env.DB.prepare(
    `INSERT INTO expense_vouchers
       (id, voucher_number, employee_id, department_id, expense_date, submission_date,
        category_id, description, vendor, amount, currency, payment_method,
        receipt_available, missing_receipt_reason, declaration_accepted,
        declaration_text, status, created_by, paid_from_petty_cash, funding_source)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, ?, 0, NULL, 'draft', ?, ?, ?)`,
  )
    .bind(
      newId,
      number,
      source.employee_id,
      source.department_id,
      today_,
      source.category_id,
      source.description,
      source.vendor,
      source.amount,
      source.currency,
      source.payment_method,
      source.missing_receipt_reason,
      user.id,
      source.paid_from_petty_cash,
      source.funding_source,
    )
    .run()

  await trail(env, newId, user.id, 'created', null, null, {
    voucher_number: number,
    duplicated_from: source.voucher_number,
  })
  await audit(env, user.id, 'duplicate_expense_voucher', newId, {
    from: source.voucher_number,
    to: number,
  })

  return json(
    await env.DB.prepare(`${SELECT_VOUCHER} WHERE v.id = ?`).bind(newId).first(),
    201,
  )
}

export async function deleteVoucher(request: Request, env: Env, id: string): Promise<Response> {
  const user = await requireUser(request, env)
  const voucher = await loadVoucher(env, id)
  const actor = await buildActor(env, user, voucher)
  requireAction('delete', voucher, actor)

  // Purge stored receipts too, so nothing is orphaned in the bucket. The
  // audit trail deliberately survives (no cascade on expense_audit_logs).
  const { results: files } = await env.DB.prepare(
    'SELECT file_path FROM expense_attachments WHERE voucher_id = ?',
  )
    .bind(id)
    .all<{ file_path: string }>()
  if (env.ATTACHMENTS) {
    for (const f of files) {
      try {
        await env.ATTACHMENTS.delete(f.file_path)
      } catch (e) {
        console.error('attachment delete failed:', e)
      }
    }
  }

  await trail(env, id, user.id, 'deleted', 'status', voucher.status, null)
  await env.DB.prepare('DELETE FROM expense_vouchers WHERE id = ?').bind(id).run()
  await audit(env, user.id, 'delete_expense_voucher', id, {
    voucher_number: voucher.voucher_number,
  })
  return json({ ok: true })
}

// ------------------------------------------------------------- notifications

async function announceSubmission(
  env: Env,
  voucherId: string,
  number: string,
  employeeId: string,
  status: ExpenseStatus,
  amount: number,
  currency: string,
  _now: string,
): Promise<void> {
  const who = await env.DB.prepare('SELECT name, manager_id FROM employees WHERE id = ?')
    .bind(employeeId)
    .first<{ name: string; manager_id: string | null }>()
  const title = `Expense voucher ${number} submitted`
  const bodyText = `${who?.name ?? 'An employee'} submitted ${number} for ${currency}${amount.toFixed(2)}.`

  if (status === 'submitted' && who?.manager_id) {
    await notifyUser(env, {
      employeeId: who.manager_id,
      kind: 'expense_submitted',
      title,
      body: `${bodyText}\n\nIt is waiting for your review.`,
      voucherId,
    })
  } else if (status === 'screening') {
    // No manager step applied, so it goes straight to be screened.
    await notifyUsers(env, await employeesWithRight(env, 'send_for_approval'), {
      kind: 'expense_submitted',
      title,
      body: `${bodyText}\n\nIt is waiting to be screened and sent for approval.`,
      voucherId,
    })
  }
}

// -------------------------------------------------------------- transitions

/**
 * Raise the reimbursement an own-pocket voucher is entitled to.
 *
 * Created pending and linked to the voucher, so a decision on the voucher can
 * reach the claim: rejecting the voucher rejects it too, and the money can
 * never be paid out for an expense that was refused. Only the employee's own
 * money is claimable — every other funding source already came from the
 * organisation.
 *
 * Idempotent: a voucher returned to draft and resubmitted must not accumulate
 * duplicate claims.
 */
async function raiseReimbursement(
  env: Env,
  voucher: ExpenseVoucherRow,
  userId: string,
): Promise<boolean> {
  if (!isReimbursable((voucher.funding_source ?? 'own_pocket') as FundingSource)) return false

  const existing = await env.DB.prepare(
    "SELECT id FROM adjustments WHERE voucher_id = ? AND status != 'rejected'",
  )
    .bind(voucher.id)
    .first<{ id: string }>()
  if (existing) return false

  await env.DB.prepare(
    `INSERT INTO adjustments
       (id, employee_id, month, type, amount, description, status, created_by, voucher_id)
     VALUES (?, ?, ?, 'reimbursement', ?, ?, 'pending', ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      voucher.employee_id,
      voucher.expense_date.slice(0, 7),
      voucher.amount,
      `Expense voucher ${voucher.voucher_number}: ${voucher.description}`.slice(0, 500),
      userId,
      voucher.id,
    )
    .run()
  await trail(env, voucher.id, userId, 'reimbursement_requested', null, null, voucher.amount)
  return true
}

/**
 * A voucher that will not be paid must not leave a live claim behind it.
 * Called when a voucher is rejected; the claim is refused rather than deleted
 * so the trail of what was asked for survives.
 */
async function withdrawReimbursement(
  env: Env,
  voucherId: string,
  userId: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE adjustments SET status = 'rejected', decided_by = ?, decided_at = ?
      WHERE voucher_id = ? AND status IN ('pending', 'awaiting_approval')`,
  )
    .bind(userId, new Date().toISOString(), voucherId)
    .run()
}

export async function submitVoucher(
  request: Request,
  env: Env,
  id: string,
  known?: Employee,
): Promise<Response> {
  const user = known ?? (await requireUser(request, env))
  const voucher = await loadVoucher(env, id)
  const actor = await buildActor(env, user, voucher)
  requireAction('submit', voucher, actor)

  const issues = validateVoucher(
    {
      expense_date: voucher.expense_date,
      description: voucher.description,
      amount: voucher.amount,
      currency: voucher.currency,
      payment_method: voucher.payment_method,
      missing_receipt_reason: voucher.missing_receipt_reason,
      declaration_accepted: Boolean(voucher.declaration_accepted),
    },
    today(env),
    true,
  )
  if (issues.length) fail(issues)

  if (voucher.paid_from_petty_cash) {
    await assertPettyCashAllowed(env, voucher.employee_id, voucher.amount, voucher.id)
  }

  const owner = await env.DB.prepare('SELECT manager_id FROM employees WHERE id = ?')
    .bind(voucher.employee_id)
    .first<{ manager_id: string | null }>()
  const workflow = await loadWorkflow(env)
  const next = statusAfter('submit', workflow, Boolean(owner?.manager_id))!

  await env.DB.prepare(
    "UPDATE expense_vouchers SET status = ?, submission_date = ?, reopened_at = NULL, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(next, today(env), id)
    .run()
  await trail(env, id, user.id, 'submitted', 'status', voucher.status, next)
  await audit(env, user.id, 'submit_expense_voucher', id, { status: next })

  // The dialog shown before an own-pocket voucher is sent asks whether to
  // claim the money back; only an explicit yes raises the claim.
  const body = await readJson<{ request_reimbursement?: boolean }>(request).catch(
    () => ({}) as { request_reimbursement?: boolean },
  )
  if (body.request_reimbursement) {
    await raiseReimbursement(env, voucher, user.id)
  }

  await announceSubmission(
    env,
    id,
    voucher.voucher_number,
    voucher.employee_id,
    next,
    voucher.amount,
    voucher.currency,
    new Date().toISOString(),
  )
  return json(await env.DB.prepare(`${SELECT_VOUCHER} WHERE v.id = ?`).bind(id).first())
}

interface DecisionBody {
  action?: ExpenseAction
  comments?: string
  recorded_reference?: string
}

/**
 * Every review decision funnels through here: manager and finance approve /
 * reject, escalate to approval, record externally, and the administrator
 * reopen override. One place to record the approval row, the audit entry,
 * and the notification.
 */
export async function decideVoucher(request: Request, env: Env, id: string): Promise<Response> {
  const user = await requireUser(request, env)
  const voucher = await loadVoucher(env, id)
  const actor = await buildActor(env, user, voucher)

  const body = await readJson<DecisionBody>(request)
  const action = body.action
  const DECISIONS: ExpenseAction[] = [
    'start_review',
    'manager_approve',
    'manager_reject',
    'request_approval',
    'admin_approve',
    'admin_reject',
    'return',
    'mark_recorded',
    'reopen',
  ]
  if (!action || !DECISIONS.includes(action)) {
    throw new ApiError(400, `action must be one of: ${DECISIONS.join(', ')}`)
  }
  requireAction(action, voucher, actor)

  const comments = (body.comments ?? '').trim().slice(0, 1000) || null
  // A rejection without a reason is not reviewable after the fact.
  if ((action === 'manager_reject' || action === 'admin_reject') && !comments) {
    throw new ApiError(400, 'A comment is required when rejecting a voucher')
  }
  if (action === 'return' && !comments) {
    throw new ApiError(400, 'Say what additional information is needed')
  }

  const owner = await env.DB.prepare('SELECT manager_id FROM employees WHERE id = ?')
    .bind(voucher.employee_id)
    .first<{ manager_id: string | null }>()
  const workflow = await loadWorkflow(env)
  const next = statusAfter(action, workflow, Boolean(owner?.manager_id))
  if (!next) throw new ApiError(400, 'Unsupported action')

  // Which desk the actor was sitting at, for the approval record.
  const role =
    action === 'admin_approve' || action === 'admin_reject' || action === 'reopen'
      ? 'approver'
      : action === 'mark_recorded'
        ? 'recorder'
        : action === 'request_approval'
          ? 'screener'
          : 'manager'

  const now = new Date().toISOString()

  if (action === 'mark_recorded') {
    const reference = (body.recorded_reference ?? '').trim().slice(0, 120) || null
    await env.DB.prepare(
      "UPDATE expense_vouchers SET status = ?, recorded_at = ?, recorded_by = ?, recorded_reference = ?, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(next, now, user.id, reference, id)
      .run()
  } else if (action === 'reopen') {
    await env.DB.prepare(
      "UPDATE expense_vouchers SET status = ?, reopened_at = ?, recorded_at = NULL, recorded_by = NULL, recorded_reference = NULL, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(next, now, id)
      .run()
  } else {
    await env.DB.prepare(
      "UPDATE expense_vouchers SET status = ?, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(next, id)
      .run()
  }

  // 'start_review' is a claim, not a decision — no approval row for it.
  if (action !== 'start_review') {
    const decision =
      action === 'mark_recorded'
        ? 'recorded'
        : action === 'request_approval'
          ? 'escalated'
          : action === 'return' || action === 'reopen'
          ? 'returned'
          : action.endsWith('reject')
            ? 'rejected'
            : 'approved'
    await env.DB.prepare(
      `INSERT INTO expense_approvals (id, voucher_id, approver_id, role, decision, comments)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), id, user.id, role, decision, comments)
      .run()
  }

  await trail(env, id, user.id, action, 'status', voucher.status, next)
  if (comments) await trail(env, id, user.id, `${action}_comment`, 'comments', null, comments)
  await audit(env, user.id, 'decide_expense_voucher', id, { action, status: next })

  // A refused expense must not leave a payable claim behind it.
  if (next === 'rejected') {
    await withdrawReimbursement(env, id, user.id)
  }

  await announceDecision(env, {
    voucherId: id,
    number: voucher.voucher_number,
    ownerId: voucher.employee_id,
    action,
    next,
    comments,
    amount: voucher.amount,
    currency: voucher.currency,
  })

  return json(await env.DB.prepare(`${SELECT_VOUCHER} WHERE v.id = ?`).bind(id).first())
}

async function announceDecision(
  env: Env,
  d: {
    voucherId: string
    number: string
    ownerId: string
    action: ExpenseAction
    next: ExpenseStatus
    comments: string | null
    amount: number
    currency: string
  },
): Promise<void> {
  const money = `${d.currency}${d.amount.toFixed(2)}`
  const tail = d.comments ? `\n\nComment: ${d.comments}` : ''

  switch (d.action) {
    case 'manager_approve':
      // Manager approval hands it to whoever screens before the approver.
      await notifyUsers(env, await employeesWithRight(env, 'send_for_approval'), {
        kind: 'expense_submitted',
        title: `Expense voucher ${d.number} is ready to screen`,
        body: `${d.number} for ${money} passed manager review and is waiting to be sent for approval.${tail}`,
        voucherId: d.voucherId,
      })
      await notifyUser(env, {
        employeeId: d.ownerId,
        kind: 'expense_approved',
        title: `Expense voucher ${d.number} approved by your manager`,
        body: `${d.number} for ${money} passed manager review.${tail}`,
        voucherId: d.voucherId,
      })
      break
    case 'request_approval':
      // Screened and put to the approvers; only they can decide it.
      await notifyUsers(env, await employeesWithRight(env, 'approve_expenses'), {
        kind: 'expense_needs_approval',
        title: `Expense voucher ${d.number} needs your approval`,
        body: `${d.number} for ${money} has been screened and sent for approval.${tail}`,
        voucherId: d.voucherId,
      })
      break
    case 'admin_approve':
      await notifyUser(env, {
        employeeId: d.ownerId,
        kind: 'expense_approved',
        title: `Expense voucher ${d.number} approved`,
        body: `${d.number} for ${money} has been approved.${tail}`,
        voucherId: d.voucherId,
      })
      // It can now be entered into the external accounting records.
      await notifyUsers(env, await employeesWithRight(env, 'record_expenses'), {
        kind: 'expense_ready_to_record',
        title: `Expense voucher ${d.number} approved — ready to record`,
        body: `${d.number} for ${money} was approved and can now be recorded in the external finance records.${tail}`,
        voucherId: d.voucherId,
      })
      break
    case 'mark_recorded':
      await notifyUser(env, {
        employeeId: d.ownerId,
        kind: 'expense_recorded',
        title: `Expense voucher ${d.number} recorded`,
        body: `${d.number} for ${money} has been recorded in the external finance records.${tail}`,
        voucherId: d.voucherId,
      })
      break
    case 'manager_reject':
    case 'admin_reject':
      await notifyUser(env, {
        employeeId: d.ownerId,
        kind: 'expense_rejected',
        title: `Expense voucher ${d.number} rejected`,
        body: `${d.number} for ${money} was rejected.${tail}`,
        voucherId: d.voucherId,
      })
      break
    case 'return':
      await notifyUser(env, {
        employeeId: d.ownerId,
        kind: 'expense_info_required',
        title: `Expense voucher ${d.number} needs more information`,
        body: `${d.number} was returned to your drafts.${tail}`,
        voucherId: d.voucherId,
      })
      break
    case 'reopen':
      await notifyUser(env, {
        employeeId: d.ownerId,
        kind: 'expense_reopened',
        title: `Expense voucher ${d.number} reopened`,
        body: `An administrator reopened ${d.number}; it is editable again.${tail}`,
        voucherId: d.voucherId,
      })
      break
    default:
      break
  }
}

// -------------------------------------------------------------- attachments

function requireBucket(env: Env): R2Bucket {
  if (!env.ATTACHMENTS) {
    throw new ApiError(
      503,
      'Receipt storage is not configured. Add the ATTACHMENTS R2 binding (see README).',
    )
  }
  return env.ATTACHMENTS
}

export async function uploadAttachment(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const user = await requireUser(request, env)
  const voucher = await loadVoucher(env, id)
  const actor = await buildActor(env, user, voucher)
  requireAction('add_attachment', voucher, actor)
  const bucket = requireBucket(env)

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') throw new ApiError(400, 'No file uploaded')

  const fileName = (file.name || 'receipt').slice(0, 200)
  const issues = validateAttachment(fileName, file.type || null, file.size)
  if (issues.length) fail(issues)

  const key = `expenses/${id}/${crypto.randomUUID()}-${fileName.replace(/[^\w.\-]/g, '_')}`
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  })

  const attachmentId = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO expense_attachments (id, voucher_id, file_name, file_path, content_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(attachmentId, id, fileName, key, file.type || null, file.size, user.id)
    .run()

  await trail(env, id, user.id, 'attachment_added', 'attachment', null, fileName)
  await audit(env, user.id, 'add_expense_attachment', id, { file_name: fileName })

  return json(
    await env.DB.prepare('SELECT * FROM expense_attachments WHERE id = ?')
      .bind(attachmentId)
      .first(),
    201,
  )
}

export async function downloadAttachment(
  request: Request,
  env: Env,
  voucherId: string,
  attachmentId: string,
): Promise<Response> {
  const user = await requireUser(request, env)
  const voucher = await loadVoucher(env, voucherId)
  const actor = await buildActor(env, user, voucher)
  const rights = parseRights(user)
  if (
    !(actor.is_admin || actor.is_owner || actor.is_manager_of_owner || rights.record_expenses)
  ) {
    throw new ApiError(403, 'You cannot view this receipt')
  }
  const bucket = requireBucket(env)

  const row = await env.DB.prepare(
    'SELECT * FROM expense_attachments WHERE id = ? AND voucher_id = ?',
  )
    .bind(attachmentId, voucherId)
    .first<ExpenseAttachmentRow>()
  if (!row) throw new ApiError(404, 'Attachment not found')

  const object = await bucket.get(row.file_path)
  if (!object) throw new ApiError(404, 'Stored file is missing')

  return new Response(object.body, {
    headers: {
      'Content-Type': row.content_type ?? 'application/octet-stream',
      // Receipts are viewed inline; the filename is quoted for safety.
      'Content-Disposition': `inline; filename="${row.file_name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}

export async function deleteAttachment(
  request: Request,
  env: Env,
  voucherId: string,
  attachmentId: string,
): Promise<Response> {
  const user = await requireUser(request, env)
  const voucher = await loadVoucher(env, voucherId)
  const actor = await buildActor(env, user, voucher)
  requireAction('remove_attachment', voucher, actor)

  const row = await env.DB.prepare(
    'SELECT * FROM expense_attachments WHERE id = ? AND voucher_id = ?',
  )
    .bind(attachmentId, voucherId)
    .first<ExpenseAttachmentRow>()
  if (!row) throw new ApiError(404, 'Attachment not found')

  if (env.ATTACHMENTS) {
    try {
      await env.ATTACHMENTS.delete(row.file_path)
    } catch (e) {
      console.error('attachment delete failed:', e)
    }
  }
  await env.DB.prepare('DELETE FROM expense_attachments WHERE id = ?').bind(attachmentId).run()

  await trail(env, voucherId, user.id, 'attachment_removed', 'attachment', row.file_name, null)
  await audit(env, user.id, 'remove_expense_attachment', voucherId, {
    file_name: row.file_name,
  })
  return json({ ok: true })
}

// --------------------------------------------------------------- dashboard

export async function expenseDashboard(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const url = new URL(request.url)
  const month = url.searchParams.get('month') ?? today(env).slice(0, 7)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new ApiError(400, 'month must be YYYY-MM')
  }

  const scope = await visibilityClause(env, user)
  const settings = await loadSettings(env)

  // The dashboard covers the trailing 12 months so the category and employee
  // breakdowns are not empty at the start of a month.
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

  const { results } = await env.DB.prepare(
    `SELECT v.id, v.employee_id, emp.name AS employee_name, v.department_id,
            d.name AS department_name, v.category_id, c.name AS category_name,
            v.expense_date, v.amount, v.status
     FROM expense_vouchers v
     JOIN employees emp ON emp.id = v.employee_id
     LEFT JOIN departments d ON d.id = v.department_id
     LEFT JOIN expense_categories c ON c.id = v.category_id
     WHERE v.expense_date >= ? AND v.expense_date <= ?${scope.sql}`,
  )
    .bind(start, end, ...scope.binds)
    .all()

  const rights = parseRights(user)
  return json({
    month,
    currency: settings.currency,
    scope:
      user.role === 'admin' || rights.record_expenses
        ? 'full'
        : rights.review_expenses
          ? 'team'
          : 'own',
    ...summarize(results as never, month),
  })
}

// --------------------------------------------------------------- audit pack

/**
 * Every approved/recorded voucher in a month, each with the approval trail the
 * printed document needs. Filed as one bundle with the month's accounts, so
 * only settled vouchers are included — anything still in flight has no
 * standing as evidence.
 */
export async function expensePack(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const rights = parseRights(user)
  if (user.role !== 'admin' && !rights.record_expenses && !rights.review_expenses) {
    throw new ApiError(403, 'You do not have permission for the audit pack')
  }
  const url = new URL(request.url)
  const month = url.searchParams.get('month') ?? today(env).slice(0, 7)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new ApiError(400, 'month must be YYYY-MM')
  }

  const scope = await visibleEmployeeIds(env, user)
  const clause = scopeClause(scope, 'v.employee_id')
  const settings = await loadSettings(env)

  const { results: vouchers } = await env.DB.prepare(
    `${SELECT_VOUCHER} WHERE v.expense_date LIKE ?
       AND v.status IN ('approved', 'recorded')${clause.sql}
     ORDER BY v.expense_date, v.voucher_number`,
  )
    .bind(`${month}-%`, ...clause.binds)
    .all<ExpenseVoucherRow & { employee_name: string }>()

  // One query for every approval in the pack, rather than one per voucher.
  const ids = vouchers.map((v) => v.id)
  const approvalsByVoucher = new Map<string, unknown[]>()
  if (ids.length) {
    const { results } = await env.DB.prepare(
      `SELECT a.*, e.name AS approver_name
         FROM expense_approvals a
         LEFT JOIN employees e ON e.id = a.approver_id
        WHERE a.voucher_id IN (${ids.map(() => '?').join(',')})
        ORDER BY a.approved_at`,
    )
      .bind(...ids)
      .all<ExpenseApprovalRow & { approver_name: string | null }>()
    for (const a of results) {
      const list = approvalsByVoucher.get(a.voucher_id) ?? []
      list.push(a)
      approvalsByVoucher.set(a.voucher_id, list)
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  return json({
    month,
    currency: settings.currency,
    generated_at: new Date().toISOString(),
    total: round2(vouchers.reduce((s, v) => s + v.amount, 0)),
    count: vouchers.length,
    vouchers: vouchers.map((v) => ({
      ...v,
      approvals: approvalsByVoucher.get(v.id) ?? [],
      attachments: [],
      audit_trail: [],
      possible_duplicates: [],
      actions: [],
    })),
  })
}

// ----------------------------------------------------------------- reports

const REPORT_TYPES = [
  'monthly',
  'department',
  'employee',
  'outstanding',
  'approved_vs_rejected',
] as const

type ReportType = (typeof REPORT_TYPES)[number]

/**
 * Report data as plain rows, so the client can render a table, print it to
 * PDF, or hand the same array to the CSV/Excel writers unchanged.
 */
export async function expenseReport(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const rights = parseRights(user)
  if (user.role !== 'admin' && !rights.record_expenses && !rights.review_expenses) {
    throw new ApiError(403, 'You do not have permission for expense reports')
  }
  const url = new URL(request.url)
  const type = (url.searchParams.get('type') ?? 'monthly') as ReportType
  if (!REPORT_TYPES.includes(type)) {
    throw new ApiError(400, `type must be one of: ${REPORT_TYPES.join(', ')}`)
  }
  const from = url.searchParams.get('from') ?? `${today(env).slice(0, 7)}-01`
  const to = url.searchParams.get('to') ?? today(env)
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    throw new ApiError(400, 'from/to must be YYYY-MM-DD')
  }

  const scope = await visibilityClause(env, user)
  const settings = await loadSettings(env)
  const binds = [from, to, ...scope.binds]
  const base = `FROM expense_vouchers v
     JOIN employees emp ON emp.id = v.employee_id
     LEFT JOIN departments d ON d.id = v.department_id
     LEFT JOIN expense_categories c ON c.id = v.category_id
     WHERE v.expense_date >= ? AND v.expense_date <= ?${scope.sql}`

  let sql: string
  switch (type) {
    case 'monthly':
      sql = `SELECT substr(v.expense_date, 1, 7) AS month,
                    COUNT(*) AS vouchers,
                    SUM(CASE WHEN v.status <> 'rejected' THEN v.amount ELSE 0 END) AS amount,
                    SUM(CASE WHEN v.status = 'recorded' THEN v.amount ELSE 0 END) AS recorded_amount,
                    SUM(CASE WHEN v.status = 'rejected' THEN 1 ELSE 0 END) AS rejected
             ${base} GROUP BY month ORDER BY month`
      break
    case 'department':
      sql = `SELECT COALESCE(d.name, 'No department') AS department,
                    COUNT(*) AS vouchers,
                    SUM(CASE WHEN v.status <> 'rejected' THEN v.amount ELSE 0 END) AS amount,
                    SUM(CASE WHEN v.status = 'recorded' THEN v.amount ELSE 0 END) AS recorded_amount
             ${base} GROUP BY department ORDER BY amount DESC`
      break
    case 'employee':
      sql = `SELECT emp.name AS employee,
                    COALESCE(d.name, '—') AS department,
                    COUNT(*) AS vouchers,
                    SUM(CASE WHEN v.status <> 'rejected' THEN v.amount ELSE 0 END) AS amount,
                    SUM(CASE WHEN v.status = 'recorded' THEN v.amount ELSE 0 END) AS recorded_amount,
                    SUM(CASE WHEN v.status = 'rejected' THEN 1 ELSE 0 END) AS rejected
             ${base} GROUP BY emp.id ORDER BY amount DESC`
      break
    case 'outstanding':
      // Everything still in flight or approved but not yet recorded.
      sql = `SELECT v.voucher_number, v.expense_date, v.submission_date,
                    emp.name AS employee, COALESCE(d.name, '—') AS department,
                    COALESCE(c.name, '—') AS category, v.amount, v.status
             ${base} AND v.status IN ('approved', 'admin_approval', 'finance_review', 'manager_review', 'submitted')
             ORDER BY v.expense_date`
      break
    case 'approved_vs_rejected':
      sql = `SELECT substr(v.expense_date, 1, 7) AS month,
                    SUM(CASE WHEN v.status IN ('approved', 'recorded') THEN 1 ELSE 0 END) AS approved_count,
                    SUM(CASE WHEN v.status IN ('approved', 'recorded') THEN v.amount ELSE 0 END) AS approved_amount,
                    SUM(CASE WHEN v.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
                    SUM(CASE WHEN v.status = 'rejected' THEN v.amount ELSE 0 END) AS rejected_amount
             ${base} GROUP BY month ORDER BY month`
      break
  }

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all()
  return json({ type, from, to, currency: settings.currency, rows: results })
}
