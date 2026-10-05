// Point deductions — admin penalty system.
//
// Points are computed on the fly from entries × work-type rates. This module
// records explicit admin-initiated deductions so the monthly report subtracts
// them and every change to an employee's score is auditable.

import type { Employee, Env, PointDeductionRow, TaskViolationRow } from './env'
import { ApiError, json, readJson, todayInTz } from './http'
import { parseRights, requireUser, audit } from './auth'
import { notifyUser } from './notify'
import { loadSettings } from './settings'
import {
  computePoints,
  type EntryLike,
  type WorkType,
} from '../shared/logic'
import {
  TASK_VIOLATION_DAYS,
  TASK_VIOLATION_REPEAT_DAYS,
  isTaskViolationDue,
  type TaskStatus,
} from '../shared/tasks'

// ---------------------------------------------------------------- helpers

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * Compute an employee's earned points for a month from approved entries,
 * using the live (or locked) rates. This mirrors the monthlyReport logic
 * but for a single person.
 */
export async function earnedPointsForMonth(
  env: Env,
  employeeId: string,
  month: string,
): Promise<number> {
  // Load work types and per-employee rate overrides
  const [wtRes, overrideRes] = await Promise.all([
    env.DB.prepare(
      'SELECT id, name, points_per_unit FROM work_types ORDER BY position',
    ).all<WorkType>(),
    env.DB.prepare(
      'SELECT work_type_id, points_per_unit FROM employee_work_types WHERE employee_id = ? AND points_per_unit IS NOT NULL',
    )
      .bind(employeeId)
      .all<{ work_type_id: string; points_per_unit: number }>(),
  ])

  const workTypes = wtRes.results
  const rateOverrides: Record<string, number> = {}
  for (const r of overrideRes.results) rateOverrides[r.work_type_id] = r.points_per_unit

  // Load approved entries for this employee/month
  const { results: entryRows } = await env.DB.prepare(
    `SELECT e.employee_id, e.work_date, e.hours, ei.work_type_id, ei.units
       FROM entries e
       JOIN entry_items ei ON ei.entry_id = e.id
      WHERE e.employee_id = ? AND e.work_date LIKE ? AND e.status = 'approved'`,
  )
    .bind(employeeId, `${month}%`)
    .all<{
      employee_id: string
      work_date: string
      hours: number
      work_type_id: string
      units: number
    }>()

  // Group into EntryLike shapes
  const byEntry = new Map<string, EntryLike>()
  for (const r of entryRows) {
    const key = `${r.employee_id}:${r.work_date}:${r.hours}`
    let el = byEntry.get(key)
    if (!el) {
      el = { employee_id: r.employee_id, work_date: r.work_date, hours: r.hours, units: {} }
      byEntry.set(key, el)
    }
    el.units[r.work_type_id] = (el.units[r.work_type_id] ?? 0) + r.units
  }

  // Sum points
  let total = 0
  for (const entry of byEntry.values()) {
    total += computePoints(entry.units, workTypes, rateOverrides)
  }
  return Math.round(total * 100) / 100
}

/**
 * Sum of all deductions for an employee in a given month — manual
 * (point_deductions) and automatic task-violation penalties (task_violations)
 * combined, since both reduce the same effective balance. The latter query is
 * wrapped so an environment that hasn't run migration 0038 yet (see the
 * resilience pattern used throughout server/tasks.ts) degrades to just the
 * manual total instead of throwing.
 */
export async function totalDeductionsForMonth(
  env: Env,
  employeeId: string,
  month: string,
): Promise<number> {
  const [manual, automatic] = await Promise.all([
    env.DB.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM point_deductions
        WHERE employee_id = ? AND month = ? AND decision = 'deducted'`,
    )
      .bind(employeeId, month)
      .first<{ total: number }>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM task_violations
        WHERE employee_id = ? AND month = ?`,
    )
      .bind(employeeId, month)
      .first<{ total: number }>()
      .catch(() => ({ total: 0 })),
  ])
  return (manual?.total ?? 0) + (automatic?.total ?? 0)
}

