import type {
  AdjustmentRow,
  Employee,
  EntryItemRow,
  EntryRow,
  Env,
  PaymentRow,
  WorkTypeRow,
} from '../../server/env'
import { ApiError, json, readJson, todayInTz } from '../../server/http'
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  audit,
  canSeeOwnPay,
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

// ---------------------------------------------------------- work type routes

async function listWorkTypes(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const { results } = await env.DB.prepare(
    'SELECT * FROM work_types ORDER BY position, created_at',
  ).all<WorkTypeRow>()
  if (user.role === 'admin') return json(results)
  // Rates are money-sensitive; non-admins only need names for forms/labels.
  return json(results.filter((w) => w.active).map((w) => ({ id: w.id, name: w.name })))
}

function assertPointsPerUnit(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new ApiError(400, 'points_per_unit must be a number ≥ 0')
  }
  return n
}

async function createWorkType(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const body = await readJson<{ name?: string; points_per_unit?: number }>(request)
  const name = (body.name ?? '').trim().slice(0, 60)
  if (!name) throw new ApiError(400, 'name is required')
  const rate = assertPointsPerUnit(body.points_per_unit ?? 1)

  const id = crypto.randomUUID()
  await env.DB.prepare(
    'INSERT INTO work_types (id, name, points_per_unit, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM work_types))',
  )
    .bind(id, name, rate)
    .run()
  await audit(env, admin.id, 'create_work_type', id, { name, points_per_unit: rate })
  const created = await env.DB.prepare('SELECT * FROM work_types WHERE id = ?')
    .bind(id)
    .first<WorkTypeRow>()
  return json(created, 201)
}

async function patchWorkType(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const existing = await env.DB.prepare('SELECT * FROM work_types WHERE id = ?')
    .bind(id)
    .first<WorkTypeRow>()
  if (!existing) throw new ApiError(404, 'Work type not found')

  const body = await readJson<{
    name?: string
    points_per_unit?: number
    active?: number | boolean
  }>(request)
  const name =
    body.name !== undefined ? String(body.name).trim().slice(0, 60) : existing.name
  if (!name) throw new ApiError(400, 'name cannot be empty')
  const rate =
    body.points_per_unit !== undefined
      ? assertPointsPerUnit(body.points_per_unit)
      : existing.points_per_unit
  const active = body.active !== undefined ? (body.active ? 1 : 0) : existing.active

  await env.DB.prepare(
    'UPDATE work_types SET name = ?, points_per_unit = ?, active = ? WHERE id = ?',
  )
    .bind(name, rate, active, id)
    .run()
  await audit(env, admin.id, 'update_work_type', id, { name, points_per_unit: rate, active })
  const updated = await env.DB.prepare('SELECT * FROM work_types WHERE id = ?')
    .bind(id)
    .first<WorkTypeRow>()
  return json(updated)
}

// --------------------------------------------- per-employee work assignments

async function assignedTypeIds(env: Env, employeeId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    'SELECT work_type_id FROM employee_work_types WHERE employee_id = ?',
  )
    .bind(employeeId)
    .all<{ work_type_id: string }>()
  return results.map((r) => r.work_type_id)
}

async function setAssignedTypes(
  env: Env,
  employeeId: string,
  ids: string[],
  rateOverrides: Record<string, number | null> = {},
): Promise<void> {
  const { results } = await env.DB.prepare(
    'SELECT id FROM work_types',
  ).all<{ id: string }>()
  const known = new Set(results.map((r) => r.id))
  const unique = [...new Set(ids)]
  for (const id of unique) {
    if (!known.has(id)) throw new ApiError(400, `Unknown work type: ${id}`)
  }
  const rateFor = (id: string): number | null => {
    const raw = rateOverrides[id]
    if (raw === undefined || raw === null || raw === ('' as unknown)) return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) {
      throw new ApiError(400, 'custom rate must be a number ≥ 0')
    }
    return n
  }
  const statements = [
    env.DB.prepare('DELETE FROM employee_work_types WHERE employee_id = ?').bind(
      employeeId,
    ),
    ...unique.map((id) =>
      env.DB.prepare(
        'INSERT INTO employee_work_types (employee_id, work_type_id, points_per_unit) VALUES (?, ?, ?)',
      ).bind(employeeId, id, rateFor(id)),
    ),
  ]
  await env.DB.batch(statements)
}

