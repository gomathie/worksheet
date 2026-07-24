import type { AdjustmentRow, Employee, EntryRow, Env, PaymentRow } from '../../server/env'
import { ApiError, json, readJson, todayInTz } from '../../server/http'
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  audit,
  currentUser,
  hashPassword,
  parseRights,
  randomToken,
  requireAdmin,
  requireRight,
  requireUser,
  sessionCookie,
  verifyPassword,
  type Rights,
} from '../../server/auth'
import { loadSettings, saveSettings } from '../../server/settings'
import {
  aggregateMonthly,
  computeHours,
  computePoints,
  computeRemuneration,
  parseTime,
} from '../../shared/logic'
import { getCookie } from '../../server/http'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function assertMonth(month: string | null): string {
  if (!month || !MONTH_RE.test(month)) {
    throw new ApiError(400, 'month must be YYYY-MM')
  }
  return month
}

function assertCount(value: unknown, field: string): number {
  const n = Number(value ?? 0)
  if (!Number.isInteger(n) || n < 0) {
    throw new ApiError(400, `${field} must be an integer ≥ 0`)
  }
  return n
}

function validateEntryInput(body: {
  work_date?: string
  time_start?: string
  time_end?: string
}) {
  if (!body.work_date || !DATE_RE.test(body.work_date)) {
    throw new ApiError(400, 'work_date must be YYYY-MM-DD')
  }
  try {
    parseTime(body.time_start ?? '')
    parseTime(body.time_end ?? '')
  } catch {
    throw new ApiError(400, 'time_start/time_end must be HH:MM')
  }
}

// ---------------------------------------------------------------- auth routes

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { username, password } = await readJson<{
    username?: string
    password?: string
  }>(request)
  const normalized = (username ?? '').trim().toLowerCase()
  if (!normalized || !password) {
    throw new ApiError(400, 'username and password are required')
  }

  const employee = await env.DB.prepare(
    'SELECT * FROM employees WHERE lower(username) = ? AND active = 1',
  )
    .bind(normalized)
    .first<Employee>()
  // Uniform error: do not reveal whether the username exists.
  if (
    !employee ||
    !employee.password_hash ||
    !(await verifyPassword(password, employee.password_hash))
  ) {
    throw new ApiError(401, 'Invalid username or password')
  }

  const token = randomToken()
  await env.SESSIONS.put(
    `session:${token}`,
    JSON.stringify({ employee_id: employee.id }),
    { expirationTtl: SESSION_TTL_SECONDS },
  )
  return json(
    { id: employee.id, name: employee.name, role: employee.role },
    200,
    { 'Set-Cookie': sessionCookie(token, SESSION_TTL_SECONDS) },
  )
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const token = getCookie(request, SESSION_COOKIE)
  if (token) await env.SESSIONS.delete(`session:${token}`)
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) })
}

// ----------------------------------------------------------- employee routes

// Never expose password_hash; return rights parsed into an object.
function publicEmployee(e: Employee) {
  return {
    id: e.id,
    name: e.name,
    email: e.email,
    username: e.username,
    role: e.role,
    rights: parseRights(e),
    has_password: e.password_hash ? 1 : 0,
    active: e.active,
    created_at: e.created_at,
  }
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/

function normalizeUsername(value: unknown): string | null {
  const username = String(value ?? '').trim().toLowerCase()
  if (!username) return null
  if (!USERNAME_RE.test(username)) {
    throw new ApiError(
      400,
      'username must be 3-32 chars: letters, digits, dot, dash, underscore',
    )
  }
  return username
}

function assertPassword(value: unknown): string {
  const password = String(value ?? '')
  if (password.length < 8) {
    throw new ApiError(400, 'password must be at least 8 characters')
  }
  return password
}

function rightsToJson(raw: Partial<Rights> | undefined, fallback: Rights): string {
  return JSON.stringify({
    add_entries: Boolean(raw?.add_entries ?? fallback.add_entries),
    edit_entries: Boolean(raw?.edit_entries ?? fallback.edit_entries),
    delete_entries: Boolean(raw?.delete_entries ?? fallback.delete_entries),
    view_dashboard: Boolean(raw?.view_dashboard ?? fallback.view_dashboard),
    view_reports: Boolean(raw?.view_reports ?? fallback.view_reports),
  })
}

interface EmployeeBody {
  name?: string
  email?: string | null
  username?: string | null
  password?: string
  role?: string
  rights?: Partial<Rights>
  active?: number | boolean
}

async function listEmployees(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  if (user.role === 'admin') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM employees ORDER BY name',
    ).all<Employee>()
    return json(results.map(publicEmployee))
  }
  // Employees only need names for display of their own data.
  return json([publicEmployee(user)])
}

