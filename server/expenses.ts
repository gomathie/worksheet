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
import {
  DEFAULT_DECLARATION,
  PAYMENT_METHODS,
  formatVoucherNumber,
  allowedActions,
  statusAfter,
  summarize,
  validateAttachment,
  validateVoucher,
  type ExpenseAction,
  type ExpenseActor,
  type ExpenseStatus,
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
    "SELECT key, value FROM settings WHERE key IN ('expense_require_manager', 'expense_require_finance')",
  ).all<{ key: string; value: string }>()
  const m = new Map(results.map((r) => [r.key, r.value]))
  return {
    require_manager: (m.get('expense_require_manager') ?? '1') === '1',
    require_finance: (m.get('expense_require_finance') ?? '1') === '1',
  }
}

async function saveWorkflow(env: Env, w: WorkflowConfig): Promise<void> {
  const stmt = env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  await env.DB.batch([
    stmt.bind('expense_require_manager', w.require_manager ? '1' : '0'),
    stmt.bind('expense_require_finance', w.require_finance ? '1' : '0'),
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
    can_finance: rights.finance_expenses,
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
  finance_approve: 'approve this voucher as finance',
  finance_reject: 'reject this voucher as finance',
  return: 'return this voucher for more information',
  mark_paid: 'mark this voucher paid',
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
    require_finance: body.require_finance ?? current.require_finance,
  }
  await saveWorkflow(env, next)
  await audit(env, admin.id, 'update_expense_workflow', null, next)
  return json(next)
}

// ------------------------------------------------------------------ listing

const SELECT_VOUCHER = `
  SELECT v.*,
         emp.name  AS employee_name,
         d.name    AS department_name,
         c.name    AS category_name,
         payer.name AS paid_by_name,
         (SELECT COUNT(*) FROM expense_attachments a WHERE a.voucher_id = v.id) AS attachment_count
  FROM expense_vouchers v
  JOIN employees emp ON emp.id = v.employee_id
  LEFT JOIN departments d ON d.id = v.department_id
  LEFT JOIN expense_categories c ON c.id = v.category_id
  LEFT JOIN employees payer ON payer.id = v.paid_by
`

/**
 * Restrict a query to what the caller may see:
 *   admin / finance — everything
 *   reviewer        — their own plus their direct reports'
 *   everyone else   — their own only
 */
async function visibilityClause(
  env: Env,
  user: Employee,
): Promise<{ sql: string; binds: unknown[] }> {
  const rights = parseRights(user)
  if (user.role === 'admin' || rights.finance_expenses) return { sql: '', binds: [] }
  const ids = new Set<string>([user.id])
  if (rights.review_expenses) {
    for (const id of await directReportIds(env, user.id)) ids.add(id)
  }
  const list = [...ids]
  return {
    sql: ` AND v.employee_id IN (${list.map(() => '?').join(',')})`,
    binds: list,
  }
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
  const receipt = p.get('receipt_available')
  if (receipt === '0' || receipt === '1') {
    sql += ' AND v.receipt_available = ?'
    binds.push(Number(receipt))
  }
  const min = p.get('amount_min')
  if (min !== null && min !== '' && Number.isFinite(Number(min))) {
    sql += ' AND v.amount >= ?'
    binds.push(Number(min))
  }
  const max = p.get('amount_max')
  if (max !== null && max !== '' && Number.isFinite(Number(max))) {
    sql += ' AND v.amount <= ?'
    binds.push(Number(max))
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
      .all()
    return json(results)
  }

  if (which === 'finance') {
    if (!rights.finance_expenses && user.role !== 'admin') {
      throw new ApiError(403, 'You do not have permission for this')
    }
    const { results } = await env.DB.prepare(
      `${SELECT_VOUCHER} WHERE v.status IN ('finance_review', 'approved') ORDER BY v.status DESC, v.submission_date, v.created_at`,
    ).all()
    return json(results)
  }

  throw new ApiError(400, "queue must be 'manager' or 'finance'")
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
    actor.is_admin || actor.is_owner || actor.is_manager_of_owner || rights.finance_expenses
  if (!visible) throw new ApiError(403, 'You cannot view this voucher')

  const [approvals, attachments, trailRows] = await Promise.all([
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
  ])

  return json({
    ...voucher,
    approvals: approvals.results,
    attachments: attachments.results,
    audit_trail: trailRows.results,
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
  receipt_available?: boolean
  missing_receipt_reason?: string | null
  declaration_accepted?: boolean
  /** Save and submit in one step. */
  submit?: boolean
}

function normalizeBody(body: VoucherBody, currency: string) {
  return {
    expense_date: (body.expense_date ?? '').trim(),
    category_id: body.category_id || null,
    description: (body.description ?? '').trim().slice(0, 1000),
    vendor: (body.vendor ?? '')?.toString().trim().slice(0, 160) || null,
    amount: Math.round(Number(body.amount ?? 0) * 100) / 100,
    currency: (body.currency ?? currency).toString().trim().slice(0, 4) || currency,
    payment_method: (body.payment_method ?? '') as PaymentMethod,
    receipt_available: body.receipt_available ? 1 : 0,
    missing_receipt_reason:
      (body.missing_receipt_reason ?? '')?.toString().trim().slice(0, 500) || null,
    declaration_accepted: body.declaration_accepted ? 1 : 0,
  }
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
    { ...fields, receipt_available: Boolean(fields.receipt_available), declaration_accepted: Boolean(fields.declaration_accepted) },
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
        declaration_text, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    receipt_available:
      body.receipt_available !== undefined
        ? body.receipt_available
        : Boolean(voucher.receipt_available),
    missing_receipt_reason:
      body.missing_receipt_reason !== undefined
        ? body.missing_receipt_reason
        : voucher.missing_receipt_reason,
    declaration_accepted:
      body.declaration_accepted !== undefined
        ? body.declaration_accepted
        : Boolean(voucher.declaration_accepted),
  }
  const fields = normalizeBody(merged as VoucherBody, settings.currency)
  const wantsSubmit = Boolean(body.submit)
  const issues = validateVoucher(
    {
      ...fields,
      receipt_available: Boolean(fields.receipt_available),
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

  const departmentId =
    body.department_id !== undefined && actor.is_admin
      ? body.department_id
      : voucher.department_id

  await env.DB.prepare(
    `UPDATE expense_vouchers SET
       expense_date = ?, category_id = ?, description = ?, vendor = ?, amount = ?,
       currency = ?, payment_method = ?, receipt_available = ?,
       missing_receipt_reason = ?, declaration_accepted = ?, declaration_text = ?,
       department_id = ?, updated_at = datetime('now')
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
      receipt_available: voucher.receipt_available,
      missing_receipt_reason: voucher.missing_receipt_reason,
      declaration_accepted: voucher.declaration_accepted,
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
  } else if (status === 'finance_review') {
    await notifyUsers(env, await employeesWithRight(env, 'finance_expenses'), {
      kind: 'expense_submitted',
      title,
      body: `${bodyText}\n\nIt is waiting for finance review.`,
      voucherId,
    })
  }
}

// -------------------------------------------------------------- transitions

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
      receipt_available: Boolean(voucher.receipt_available),
      missing_receipt_reason: voucher.missing_receipt_reason,
      declaration_accepted: Boolean(voucher.declaration_accepted),
    },
    today(env),
    true,
  )
  if (issues.length) fail(issues)

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
  paid_reference?: string
}

/**
 * Every review decision funnels through here: manager and finance approve /
 * reject, return-for-information, mark-as-paid, and the administrator
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
    'finance_approve',
    'finance_reject',
    'return',
    'mark_paid',
    'reopen',
  ]
  if (!action || !DECISIONS.includes(action)) {
    throw new ApiError(400, `action must be one of: ${DECISIONS.join(', ')}`)
  }
  requireAction(action, voucher, actor)

  const comments = (body.comments ?? '').trim().slice(0, 1000) || null
  // A rejection without a reason is not reviewable after the fact.
  if ((action === 'manager_reject' || action === 'finance_reject') && !comments) {
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

  const role = actor.is_admin
    ? 'admin'
    : action.startsWith('finance') || action === 'mark_paid'
      ? 'finance'
      : 'manager'

  const now = new Date().toISOString()

  if (action === 'mark_paid') {
    const reference = (body.paid_reference ?? '').trim().slice(0, 120) || null
    await env.DB.prepare(
      "UPDATE expense_vouchers SET status = ?, paid_at = ?, paid_by = ?, paid_reference = ?, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(next, now, user.id, reference, id)
      .run()
  } else if (action === 'reopen') {
    await env.DB.prepare(
      "UPDATE expense_vouchers SET status = ?, reopened_at = ?, paid_at = NULL, paid_by = NULL, paid_reference = NULL, updated_at = datetime('now') WHERE id = ?",
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
      action === 'mark_paid'
        ? 'paid'
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
      if (d.next === 'finance_review') {
        await notifyUsers(env, await employeesWithRight(env, 'finance_expenses'), {
          kind: 'expense_finance_review',
          title: `Expense voucher ${d.number} needs finance review`,
          body: `${d.number} for ${money} was approved by the manager and is waiting for finance.${tail}`,
          voucherId: d.voucherId,
        })
      }
      await notifyUser(env, {
        employeeId: d.ownerId,
        kind: 'expense_approved',
        title: `Expense voucher ${d.number} approved by your manager`,
        body: `${d.number} for ${money} passed manager review.${tail}`,
        voucherId: d.voucherId,
      })
      break
    case 'finance_approve':
      await notifyUser(env, {
        employeeId: d.ownerId,
        kind: 'expense_approved',
        title: `Expense voucher ${d.number} approved`,
        body: `${d.number} for ${money} was approved by finance and is awaiting payment.${tail}`,
        voucherId: d.voucherId,
      })
      break
    case 'manager_reject':
    case 'finance_reject':
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
    case 'mark_paid':
      await notifyUser(env, {
        employeeId: d.ownerId,
        kind: 'expense_paid',
        title: `Expense voucher ${d.number} paid`,
        body: `${d.number} for ${money} has been marked paid by finance.${tail}`,
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

  // A receipt on file means the missing-receipt declaration no longer applies.
  await env.DB.prepare(
    "UPDATE expense_vouchers SET receipt_available = 1, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(id)
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
    !(actor.is_admin || actor.is_owner || actor.is_manager_of_owner || rights.finance_expenses)
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

  const remaining = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM expense_attachments WHERE voucher_id = ?',
  )
    .bind(voucherId)
    .first<{ n: number }>()
  if ((remaining?.n ?? 0) === 0) {
    await env.DB.prepare(
      "UPDATE expense_vouchers SET receipt_available = 0, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(voucherId)
      .run()
  }

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
            v.expense_date, v.amount, v.status, v.receipt_available
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
      user.role === 'admin' || rights.finance_expenses
        ? 'full'
        : rights.review_expenses
          ? 'team'
          : 'own',
    ...summarize(results as never, month),
  })
}

// ----------------------------------------------------------------- reports

const REPORT_TYPES = [
  'monthly',
  'department',
  'employee',
  'missing_receipt',
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
  if (user.role !== 'admin' && !rights.finance_expenses && !rights.review_expenses) {
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
                    SUM(CASE WHEN v.status = 'paid' THEN v.amount ELSE 0 END) AS paid_amount,
                    SUM(CASE WHEN v.receipt_available = 0 THEN 1 ELSE 0 END) AS missing_receipts
             ${base} GROUP BY month ORDER BY month`
      break
    case 'department':
      sql = `SELECT COALESCE(d.name, 'No department') AS department,
                    COUNT(*) AS vouchers,
                    SUM(CASE WHEN v.status <> 'rejected' THEN v.amount ELSE 0 END) AS amount,
                    SUM(CASE WHEN v.status = 'paid' THEN v.amount ELSE 0 END) AS paid_amount
             ${base} GROUP BY department ORDER BY amount DESC`
      break
    case 'employee':
      sql = `SELECT emp.name AS employee,
                    COALESCE(d.name, '—') AS department,
                    COUNT(*) AS vouchers,
                    SUM(CASE WHEN v.status <> 'rejected' THEN v.amount ELSE 0 END) AS amount,
                    SUM(CASE WHEN v.status = 'paid' THEN v.amount ELSE 0 END) AS paid_amount,
                    SUM(CASE WHEN v.receipt_available = 0 THEN 1 ELSE 0 END) AS missing_receipts
             ${base} GROUP BY emp.id ORDER BY amount DESC`
      break
    case 'missing_receipt':
      sql = `SELECT v.voucher_number, v.expense_date, emp.name AS employee,
                    COALESCE(d.name, '—') AS department,
                    COALESCE(c.name, '—') AS category,
                    v.amount, v.status, v.missing_receipt_reason,
                    v.declaration_accepted
             ${base} AND v.receipt_available = 0
             ORDER BY v.expense_date DESC`
      break
    case 'outstanding':
      // Approved but not yet paid — what finance still owes.
      sql = `SELECT v.voucher_number, v.expense_date, v.submission_date,
                    emp.name AS employee, COALESCE(d.name, '—') AS department,
                    COALESCE(c.name, '—') AS category, v.amount, v.status
             ${base} AND v.status IN ('approved', 'finance_review', 'manager_review', 'submitted')
             ORDER BY v.expense_date`
      break
    case 'approved_vs_rejected':
      sql = `SELECT substr(v.expense_date, 1, 7) AS month,
                    SUM(CASE WHEN v.status IN ('approved', 'paid') THEN 1 ELSE 0 END) AS approved_count,
                    SUM(CASE WHEN v.status IN ('approved', 'paid') THEN v.amount ELSE 0 END) AS approved_amount,
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