/** Non-null per-employee rate overrides, keyed by employee then work type. */
async function allRateOverrides(
  env: Env,
): Promise<Map<string, Record<string, number>>> {
  const { results } = await env.DB.prepare(
    'SELECT employee_id, work_type_id, points_per_unit FROM employee_work_types WHERE points_per_unit IS NOT NULL',
  ).all<{ employee_id: string; work_type_id: string; points_per_unit: number }>()
  const map = new Map<string, Record<string, number>>()
  for (const r of results) {
    const rec = map.get(r.employee_id) ?? {}
    rec[r.work_type_id] = r.points_per_unit
    map.set(r.employee_id, rec)
  }
  return map
}

// ----------------------------------------------------------- employee routes

// Never expose password_hash; return rights parsed into an object.
// rate_overrides is admin-facing data (rates are hidden from non-admins).
function publicEmployee(
  e: Employee,
  workTypeIds: string[] = [],
  rateOverrides: Record<string, number> = {},
) {
  return {
    id: e.id,
    name: e.name,
    email: e.email,
    username: e.username,
    role: e.role,
    rights: parseRights(e),
    work_type_ids: workTypeIds,
    rate_overrides: rateOverrides,
    max_entries_per_day: e.max_entries_per_day,
    has_password: e.password_hash ? 1 : 0,
    active: e.active,
    created_at: e.created_at,
  }
}

/** Parse an optional per-day entry limit: null clears it, else an int ≥ 0. */
function normalizeEntryLimit(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) {
    throw new ApiError(400, 'max_entries_per_day must be a whole number ≥ 0')
  }
  return n
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
    view_remuneration: Boolean(raw?.view_remuneration ?? fallback.view_remuneration),
    view_payslip: Boolean(raw?.view_payslip ?? fallback.view_payslip),
  })
}

interface EmployeeBody {
  name?: string
  email?: string | null
  username?: string | null
  password?: string
  role?: string
  rights?: Partial<Rights>
  work_type_ids?: string[]
  rate_overrides?: Record<string, number | null>
  max_entries_per_day?: number | null
  active?: number | boolean
}

