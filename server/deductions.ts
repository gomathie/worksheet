// Point deductions — admin penalty system.
//
// Points are computed on the fly from entries × work-type rates. This module
// records explicit admin-initiated deductions so the monthly report subtracts
// them and every change to an employee's score is auditable.

import type { Employee, Env, PointDeductionRow } from './env'
import { ApiError, json, readJson, todayInTz } from './http'
import { parseRights, requireUser, audit } from './auth'
import { notifyUser } from './notify'
import {
  computePoints,
  type EntryLike,
  type WorkType,
} from '../shared/logic'

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
 * Sum of all deductions for an employee in a given month.
 */
export async function totalDeductionsForMonth(
  env: Env,
  employeeId: string,
  month: string,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM point_deductions
      WHERE employee_id = ? AND month = ? AND decision = 'deducted'`,
  )
    .bind(employeeId, month)
    .first<{ total: number }>()
  return row?.total ?? 0
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

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all<PointDeductionRow & { employee_name: string; admin_name: string }>()

  return json(
    results.map((r) => ({
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
    })),
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