/**
 * Effective points balance = earned − deducted.
 */
export async function effectiveBalance(
  env: Env,
  employeeId: string,
  month: string,
): Promise<{ earned: number; deducted: number; balance: number }> {
  const [earned, deducted] = await Promise.all([
    earnedPointsForMonth(env, employeeId, month),
    totalDeductionsForMonth(env, employeeId, month),
  ])
  return { earned, deducted, balance: Math.round((earned - deducted) * 100) / 100 }
}

/**
 * Automatic penalty for a task that has gone too long without being touched
 * (see `isTaskViolationDue` in shared/tasks.ts) — called from
 * server/tasks.ts for every open, assigned task that might be due. No human
 * admin triggers this, so it has no `admin_id`; see
 * migrations/0038_task_violations.sql for why that's a separate table from
 * point_deductions rather than a special-cased row in it.
 *
 * Repeats every `TASK_VIOLATION_REPEAT_DAYS` for as long as the task stays
 * untouched, not just once: each call re-checks the most recent violation
 * already recorded for the task's *current* touch (`violation_at` — the
 * task's `updated_at`, which only changes when someone actually touches the
 * task) and no-ops if the next one isn't due yet. `sequence` (1, 2, 3, ...)
 * numbers how many violations have landed within that one touch; the unique
 * index on (task_id, violation_at, sequence) makes a near-simultaneous
 * duplicate call a harmless no-op, caught below, same as before.
 *
 * Deducts min(configured points, current balance) — never pushes the balance
 * negative — and still records the attempt (possibly for 0 points) so the
 * audit trail shows every violation even when there were no points left to
 * take.
 */