async function listEmployees(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  if (user.role === 'admin') {
    const [{ results }, assignments] = await Promise.all([
      env.DB.prepare('SELECT * FROM employees ORDER BY name').all<Employee>(),
      env.DB.prepare('SELECT * FROM employee_work_types').all<{
        employee_id: string
        work_type_id: string
        points_per_unit: number | null
      }>(),
    ])
    const byEmployee = new Map<string, string[]>()
    const overridesByEmployee = new Map<string, Record<string, number>>()
    for (const a of assignments.results) {
      const list = byEmployee.get(a.employee_id) ?? []
      list.push(a.work_type_id)
      byEmployee.set(a.employee_id, list)
      if (a.points_per_unit !== null) {
        const rec = overridesByEmployee.get(a.employee_id) ?? {}
        rec[a.work_type_id] = a.points_per_unit
        overridesByEmployee.set(a.employee_id, rec)
      }
    }
    return json(
      results.map((e) =>
        publicEmployee(e, byEmployee.get(e.id) ?? [], overridesByEmployee.get(e.id) ?? {}),
      ),
    )
  }
  // Employees only need names for display of their own data (no rates).
  return json([publicEmployee(user, await assignedTypeIds(env, user.id))])
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
    view_remuneration: false,
    view_payslip: false,
  })

  const maxPerDay = normalizeEntryLimit(body.max_entries_per_day)

  const id = crypto.randomUUID()
  try {
    await env.DB.prepare(
      'INSERT INTO employees (id, name, email, username, password_hash, role, rights, max_entries_per_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id, name, email, username, passwordHash, role, rights, maxPerDay)
      .run()
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      throw new ApiError(409, 'Email or username already in use')
    }
    throw e
  }
  // Default: new employees may log every active work type unless the admin
  // narrows it down.
  let typeIds: string[]
  if (body.work_type_ids !== undefined) {
    typeIds = body.work_type_ids
  } else {
    const { results } = await env.DB.prepare(
      'SELECT id FROM work_types WHERE active = 1',
    ).all<{ id: string }>()
    typeIds = results.map((r) => r.id)
  }
  await setAssignedTypes(env, id, typeIds, body.rate_overrides ?? {})

  await audit(env, admin.id, 'create_employee', id, {
    name,
    email,
    username,
    role,
    rights,
    work_type_ids: typeIds,
    rate_overrides: body.rate_overrides,
  })
  const created = await env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(id)
    .first<Employee>()
  const savedOverrides: Record<string, number> = {}
  for (const [typeId, rate] of Object.entries(body.rate_overrides ?? {})) {
    if (typeIds.includes(typeId) && rate !== null && rate !== ('' as unknown)) {
      savedOverrides[typeId] = Number(rate)
    }
  }
  return json(publicEmployee(created!, typeIds, savedOverrides), 201)
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
  const maxPerDay =
    body.max_entries_per_day !== undefined
      ? normalizeEntryLimit(body.max_entries_per_day)
      : existing.max_entries_per_day

  // Admins cannot demote or deactivate themselves — avoids locking everyone out.
  if (existing.id === admin.id && (role !== 'admin' || !active)) {
    throw new ApiError(400, 'You cannot demote or deactivate your own account')
  }

  try {
    await env.DB.prepare(
      'UPDATE employees SET name = ?, email = ?, username = ?, password_hash = ?, role = ?, rights = ?, max_entries_per_day = ?, active = ? WHERE id = ?',
    )
      .bind(name, email, username, passwordHash, role, rights, maxPerDay, active, id)
      .run()
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      throw new ApiError(409, 'Email or username already in use')
    }
    throw e
  }
  if (body.work_type_ids !== undefined) {
    await setAssignedTypes(env, id, body.work_type_ids, body.rate_overrides ?? {})
  }

  await audit(env, admin.id, 'update_employee', id, {
    name,
    email,
    username,
    role,
    rights,
    active,
    work_type_ids: body.work_type_ids,
    password_changed: passwordHash !== existing.password_hash,
  })
  const updated = await env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(id)
    .first<Employee>()
  return json(publicEmployee(updated!, await assignedTypeIds(env, id)))
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

async function unitsByEntryId(
  env: Env,
  month: string,
  employeeId?: string,
): Promise<Map<string, Record<string, number>>> {
  let sql =
    'SELECT ei.entry_id, ei.work_type_id, ei.units FROM entry_items ei JOIN entries e ON e.id = ei.entry_id WHERE e.work_date LIKE ?'
  const binds: unknown[] = [`${month}-%`]
  if (employeeId) {
    sql += ' AND e.employee_id = ?'
    binds.push(employeeId)
  }
  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all<EntryItemRow>()
  const map = new Map<string, Record<string, number>>()
  for (const it of results) {
    const units = map.get(it.entry_id) ?? {}
    units[it.work_type_id] = it.units
    map.set(it.entry_id, units)
  }
  return map
}

async function listEntries(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const url = new URL(request.url)
  const month = assertMonth(url.searchParams.get('month') ?? currentMonth(env))
  const employeeFilter = url.searchParams.get('employee_id')

  let sql =
    'SELECT e.*, emp.name AS employee_name FROM entries e JOIN employees emp ON emp.id = e.employee_id WHERE e.work_date LIKE ?'
  const binds: unknown[] = [`${month}-%`]
  const scopeEmployee = user.role !== 'admin' ? user.id : employeeFilter || undefined
  if (scopeEmployee) {
    sql += ' AND e.employee_id = ?'
    binds.push(scopeEmployee)
  }
  sql += ' ORDER BY e.work_date DESC, e.time_start DESC'

  const [{ results }, units] = await Promise.all([
    env.DB.prepare(sql)
      .bind(...binds)
      .all<EntryRow & { employee_name: string }>(),
    unitsByEntryId(env, month, scopeEmployee),
  ])
  return json(results.map((e) => ({ ...e, units: units.get(e.id) ?? {} })))
}