async function createEmployee(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const body = await readJson<EmployeeBody>(request)
  const name = (body.name ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase() || null
  const role = body.role === 'admin' ? 'admin' : 'employee'
  if (!name) throw new ApiError(400, 'name is required')

  const username = normalizeUsername(body.username)
  // A password only makes sense with a username; require one when set.
  const passwordHash =
    username !== null && body.password !== undefined && body.password !== ''
      ? await hashPassword(assertPassword(body.password))
      : null
  if (username && !passwordHash) {
    throw new ApiError(400, 'password is required when assigning a username')
  }
  const rights = rightsToJson(body.rights, {
    add_entries: true,
    edit_entries: true,
    delete_entries: true,
    view_dashboard: false,
    view_reports: false,
  })

  const id = crypto.randomUUID()
  try {
    await env.DB.prepare(
      'INSERT INTO employees (id, name, email, username, password_hash, role, rights) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id, name, email, username, passwordHash, role, rights)
      .run()
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      throw new ApiError(409, 'Email or username already in use')
    }
    throw e
  }
  await audit(env, admin.id, 'create_employee', id, { name, email, username, role, rights })
  const created = await env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(id)
    .first<Employee>()
  return json(publicEmployee(created!), 201)
}

async function patchEmployee(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const existing = await env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(id)
    .first<Employee>()
  if (!existing) throw new ApiError(404, 'Employee not found')

  const body = await readJson<EmployeeBody>(request)
  const name = body.name !== undefined ? String(body.name).trim() : existing.name
  if (!name) throw new ApiError(400, 'name cannot be empty')
  const email =
    body.email !== undefined
      ? String(body.email ?? '').trim().toLowerCase() || null
      : existing.email
  const username =
    body.username !== undefined ? normalizeUsername(body.username) : existing.username
  const role =
    body.role !== undefined
      ? body.role === 'admin'
        ? 'admin'
        : 'employee'
      : existing.role
  const active =
    body.active !== undefined ? (body.active ? 1 : 0) : existing.active
  // Empty/absent password means "keep the current one".
  const passwordHash =
    body.password !== undefined && body.password !== ''
      ? await hashPassword(assertPassword(body.password))
      : existing.password_hash
  const rights =
    body.rights !== undefined
      ? rightsToJson(body.rights, parseRights(existing))
      : existing.rights

  // Admins cannot demote or deactivate themselves — avoids locking everyone out.
  if (existing.id === admin.id && (role !== 'admin' || !active)) {
    throw new ApiError(400, 'You cannot demote or deactivate your own account')
  }

  try {
    await env.DB.prepare(
      'UPDATE employees SET name = ?, email = ?, username = ?, password_hash = ?, role = ?, rights = ?, active = ? WHERE id = ?',
    )
      .bind(name, email, username, passwordHash, role, rights, active, id)
      .run()
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      throw new ApiError(409, 'Email or username already in use')
    }
    throw e
  }
  await audit(env, admin.id, 'update_employee', id, {
    name,
    email,
    username,
    role,
    rights,
    active,
    password_changed: passwordHash !== existing.password_hash,
  })
  const updated = await env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(id)
    .first<Employee>()
  return json(publicEmployee(updated!))
}

async function deleteEmployee(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const existing = await env.DB.prepare('SELECT id FROM employees WHERE id = ?')
    .bind(id)
    .first()
  if (!existing) throw new ApiError(404, 'Employee not found')
  if (id === admin.id) {
    throw new ApiError(400, 'You cannot deactivate your own account')
  }
  await env.DB.prepare('UPDATE employees SET active = 0 WHERE id = ?').bind(id).run()
  await audit(env, admin.id, 'delete_employee', id)
  return json({ ok: true })
}

// -------------------------------------------------------------- entry routes