export async function applyTaskViolation(
  env: Env,
  task: { id: string; task_code: string | null; title: string; status: TaskStatus; updated_at: string | null; created_at: string },
  employeeId: string,
): Promise<void> {
  const settings = await loadSettings(env)
  const configured = settings.task_violation_points
  if (!configured || configured <= 0) return // disabled

  const violationAt = task.updated_at || task.created_at
  const last = await env.DB.prepare(
    `SELECT created_at, sequence FROM task_violations
      WHERE task_id = ? AND violation_at = ?
      ORDER BY sequence DESC LIMIT 1`,
  )
    .bind(task.id, violationAt)
    .first<{ created_at: string; sequence: number }>()

  if (!isTaskViolationDue(task, last?.created_at ?? null, Date.now())) return

  const sequence = (last?.sequence ?? 0) + 1
  const tz = env.TEAM_TZ ?? 'Africa/Accra'
  const month = todayInTz(tz).slice(0, 7)

  const bal = await effectiveBalance(env, employeeId, month)
  const amount = Math.max(0, Math.min(configured, bal.balance))
  const newBalance = Math.round((bal.balance - amount) * 100) / 100

  const id = crypto.randomUUID()
  try {
    await env.DB.prepare(
      `INSERT INTO task_violations
         (id, task_id, employee_id, amount, configured_amount, previous_balance, new_balance, month, violation_at, sequence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, task.id, employeeId, amount, configured, bal.balance, newBalance, month, violationAt, sequence)
      .run()
  } catch (e) {
    // Unique constraint on (task_id, violation_at, sequence) — already
    // recorded, most likely a near-simultaneous request.
    if (String(e).includes('UNIQUE')) return
    throw e
  }

  await audit(env, null, 'task_violation', task.id, {
    employee_id: employeeId,
    amount,
    configured_amount: configured,
    previous_balance: bal.balance,
    new_balance: newBalance,
    month,
    sequence,
  })

  const label = task.task_code ? `${task.task_code}: ${task.title}` : task.title
  const window =
    sequence === 1
      ? `${TASK_VIOLATION_DAYS} days`
      : `another ${TASK_VIOLATION_REPEAT_DAYS} days since the last one`
  await notifyUser(env, {
    employeeId,
    kind: 'point_deduction',
    title: amount > 0 ? 'Points Deducted — Task Violation' : 'Task Violation Recorded',
    body:
      amount > 0
        ? `${amount} point${amount !== 1 ? 's' : ''} ${amount !== 1 ? 'have' : 'has'} been deducted because a task went ${window} without being completed or worked on.\n\nTask: ${label}\n\nPrevious balance: ${bal.balance} points\nNew balance: ${newBalance} points`
        : `A task went ${window} without being completed, but your points balance was already at 0 so nothing further was deducted.\n\nTask: ${label}`,
  })
}

// ---------------------------------------------------------------- API handlers

export async function createDeduction(
  request: Request,
  env: Env,
): Promise<Response> {
  const admin = await requireUser(request, env)
  const rights = parseRights(admin)
  if (!rights.manage_point_deductions) {
    throw new ApiError(403, 'You do not have permission to manage point deductions')
  }

  const body = await readJson<{
    employee_id?: string
    amount?: number
    reason?: string
    task_id?: string | null
    warning_ref?: string | null
    month?: string
    decision?: string
    idempotency_key?: string
  }>(request)

  const employeeId = body.employee_id?.trim()
  if (!employeeId) throw new ApiError(400, 'employee_id is required')
  if (employeeId === admin.id) {
    throw new ApiError(400, 'You cannot deduct points from yourself')
  }

  const decision = body.decision ?? 'deducted'
  if (decision !== 'deducted' && decision !== 'let_it_go') {
    throw new ApiError(400, "decision must be 'deducted' or 'let_it_go'")
  }

  const reason = (body.reason ?? '').trim()
  if (!reason) throw new ApiError(400, 'reason is required')

  // Determine the month: default to the current calendar month.
  const tz = env.TEAM_TZ ?? 'Africa/Accra'
  const month = body.month ?? todayInTz(tz).slice(0, 7)
  if (!MONTH_RE.test(month)) throw new ApiError(400, 'month must be YYYY-MM')

  // Validate amount for deductions; for "let it go" amount can be 0.
  const amount = Number(body.amount ?? 0)
  if (decision === 'deducted') {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(400, 'amount must be a positive number')
    }
  }

  // Validate the target employee exists and is active
  const target = await env.DB.prepare(
    "SELECT * FROM employees WHERE id = ? AND active = 1 AND approval_status = 'approved'",
  )
    .bind(employeeId)
    .first<Employee>()
  if (!target) throw new ApiError(404, 'Employee not found or inactive')

  // Calculate current balance
  const bal = await effectiveBalance(env, employeeId, month)

  // For "let it go", record without changing balance
  if (decision === 'let_it_go') {
    const id = crypto.randomUUID()
    await env.DB.prepare(
      `INSERT INTO point_deductions
         (id, employee_id, admin_id, amount, reason, task_id, warning_ref,
          previous_balance, new_balance, month, decision, idempotency_key)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'let_it_go', ?)`,
    )
      .bind(
        id,
        employeeId,
        admin.id,
        reason,
        body.task_id?.trim() || null,
        body.warning_ref?.trim() || null,
        bal.balance,
        bal.balance,
        month,
        body.idempotency_key?.trim() || null,
      )
      .run()

    await audit(env, admin.id, 'let_it_go_points', employeeId, {
      amount: 0,
      reason,
      task_id: body.task_id || null,
      employee_name: target.name,
      balance: bal.balance,
    })

    return json({
      id,
      decision: 'let_it_go',
      previous_balance: bal.balance,
      new_balance: bal.balance,
    })
  }

  // Prevent negative balance
  if (amount > bal.balance) {
    throw new ApiError(
      400,
      `Insufficient balance. Current balance is ${bal.balance} points; cannot deduct ${amount}.`,
    )
  }

  const newBalance = Math.round((bal.balance - amount) * 100) / 100
  const id = crypto.randomUUID()

  // Idempotency: if a key was provided and it already exists, return early
  if (body.idempotency_key) {
    const existing = await env.DB.prepare(
      'SELECT id, previous_balance, new_balance FROM point_deductions WHERE idempotency_key = ?',
    )
      .bind(body.idempotency_key)
      .first<{ id: string; previous_balance: number; new_balance: number }>()
    if (existing) {
      return json({
        id: existing.id,
        decision: 'deducted',
        previous_balance: existing.previous_balance,
        new_balance: existing.new_balance,
        duplicate: true,
      })
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO point_deductions
         (id, employee_id, admin_id, amount, reason, task_id, warning_ref,
          previous_balance, new_balance, month, decision, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'deducted', ?)`,
    )
      .bind(
        id,
        employeeId,
        admin.id,
        amount,
        reason,
        body.task_id?.trim() || null,
        body.warning_ref?.trim() || null,
        bal.balance,
        newBalance,
        month,
        body.idempotency_key?.trim() || null,
      )
      .run()
  } catch (e) {
    // Unique constraint on idempotency_key — duplicate submission
    if (String(e).includes('UNIQUE')) {
      const existing = await env.DB.prepare(
        'SELECT id, previous_balance, new_balance FROM point_deductions WHERE idempotency_key = ?',
      )
        .bind(body.idempotency_key!)
        .first<{ id: string; previous_balance: number; new_balance: number }>()
      return json({
        id: existing!.id,
        decision: 'deducted',
        previous_balance: existing!.previous_balance,
        new_balance: existing!.new_balance,
        duplicate: true,
      })
    }
    throw e
  }

  // Audit trail
  await audit(env, admin.id, 'deduct_points', employeeId, {
    deduction_id: id,
    amount,
    reason,
    task_id: body.task_id || null,
    warning_ref: body.warning_ref || null,
    previous_balance: bal.balance,
    new_balance: newBalance,
    employee_name: target.name,
    month,
  })

  // Notify the affected employee
  await notifyUser(env, {
    employeeId,
    kind: 'point_deduction',
    title: 'Points Deducted',
    body: `${amount} point${amount !== 1 ? 's' : ''} ${amount !== 1 ? 'have' : 'has'} been deducted from your account.\n\nReason: ${reason}\n\nPrevious balance: ${bal.balance} points\nNew balance: ${newBalance} points`,
  })

  return json(
    {
      id,
      decision: 'deducted',
      previous_balance: bal.balance,
      new_balance: newBalance,
    },
    201,
  )
}