interface EntryBody {
  employee_id?: string
  work_date?: string
  time_start?: string
  time_end?: string
  items?: Record<string, number> // work_type_id -> units
  notes?: string | null
}

/** Validate logged units: integers ≥ 0, only for types assigned to the employee. */
async function normalizeItems(
  env: Env,
  employeeId: string,
  raw: Record<string, number> | undefined,
): Promise<Record<string, number>> {
  const items: Record<string, number> = {}
  if (!raw) return items
  const assigned = new Set(await assignedTypeIds(env, employeeId))
  for (const [typeId, value] of Object.entries(raw)) {
    const units = assertCount(value, 'units')
    if (units === 0) continue
    if (!assigned.has(typeId)) {
      throw new ApiError(
        400,
        'This employee is not assigned that type of work',
      )
    }
    items[typeId] = units
  }
  return items
}

async function writeEntryItems(
  env: Env,
  entryId: string,
  items: Record<string, number>,
): Promise<void> {
  const statements = [
    env.DB.prepare('DELETE FROM entry_items WHERE entry_id = ?').bind(entryId),
    ...Object.entries(items).map(([typeId, units]) =>
      env.DB.prepare(
        'INSERT INTO entry_items (entry_id, work_type_id, units) VALUES (?, ?, ?)',
      ).bind(entryId, typeId, units),
    ),
  ]
  await env.DB.batch(statements)
}

/** An employee's effective per-day entry limit (override else global); 0 = unlimited. */
async function effectiveEntryLimit(env: Env, employee: Employee): Promise<number> {
  if (employee.max_entries_per_day !== null) return employee.max_entries_per_day
  return (await loadSettings(env)).max_entries_per_day
}