async function listEntries(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const url = new URL(request.url)
  const month = assertMonth(url.searchParams.get('month') ?? currentMonth(env))
  const employeeFilter = url.searchParams.get('employee_id')

  let sql =
    'SELECT e.*, emp.name AS employee_name FROM entries e JOIN employees emp ON emp.id = e.employee_id WHERE e.work_date LIKE ?'
  const binds: unknown[] = [`${month}-%`]
  if (user.role !== 'admin') {
    sql += ' AND e.employee_id = ?'
    binds.push(user.id)
  } else if (employeeFilter) {
    sql += ' AND e.employee_id = ?'
    binds.push(employeeFilter)
  }
  sql += ' ORDER BY e.work_date DESC, e.time_start DESC'

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all<EntryRow & { employee_name: string }>()
  return json(results)
}

interface EntryBody {
  employee_id?: string
  work_date?: string
  time_start?: string
  time_end?: string
  classifications?: number
  qap?: number
  notes?: string | null
}

async function createEntry(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  requireRight(user, 'add_entries')
  const body = await readJson<EntryBody>(request)

  // Employees may only log their own time; admins may log for anyone.
  const employeeId =
    user.role === 'admin' && body.employee_id ? body.employee_id : user.id
  if (employeeId !== user.id) {
    const target = await env.DB.prepare(
      'SELECT id FROM employees WHERE id = ? AND active = 1',
    )
      .bind(employeeId)
      .first()
    if (!target) throw new ApiError(400, 'Unknown employee')
  }

  validateEntryInput(body)
  const classifications = assertCount(body.classifications, 'classifications')
  const qap = assertCount(body.qap, 'qap')
  const hours = computeHours(body.time_start!, body.time_end!)

  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO entries (id, employee_id, work_date, time_start, time_end, hours, classifications, qap, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      employeeId,
      body.work_date,
      body.time_start,
      body.time_end,
      hours,
      classifications,
      qap,
      body.notes?.trim() || null,
    )
    .run()
  await audit(env, user.id, 'create_entry', id, { employee_id: employeeId })
  const created = await env.DB.prepare('SELECT * FROM entries WHERE id = ?')
    .bind(id)
    .first<EntryRow>()
  return json(created, 201)
}

async function loadOwnedEntry(
  request: Request,
  env: Env,
  id: string,
): Promise<{ user: Employee; entry: EntryRow }> {
  const user = await requireUser(request, env)
  const entry = await env.DB.prepare('SELECT * FROM entries WHERE id = ?')
    .bind(id)
    .first<EntryRow>()
  if (!entry) throw new ApiError(404, 'Entry not found')
  if (user.role !== 'admin' && entry.employee_id !== user.id) {
    throw new ApiError(403, 'You can only modify your own entries')
  }
  return { user, entry }
}