export async function listDeductions(
  request: Request,
  env: Env,
): Promise<Response> {
  const user = await requireUser(request, env)
  const rights = parseRights(user)

  // Admins or holders of manage_point_deductions see all; others see their own
  const isPrivileged = rights.manage_point_deductions

  const url = new URL(request.url)
  const month = url.searchParams.get('month') ?? ''
  const employeeId = url.searchParams.get('employee_id') ?? ''

  let sql = `SELECT pd.*, emp.name AS employee_name, adm.name AS admin_name
               FROM point_deductions pd
               JOIN employees emp ON emp.id = pd.employee_id
               JOIN employees adm ON adm.id = pd.admin_id`
  const conditions: string[] = []
  const binds: unknown[] = []

  if (!isPrivileged) {
    // Non-privileged users can only see their own deductions
    conditions.push('pd.employee_id = ?')
    binds.push(user.id)
  } else if (employeeId) {
    conditions.push('pd.employee_id = ?')
    binds.push(employeeId)
  }

  if (month && MONTH_RE.test(month)) {
    conditions.push('pd.month = ?')
    binds.push(month)
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
  sql += ' ORDER BY pd.created_at DESC LIMIT 200'

  // Automatic task-violation penalties (0038) live in a separate table (see
  // applyTaskViolation for why) but belong in the same audit timeline — an
  // admin reviewing deductions shouldn't have to check two screens to see
  // everything that touched someone's balance. Same employee/month filters,
  // applied separately since it's a different table, then merged below.
  let tvSql = `SELECT tv.*, emp.name AS employee_name, t.title AS task_title, t.task_code
                 FROM task_violations tv
                 JOIN employees emp ON emp.id = tv.employee_id
                 LEFT JOIN tasks t ON t.id = tv.task_id`
  const tvConditions: string[] = []
  const tvBinds: unknown[] = []
  if (!isPrivileged) {
    tvConditions.push('tv.employee_id = ?')
    tvBinds.push(user.id)
  } else if (employeeId) {
    tvConditions.push('tv.employee_id = ?')
    tvBinds.push(employeeId)
  }
  if (month && MONTH_RE.test(month)) {
    tvConditions.push('tv.month = ?')
    tvBinds.push(month)
  }
  if (tvConditions.length) tvSql += ' WHERE ' + tvConditions.join(' AND ')
  tvSql += ' ORDER BY tv.created_at DESC LIMIT 200'

  const [{ results }, { results: tvResults }] = await Promise.all([
    env.DB.prepare(sql)
      .bind(...binds)
      .all<PointDeductionRow & { employee_name: string; admin_name: string }>()
      .catch(() => ({ results: [] })),
    env.DB.prepare(tvSql)
      .bind(...tvBinds)
      .all<TaskViolationRow & { employee_name: string; task_title: string | null; task_code: string | null }>()
      .catch(() => ({ results: [] })),
  ])

  const manual = results.map((r) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employee_name,
    admin_id: r.admin_id,
    admin_name: r.admin_name,
    amount: r.amount,
    reason: r.reason,
    task_id: r.task_id,
    warning_ref: r.warning_ref,
    previous_balance: r.previous_balance,
    new_balance: r.new_balance,
    month: r.month,
    decision: r.decision,
    created_at: r.created_at,
  }))

  const automatic = tvResults.map((r) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employee_name,
    admin_id: '',
    admin_name: 'System (task violation)',
    amount: r.amount,
    reason:
      (r.sequence <= 1
        ? `Task not completed within ${TASK_VIOLATION_DAYS} days`
        : `Task still not completed — repeat #${r.sequence}, ${TASK_VIOLATION_REPEAT_DAYS} days since the last one`) +
      `: ${r.task_code ? `${r.task_code}: ` : ''}${r.task_title ?? 'deleted task'}`,
    task_id: r.task_id,
    warning_ref: null,
    previous_balance: r.previous_balance,
    new_balance: r.new_balance,
    month: r.month,
    decision: 'deducted' as const,
    created_at: r.created_at,
  }))

  return json(
    [...manual, ...automatic]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
      .slice(0, 200),
  )
}

export async function getEmployeeBalance(
  request: Request,
  env: Env,
  employeeId: string,
): Promise<Response> {
  const user = await requireUser(request, env)
  const rights = parseRights(user)
  if (!rights.manage_point_deductions && user.id !== employeeId) {
    throw new ApiError(403, 'Permission denied')
  }

  const target = await env.DB.prepare(
    "SELECT id, name FROM employees WHERE id = ? AND active = 1 AND approval_status = 'approved'",
  )
    .bind(employeeId)
    .first<{ id: string; name: string }>()
  if (!target) throw new ApiError(404, 'Employee not found')

  const url = new URL(request.url)
  const tz = env.TEAM_TZ ?? 'Africa/Accra'
  const month = url.searchParams.get('month') ?? todayInTz(tz).slice(0, 7)
  if (!MONTH_RE.test(month)) throw new ApiError(400, 'month must be YYYY-MM')

  const bal = await effectiveBalance(env, employeeId, month)
  return json({
    employee_id: target.id,
    employee_name: target.name,
    month,
    ...bal,
  })
}