/** Throw if `employee` already has their allowed number of entries on `workDate`. */
async function enforceEntryLimit(
  env: Env,
  employee: Employee,
  workDate: string,
  excludeEntryId?: string,
): Promise<void> {
  const limit = await effectiveEntryLimit(env, employee)
  if (limit <= 0) return // unlimited
  let sql = 'SELECT COUNT(*) AS n FROM entries WHERE employee_id = ? AND work_date = ?'
  const binds: unknown[] = [employee.id, workDate]
  if (excludeEntryId) {
    sql += ' AND id != ?'
    binds.push(excludeEntryId)
  }
  const row = await env.DB.prepare(sql)
    .bind(...binds)
    .first<{ n: number }>()
  if ((row?.n ?? 0) >= limit) {
    throw new ApiError(
      429,
      `Daily limit reached: you can log at most ${limit} ${limit === 1 ? 'entry' : 'entries'} per day.`,
    )
  }
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
  // Enforce the per-day entry limit for employees logging their own time.
  // Admins are exempt (they manage/correct entries).
  if (user.role !== 'admin') {
    await enforceEntryLimit(env, user, body.work_date!)
  }
  const items = await normalizeItems(env, employeeId, body.items)
  const hours = computeHours(body.time_start!, body.time_end!)

  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO entries (id, employee_id, work_date, time_start, time_end, hours, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      employeeId,
      body.work_date,
      body.time_start,
      body.time_end,
      hours,
      body.notes?.trim() || null,
    )
    .run()
  await writeEntryItems(env, id, items)
  await audit(env, user.id, 'create_entry', id, { employee_id: employeeId })
  const created = await env.DB.prepare('SELECT * FROM entries WHERE id = ?')
    .bind(id)
    .first<EntryRow>()
  return json({ ...created, units: items }, 201)
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
    notes: body.notes !== undefined ? body.notes?.trim() || null : entry.notes,
  }
  validateEntryInput(next)
  // Moving an entry to a different day counts against that day's limit.
  if (user.role !== 'admin' && next.work_date !== entry.work_date) {
    await enforceEntryLimit(env, user, next.work_date, id)
  }
  const hours = computeHours(next.time_start, next.time_end)

  await env.DB.prepare(
    `UPDATE entries SET employee_id = ?, work_date = ?, time_start = ?, time_end = ?,
       hours = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      next.employee_id,
      next.work_date,
      next.time_start,
      next.time_end,
      hours,
      next.notes,
      id,
    )
    .run()
  if (body.items !== undefined) {
    const items = await normalizeItems(env, next.employee_id, body.items)
    await writeEntryItems(env, id, items)
  }
  await audit(env, user.id, 'update_entry', id)
  const updated = await env.DB.prepare('SELECT * FROM entries WHERE id = ?')
    .bind(id)
    .first<EntryRow>()
  const { results: itemRows } = await env.DB.prepare(
    'SELECT * FROM entry_items WHERE entry_id = ?',
  )
    .bind(id)
    .all<EntryItemRow>()
  const units: Record<string, number> = {}
  for (const it of itemRows) units[it.work_type_id] = it.units
  return json({ ...updated, units })
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

async function changeOwnPassword(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const { current_password, new_password } = await readJson<{
    current_password?: string
    new_password?: string
  }>(request)
  if (
    !user.password_hash ||
    !current_password ||
    !(await verifyPassword(current_password, user.password_hash))
  ) {
    throw new ApiError(401, 'Current password is incorrect')
  }
  const hash = await hashPassword(assertPassword(new_password))
  await env.DB.prepare('UPDATE employees SET password_hash = ? WHERE id = ?')
    .bind(hash, user.id)
    .run()
  await audit(env, user.id, 'change_password', user.id)
  return json({ ok: true })
}

/** Admin-only full-database export for backup/archive. Excludes password hashes. */
async function exportData(request: Request, env: Env): Promise<Response> {
  await requireAdmin(request, env)
  const tables = [
    'settings',
    'work_types',
    'employees',
    'employee_work_types',
    'entries',
    'entry_items',
    'adjustments',
    'payments',
    'audit_log',
  ]
  const data: Record<string, unknown[]> = {}
  for (const t of tables) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${t}`).all<Record<string, unknown>>()
    if (t === 'employees') {
      // Never export credential hashes; keep a flag instead.
      data[t] = results.map(({ password_hash, ...rest }) => ({
        ...rest,
        has_password: password_hash ? 1 : 0,
      }))
    } else {
      data[t] = results
    }
  }
  return json({ exported_at: new Date().toISOString(), version: 1, tables: data })
}