async function patchEntry(request: Request, env: Env, id: string): Promise<Response> {
  const { user, entry } = await loadOwnedEntry(request, env, id)
  requireRight(user, 'edit_entries')
  const body = await readJson<EntryBody>(request)

  const next = {
    employee_id:
      user.role === 'admin' && body.employee_id
        ? body.employee_id
        : entry.employee_id,
    work_date: body.work_date ?? entry.work_date,
    time_start: body.time_start ?? entry.time_start,
    time_end: body.time_end ?? entry.time_end,
    classifications:
      body.classifications !== undefined
        ? assertCount(body.classifications, 'classifications')
        : entry.classifications,
    qap: body.qap !== undefined ? assertCount(body.qap, 'qap') : entry.qap,
    notes: body.notes !== undefined ? body.notes?.trim() || null : entry.notes,
  }
  validateEntryInput(next)
  const hours = computeHours(next.time_start, next.time_end)

  await env.DB.prepare(
    `UPDATE entries SET employee_id = ?, work_date = ?, time_start = ?, time_end = ?,
       hours = ?, classifications = ?, qap = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      next.employee_id,
      next.work_date,
      next.time_start,
      next.time_end,
      hours,
      next.classifications,
      next.qap,
      next.notes,
      id,
    )
    .run()
  await audit(env, user.id, 'update_entry', id)
  const updated = await env.DB.prepare('SELECT * FROM entries WHERE id = ?')
    .bind(id)
    .first<EntryRow>()
  return json(updated)
}

async function deleteEntry(request: Request, env: Env, id: string): Promise<Response> {
  const { user } = await loadOwnedEntry(request, env, id)
  requireRight(user, 'delete_entries')
  await env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(id).run()
  await audit(env, user.id, 'delete_entry', id)
  return json({ ok: true })
}

// ------------------------------------------- adjustments & payment routes

function assertAmount(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    throw new ApiError(400, 'amount must be a number > 0')
  }
  return Math.round(n * 100) / 100
}

async function listAdjustments(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const url = new URL(request.url)
  const month = assertMonth(url.searchParams.get('month') ?? currentMonth(env))

  let sql =
    'SELECT a.*, emp.name AS employee_name FROM adjustments a JOIN employees emp ON emp.id = a.employee_id WHERE a.month = ?'
  const binds: unknown[] = [month]
  if (user.role !== 'admin') {
    sql += ' AND a.employee_id = ?'
    binds.push(user.id)
  }
  sql += ' ORDER BY a.created_at DESC'
  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all<AdjustmentRow & { employee_name: string }>()
  return json(results)
}

async function createAdjustment(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const body = await readJson<{
    type?: string
    employee_id?: string
    month?: string
    amount?: number
    description?: string
  }>(request)
  const month = assertMonth(body.month ?? currentMonth(env))
  const amount = assertAmount(body.amount)
  const description = (body.description ?? '').trim().slice(0, 200) || null

  let type: 'bonus' | 'reimbursement'
  let employeeId: string
  let status: 'pending' | 'approved'
  if (body.type === 'bonus') {
    // Bonuses are granted by admins and count immediately.
    if (user.role !== 'admin') throw new ApiError(403, 'Admin only')
    if (!body.employee_id) throw new ApiError(400, 'employee_id is required')
    if (!description) throw new ApiError(400, 'description is required for a bonus')
    type = 'bonus'
    employeeId = body.employee_id
    status = 'approved'
  } else if (body.type === 'reimbursement') {
    // Employees request reimbursements for themselves; admins may enter one
    // for anyone and it is approved on the spot.
    type = 'reimbursement'
    if (user.role === 'admin') {
      employeeId = body.employee_id ?? user.id
      status = 'approved'
    } else {
      employeeId = user.id
      status = 'pending'
    }
  } else {
    throw new ApiError(400, "type must be 'bonus' or 'reimbursement'")
  }

  const target = await env.DB.prepare(
    'SELECT id FROM employees WHERE id = ? AND active = 1',
  )
    .bind(employeeId)
    .first()
  if (!target) throw new ApiError(400, 'Unknown employee')

  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO adjustments (id, employee_id, month, type, amount, description, status, created_by, decided_by, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      employeeId,
      month,
      type,
      amount,
      description,
      status,
      user.id,
      status === 'approved' ? user.id : null,
      status === 'approved' ? new Date().toISOString() : null,
    )
    .run()
  await audit(env, user.id, `create_${type}`, id, { employee_id: employeeId, month, amount, status })
  const created = await env.DB.prepare('SELECT * FROM adjustments WHERE id = ?')
    .bind(id)
    .first<AdjustmentRow>()
  return json(created, 201)
}

async function decideAdjustment(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const existing = await env.DB.prepare('SELECT * FROM adjustments WHERE id = ?')
    .bind(id)
    .first<AdjustmentRow>()
  if (!existing) throw new ApiError(404, 'Adjustment not found')

  const body = await readJson<{ status?: string }>(request)
  if (body.status !== 'approved' && body.status !== 'rejected') {
    throw new ApiError(400, "status must be 'approved' or 'rejected'")
  }
  await env.DB.prepare(
    'UPDATE adjustments SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?',
  )
    .bind(body.status, admin.id, new Date().toISOString(), id)
    .run()
  await audit(env, admin.id, 'decide_adjustment', id, { status: body.status })
  const updated = await env.DB.prepare('SELECT * FROM adjustments WHERE id = ?')
    .bind(id)
    .first<AdjustmentRow>()
  return json(updated)
}

async function deleteAdjustment(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const user = await requireUser(request, env)
  const existing = await env.DB.prepare('SELECT * FROM adjustments WHERE id = ?')
    .bind(id)
    .first<AdjustmentRow>()
  if (!existing) throw new ApiError(404, 'Adjustment not found')
  // Employees may withdraw their own still-pending requests; admins any.
  if (
    user.role !== 'admin' &&
    (existing.employee_id !== user.id || existing.status !== 'pending')
  ) {
    throw new ApiError(403, 'You can only withdraw your own pending requests')
  }
  await env.DB.prepare('DELETE FROM adjustments WHERE id = ?').bind(id).run()
  await audit(env, user.id, 'delete_adjustment', id)
  return json({ ok: true })
}

async function setPaid(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const body = await readJson<{
    employee_id?: string
    month?: string
    paid?: boolean
  }>(request)
  const month = assertMonth(body.month ?? currentMonth(env))
  if (!body.employee_id) throw new ApiError(400, 'employee_id is required')

  if (body.paid) {
    await env.DB.prepare(
      `INSERT INTO payments (employee_id, month, paid_at, paid_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(employee_id, month) DO UPDATE SET paid_at = excluded.paid_at, paid_by = excluded.paid_by`,
    )
      .bind(body.employee_id, month, new Date().toISOString(), admin.id)
      .run()
  } else {
    await env.DB.prepare(
      'UPDATE payments SET paid_at = NULL, paid_by = NULL WHERE employee_id = ? AND month = ?',
    )
      .bind(body.employee_id, month)
      .run()
  }
  await audit(env, admin.id, 'set_paid', body.employee_id, { month, paid: !!body.paid })
  return json({ ok: true })
}

async function confirmReceipt(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const body = await readJson<{ month?: string; confirmed?: boolean }>(request)
  const month = assertMonth(body.month ?? currentMonth(env))

  if (body.confirmed === false) {
    await env.DB.prepare(
      'UPDATE payments SET confirmed_at = NULL WHERE employee_id = ? AND month = ?',
    )
      .bind(user.id, month)
      .run()
  } else {
    await env.DB.prepare(
      `INSERT INTO payments (employee_id, month, confirmed_at) VALUES (?, ?, ?)
       ON CONFLICT(employee_id, month) DO UPDATE SET confirmed_at = excluded.confirmed_at`,
    )
      .bind(user.id, month, new Date().toISOString())
      .run()
  }
  await audit(env, user.id, 'confirm_receipt', user.id, {
    month,
    confirmed: body.confirmed !== false,
  })
  return json({ ok: true })
}

/**
 * The viewer's own pay summary for a month. Available to every signed-in
 * user regardless of dashboard/report rights — it only exposes their own
 * figures.
 */
async function myRemuneration(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const url = new URL(request.url)
  const month = assertMonth(url.searchParams.get('month') ?? currentMonth(env))

  const [settings, entriesRes, adjRes, payment] = await Promise.all([
    loadSettings(env),
    env.DB.prepare(
      'SELECT SUM(classifications) AS classifications, SUM(qap) AS qap, SUM(hours) AS hours FROM entries WHERE employee_id = ? AND work_date LIKE ?',
    )
      .bind(user.id, `${month}-%`)
      .first<{ classifications: number | null; qap: number | null; hours: number | null }>(),
    env.DB.prepare(
      'SELECT * FROM adjustments WHERE employee_id = ? AND month = ? ORDER BY created_at DESC',
    )
      .bind(user.id, month)
      .all<AdjustmentRow>(),
    env.DB.prepare('SELECT * FROM payments WHERE employee_id = ? AND month = ?')
      .bind(user.id, month)
      .first<PaymentRow>(),
  ])

  const classifications = entriesRes?.classifications ?? 0
  const qap = entriesRes?.qap ?? 0
  const points = computePoints(classifications, qap, settings)
  const base = computeRemuneration(points, settings)
  const bonus = adjRes.results
    .filter((a) => a.type === 'bonus' && a.status === 'approved')
    .reduce((s, a) => s + a.amount, 0)
  const reimbursements = adjRes.results
    .filter((a) => a.type === 'reimbursement' && a.status === 'approved')
    .reduce((s, a) => s + a.amount, 0)

  return json({
    month,
    currency: settings.currency,
    hours: entriesRes?.hours ?? 0,
    classifications,
    qap,
    points,
    base,
    bonus: Math.round(bonus * 100) / 100,
    reimbursements: Math.round(reimbursements * 100) / 100,
    total_due: Math.round((base + bonus + reimbursements) * 100) / 100,
    paid_at: payment?.paid_at ?? null,
    confirmed_at: payment?.confirmed_at ?? null,
    adjustments: adjRes.results,
  })
}

// ---------------------------------------------------- settings & report routes

async function getSettings(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const settings = await loadSettings(env)
  // Point rates are money-sensitive; non-admins only get the currency symbol.
  if (user.role !== 'admin') return json({ currency: settings.currency })
  return json(settings)
}

async function putSettings(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const body = await readJson<{
    points_per_classification?: number
    points_per_qap?: number
    point_value?: number
    currency?: string
  }>(request)
  const num = (v: unknown, field: string) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) throw new ApiError(400, `${field} must be a number ≥ 0`)
    return n
  }
  const next = {
    points_per_classification: num(body.points_per_classification, 'points_per_classification'),
    points_per_qap: num(body.points_per_qap, 'points_per_qap'),
    point_value: num(body.point_value, 'point_value'),
    currency: String(body.currency ?? '$').slice(0, 4) || '$',
  }
  await saveSettings(env, next)
  await audit(env, admin.id, 'update_settings', null, next)
  return json(next)
}

async function monthlyReport(request: Request, env: Env): Promise<Response> {
  // Dashboard and Monthly Report both read this endpoint; either right unlocks it.
  const user = await requireUser(request, env)
  const rights = parseRights(user)
  if (!rights.view_dashboard && !rights.view_reports) {
    throw new ApiError(403, 'You do not have permission for this')
  }
  const url = new URL(request.url)
  const month = assertMonth(url.searchParams.get('month') ?? currentMonth(env))

  const [settings, entriesRes, employeesRes, adjRes, payRes] = await Promise.all([
    loadSettings(env),
    env.DB.prepare(
      'SELECT employee_id, work_date, hours, classifications, qap, time_start, time_end, id, notes FROM entries WHERE work_date LIKE ? ORDER BY work_date, time_start',
    )
      .bind(`${month}-%`)
      .all<EntryRow>(),
    env.DB.prepare('SELECT id, name FROM employees').all<{ id: string; name: string }>(),
    env.DB.prepare(
      "SELECT employee_id, type, amount FROM adjustments WHERE month = ? AND status = 'approved'",
    )
      .bind(month)
      .all<{ employee_id: string; type: string; amount: number }>(),
    env.DB.prepare('SELECT * FROM payments WHERE month = ?')
      .bind(month)
      .all<PaymentRow>(),
  ])

  const round2 = (n: number) => Math.round(n * 100) / 100
  const bonusBy = new Map<string, number>()
  const reimbBy = new Map<string, number>()
  for (const a of adjRes.results) {
    const map = a.type === 'bonus' ? bonusBy : reimbBy
    map.set(a.employee_id, round2((map.get(a.employee_id) ?? 0) + a.amount))
  }
  const paymentBy = new Map(payRes.results.map((p) => [p.employee_id, p]))

  const report = aggregateMonthly(
    month,
    entriesRes.results,
    employeesRes.results,
    settings,
  )
  const names = new Map(employeesRes.results.map((e) => [e.id, e.name]))
  const daily_detail = entriesRes.results.map((e) => ({
    date: e.work_date,
    employee_id: e.employee_id,
    employee_name: names.get(e.employee_id) ?? 'Unknown',
    time_start: e.time_start,
    time_end: e.time_end,
    hours: e.hours,
    classifications: e.classifications,
    qap: e.qap,
  }))

  if (user.role === 'admin') {
    const per_person = report.per_person.map((p) => {
      const bonus = bonusBy.get(p.employee_id) ?? 0
      const reimbursements = reimbBy.get(p.employee_id) ?? 0
      const payment = paymentBy.get(p.employee_id)
      return {
        ...p,
        bonus,
        reimbursements,
        total_due: round2(p.remuneration + bonus + reimbursements),
        paid: Boolean(payment?.paid_at),
        confirmed: Boolean(payment?.confirmed_at),
      }
    })
    const bonusTotal = round2(per_person.reduce((s, p) => s + p.bonus, 0))
    const reimbTotal = round2(per_person.reduce((s, p) => s + p.reimbursements, 0))
    return json({
      ...report,
      scope: 'full',
      per_person,
      totals: {
        ...report.totals,
        bonus: bonusTotal,
        reimbursements: reimbTotal,
        total_due: round2(report.totals.remuneration + bonusTotal + reimbTotal),
      },
      settings,
      daily_detail,
    })
  }

  // Non-admins see everyone's work performance but money figures only for
  // themselves: no rates, no points/remuneration of colleagues, no money totals.
  const mine = report.per_person.find((p) => p.employee_id === user.id)
  const myBonus = bonusBy.get(user.id) ?? 0
  const myReimb = reimbBy.get(user.id) ?? 0
  const myPayment = paymentBy.get(user.id)
  return json({
    month: report.month,
    scope: 'limited',
    totals: {
      hours: report.totals.hours,
      classifications: report.totals.classifications,
      qap: report.totals.qap,
      days_worked: report.totals.days_worked,
    },
    per_person: report.per_person.map(
      ({ points: _points, remuneration: _remuneration, ...p }) => p,
    ),
    daily_totals: report.daily_totals,
    settings: { currency: settings.currency },
    daily_detail,
    my_summary: {
      points: mine?.points ?? 0,
      remuneration: mine?.remuneration ?? 0,
      bonus: myBonus,
      reimbursements: myReimb,
      total_due: round2((mine?.remuneration ?? 0) + myBonus + myReimb),
      paid: Boolean(myPayment?.paid_at),
      confirmed: Boolean(myPayment?.confirmed_at),
    },
  })
}

// -------------------------------------------------------------------- router

function currentMonth(env: Env): string {
  return todayInTz(env.TEAM_TZ ?? 'Africa/Accra').slice(0, 7)
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '')
  const method = request.method

  if (path === '/api/auth/login' && method === 'POST') return handleLogin(request, env)
  if (path === '/api/auth/logout' && method === 'POST') return handleLogout(request, env)

  if (path === '/api/me' && method === 'GET') {
    const user = await currentUser(request, env)
    if (!user) return json(null)
    return json({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      rights: parseRights(user),
      today: todayInTz(env.TEAM_TZ ?? 'Africa/Accra'),
    })
  }

  if (path === '/api/employees' && method === 'GET') return listEmployees(request, env)
  if (path === '/api/employees' && method === 'POST') return createEmployee(request, env)
  const empMatch = /^\/api\/employees\/([\w-]+)$/.exec(path)
  if (empMatch) {
    if (method === 'PATCH') return patchEmployee(request, env, empMatch[1])
    if (method === 'DELETE') return deleteEmployee(request, env, empMatch[1])
  }

  if (path === '/api/entries' && method === 'GET') return listEntries(request, env)
  if (path === '/api/entries' && method === 'POST') return createEntry(request, env)
  const entryMatch = /^\/api\/entries\/([\w-]+)$/.exec(path)
  if (entryMatch) {
    if (method === 'PATCH') return patchEntry(request, env, entryMatch[1])
    if (method === 'DELETE') return deleteEntry(request, env, entryMatch[1])
  }

  if (path === '/api/adjustments' && method === 'GET') return listAdjustments(request, env)
  if (path === '/api/adjustments' && method === 'POST') return createAdjustment(request, env)
  const adjMatch = /^\/api\/adjustments\/([\w-]+)$/.exec(path)
  if (adjMatch) {
    if (method === 'PATCH') return decideAdjustment(request, env, adjMatch[1])
    if (method === 'DELETE') return deleteAdjustment(request, env, adjMatch[1])
  }

  if (path === '/api/payments/paid' && method === 'POST') return setPaid(request, env)
  if (path === '/api/payments/confirm' && method === 'POST') {
    return confirmReceipt(request, env)
  }
  if (path === '/api/me/remuneration' && method === 'GET') {
    return myRemuneration(request, env)
  }

  if (path === '/api/settings' && method === 'GET') return getSettings(request, env)
  if (path === '/api/settings' && method === 'PUT') return putSettings(request, env)

  if (path === '/api/reports/monthly' && method === 'GET') {
    return monthlyReport(request, env)
  }

  throw new ApiError(404, 'Not found')
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  try {
    return await route(request, env)
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status)
    console.error(e)
    return json({ error: 'Internal error' }, 500)
  }
}