async function listAudit(request: Request, env: Env): Promise<Response> {
  await requireAdmin(request, env)
  const url = new URL(request.url)
  const month = assertMonth(url.searchParams.get('month') ?? currentMonth(env))
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.action, a.target_id, a.meta, a.created_at, emp.name AS actor_name
     FROM audit_log a LEFT JOIN employees emp ON emp.id = a.actor_id
     WHERE a.created_at LIKE ? ORDER BY a.created_at DESC LIMIT 500`,
  )
    .bind(`${month}-%`)
    .all()
  return json(results)
}

/** A single employee's pay summary for a month (used for payslips too). */
async function remunerationFor(env: Env, employee: Employee, month: string) {
  const [settings, hoursRow, unitRows, wtRes, adjRes, payment] = await Promise.all([
    loadSettings(env),
    env.DB.prepare(
      'SELECT SUM(hours) AS hours FROM entries WHERE employee_id = ? AND work_date LIKE ?',
    )
      .bind(employee.id, `${month}-%`)
      .first<{ hours: number | null }>(),
    env.DB.prepare(
      'SELECT ei.work_type_id, SUM(ei.units) AS units FROM entry_items ei JOIN entries e ON e.id = ei.entry_id WHERE e.employee_id = ? AND e.work_date LIKE ? GROUP BY ei.work_type_id',
    )
      .bind(employee.id, `${month}-%`)
      .all<{ work_type_id: string; units: number }>(),
    env.DB.prepare('SELECT id, name, points_per_unit FROM work_types').all<{
      id: string
      name: string
      points_per_unit: number
    }>(),
    env.DB.prepare(
      'SELECT * FROM adjustments WHERE employee_id = ? AND month = ? ORDER BY created_at DESC',
    )
      .bind(employee.id, month)
      .all<AdjustmentRow>(),
    env.DB.prepare('SELECT * FROM payments WHERE employee_id = ? AND month = ?')
      .bind(employee.id, month)
      .first<PaymentRow>(),
  ])

  const units: Record<string, number> = {}
  for (const r of unitRows.results) units[r.work_type_id] = r.units
  const { results: overrideRows } = await env.DB.prepare(
    'SELECT work_type_id, points_per_unit FROM employee_work_types WHERE employee_id = ? AND points_per_unit IS NOT NULL',
  )
    .bind(employee.id)
    .all<{ work_type_id: string; points_per_unit: number }>()
  const overrides: Record<string, number> = {}
  for (const r of overrideRows) overrides[r.work_type_id] = r.points_per_unit
  const points = computePoints(units, wtRes.results, overrides)
  const base = computeRemuneration(points, settings)
  const bonus = adjRes.results
    .filter((a) => a.type === 'bonus' && a.status === 'approved')
    .reduce((s, a) => s + a.amount, 0)
  const reimbursements = adjRes.results
    .filter((a) => a.type === 'reimbursement' && a.status === 'approved')
    .reduce((s, a) => s + a.amount, 0)

  return {
    month,
    employee_id: employee.id,
    employee_name: employee.name,
    currency: settings.currency,
    hours: hoursRow?.hours ?? 0,
    units,
    work_types: wtRes.results.map((w) => ({ id: w.id, name: w.name })),
    points,
    base,
    bonus: Math.round(bonus * 100) / 100,
    reimbursements: Math.round(reimbursements * 100) / 100,
    total_due: Math.round((base + bonus + reimbursements) * 100) / 100,
    paid_at: payment?.paid_at ?? null,
    confirmed_at: payment?.confirmed_at ?? null,
    adjustments: adjRes.results,
  }
}

/**
 * The viewer's own pay summary for a month. Available to every signed-in
 * user regardless of dashboard/report rights — it only exposes their own
 * figures.
 */
async function myRemuneration(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  // Own pay figures back both pay views; either right unlocks the endpoint.
  if (!canSeeOwnPay(parseRights(user))) {
    throw new ApiError(403, 'You do not have permission for this')
  }
  const url = new URL(request.url)
  const month = assertMonth(url.searchParams.get('month') ?? currentMonth(env))
  return json(await remunerationFor(env, user, month))
}

/** Admin-only: any employee's pay summary for a month (for payslips). */
async function employeeRemuneration(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  await requireAdmin(request, env)
  const employee = await env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(id)
    .first<Employee>()
  if (!employee) throw new ApiError(404, 'Employee not found')
  const url = new URL(request.url)
  const month = assertMonth(url.searchParams.get('month') ?? currentMonth(env))
  return json(await remunerationFor(env, employee, month))
}

// --------------------------------------------------------- performance trends

/** The last `n` months (YYYY-MM), oldest first, ending at `endMonth`. */
function lastMonths(endMonth: string, n: number): string[] {
  const [y, m] = endMonth.split('-').map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/**
 * A single employee's month-by-month work output (hours, units) over a
 * window, with points/remuneration only when the viewer may see that
 * employee's money. Non-admins may only request their own trend.
 */
async function trends(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const url = new URL(request.url)
  const targetId = url.searchParams.get('employee_id') || user.id
  if (targetId !== user.id && user.role !== 'admin') {
    throw new ApiError(403, 'You can only view your own trend')
  }
  const n = Math.min(Math.max(Number(url.searchParams.get('months')) || 6, 1), 24)
  const months = lastMonths(currentMonth(env), n)
  const rangeStart = `${months[0]}-01`
  // Exclusive upper bound: first day of the month after the window.
  const [ey, em] = months[months.length - 1].split('-').map(Number)
  const endNext = new Date(Date.UTC(ey, em, 1))
  const rangeEnd = `${endNext.getUTCFullYear()}-${String(endNext.getUTCMonth() + 1).padStart(2, '0')}-01`

  const target = await env.DB.prepare('SELECT id, name FROM employees WHERE id = ?')
    .bind(targetId)
    .first<{ id: string; name: string }>()
  if (!target) throw new ApiError(404, 'Employee not found')

  const [settings, hoursRows, unitRows, wtRes, overrideRows] = await Promise.all([
    loadSettings(env),
    env.DB.prepare(
      'SELECT substr(work_date,1,7) AS m, SUM(hours) AS h FROM entries WHERE employee_id = ? AND work_date >= ? AND work_date < ? GROUP BY m',
    )
      .bind(targetId, rangeStart, rangeEnd)
      .all<{ m: string; h: number }>(),
    env.DB.prepare(
      'SELECT substr(e.work_date,1,7) AS m, ei.work_type_id AS wt, SUM(ei.units) AS u FROM entry_items ei JOIN entries e ON e.id = ei.entry_id WHERE e.employee_id = ? AND e.work_date >= ? AND e.work_date < ? GROUP BY m, wt',
    )
      .bind(targetId, rangeStart, rangeEnd)
      .all<{ m: string; wt: string; u: number }>(),
    env.DB.prepare('SELECT id, name, points_per_unit, active FROM work_types ORDER BY position, created_at')
      .all<{ id: string; name: string; points_per_unit: number; active: number }>(),
    env.DB.prepare(
      'SELECT work_type_id, points_per_unit FROM employee_work_types WHERE employee_id = ? AND points_per_unit IS NOT NULL',
    )
      .bind(targetId)
      .all<{ work_type_id: string; points_per_unit: number }>(),
  ])

  const overrides: Record<string, number> = {}
  for (const r of overrideRows.results) overrides[r.work_type_id] = r.points_per_unit

  const hoursByMonth = new Map(hoursRows.results.map((r) => [r.m, r.h]))
  // month -> { wtId -> units }
  const unitsByMonth = new Map<string, Record<string, number>>()
  const typesWithData = new Set<string>()
  for (const r of unitRows.results) {
    const rec = unitsByMonth.get(r.m) ?? {}
    rec[r.wt] = r.u
    unitsByMonth.set(r.m, rec)
    typesWithData.add(r.wt)
  }

  const workTypes = wtRes.results
    .filter((w) => w.active || typesWithData.has(w.id))
    .map((w) => ({ id: w.id, name: w.name, points_per_unit: w.points_per_unit }))

  const hours = months.map((m) => Math.round((hoursByMonth.get(m) ?? 0) * 100) / 100)
  const units: Record<string, number[]> = {}
  for (const wt of workTypes) {
    units[wt.id] = months.map((m) => unitsByMonth.get(m)?.[wt.id] ?? 0)
  }

  const isAdmin = user.role === 'admin'
  const showMoney =
    isAdmin || (targetId === user.id && canSeeOwnPay(parseRights(user)))

  const base: Record<string, unknown> = {
    employee_id: target.id,
    employee_name: target.name,
    currency: settings.currency,
    months,
    work_types: workTypes.map((w) => ({ id: w.id, name: w.name })),
    hours,
    units,
    show_money: showMoney,
  }
  if (showMoney) {
    const points = months.map((m) =>
      computePoints(unitsByMonth.get(m) ?? {}, workTypes, overrides),
    )
    base.points = points
    base.remuneration = points.map((p) => computeRemuneration(p, settings))
  }
  return json(base)
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
    point_value?: number
    currency?: string
    max_entries_per_day?: number
  }>(request)
  const num = (v: unknown, field: string) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) throw new ApiError(400, `${field} must be a number ≥ 0`)
    return n
  }
  const next = {
    point_value: num(body.point_value, 'point_value'),
    currency: String(body.currency ?? '$').slice(0, 4) || '$',
    max_entries_per_day: Math.floor(num(body.max_entries_per_day ?? 0, 'max_entries_per_day')),
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

  const [settings, entriesRes, employeesRes, adjRes, payRes, wtRes, entryUnits] =
    await Promise.all([
      loadSettings(env),
      env.DB.prepare(
        'SELECT employee_id, work_date, hours, time_start, time_end, id, notes FROM entries WHERE work_date LIKE ? ORDER BY work_date, time_start',
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
      env.DB.prepare('SELECT * FROM work_types ORDER BY position, created_at').all<WorkTypeRow>(),
      unitsByEntryId(env, month),
    ])

  const round2 = (n: number) => Math.round(n * 100) / 100
  const bonusBy = new Map<string, number>()
  const reimbBy = new Map<string, number>()
  for (const a of adjRes.results) {
    const map = a.type === 'bonus' ? bonusBy : reimbBy
    map.set(a.employee_id, round2((map.get(a.employee_id) ?? 0) + a.amount))
  }
  const paymentBy = new Map(payRes.results.map((p) => [p.employee_id, p]))

  const workTypes = wtRes.results.map((w) => ({
    id: w.id,
    name: w.name,
    points_per_unit: w.points_per_unit,
  }))
  const entryLikes = entriesRes.results.map((e) => ({
    employee_id: e.employee_id,
    work_date: e.work_date,
    hours: e.hours,
    units: entryUnits.get(e.id) ?? {},
  }))
  const overrides = await allRateOverrides(env)
  const employeeLikes = employeesRes.results.map((e) => ({
    ...e,
    rate_overrides: overrides.get(e.id),
  }))
  const report = aggregateMonthly(
    month,
    entryLikes,
    employeeLikes,
    workTypes,
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
    units: entryUnits.get(e.id) ?? {},
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
      work_types: wtRes.results,
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
    work_types: wtRes.results.map((w) => ({ id: w.id, name: w.name })),
    totals: {
      hours: report.totals.hours,
      units: report.totals.units,
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
    const { results: myTypes } = await env.DB.prepare(
      'SELECT wt.id, wt.name FROM employee_work_types ewt JOIN work_types wt ON wt.id = ewt.work_type_id WHERE ewt.employee_id = ? AND wt.active = 1 ORDER BY wt.position',
    )
      .bind(user.id)
      .all<{ id: string; name: string }>()
    return json({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      rights: parseRights(user),
      work_types: myTypes,
      // 0 = unlimited; admins are exempt from the per-day cap.
      entry_limit: user.role === 'admin' ? 0 : await effectiveEntryLimit(env, user),
      today: todayInTz(env.TEAM_TZ ?? 'Africa/Accra'),
    })
  }

  if (path === '/api/work-types' && method === 'GET') return listWorkTypes(request, env)
  if (path === '/api/work-types' && method === 'POST') return createWorkType(request, env)
  const wtMatch = /^\/api\/work-types\/([\w-]+)$/.exec(path)
  if (wtMatch && method === 'PATCH') return patchWorkType(request, env, wtMatch[1])

  if (path === '/api/employees' && method === 'GET') return listEmployees(request, env)
  if (path === '/api/employees' && method === 'POST') return createEmployee(request, env)
  const empRemMatch = /^\/api\/employees\/([\w-]+)\/remuneration$/.exec(path)
  if (empRemMatch && method === 'GET') {
    return employeeRemuneration(request, env, empRemMatch[1])
  }
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
  if (path === '/api/me/password' && method === 'POST') {
    return changeOwnPassword(request, env)
  }
  if (path === '/api/audit' && method === 'GET') return listAudit(request, env)
  if (path === '/api/export' && method === 'GET') return exportData(request, env)
  if (path === '/api/trends' && method === 'GET') return trends(request, env)

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
