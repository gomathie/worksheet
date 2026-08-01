// Petty cash floats.
//
// An administrator hands an employee cash; the employee spends it and files
// vouchers marked as paid from the float. What they still hold is derived
// from two sources rather than stored:
//
//   balance = SUM(ledger movements) - SUM(petty-cash vouchers in play)
//
// Deriving it means the figure cannot drift from the vouchers. Rejecting,
// returning, reopening or deleting a voucher automatically puts the money
// back in the float, with no compensating entry to get wrong.

import type { Employee, Env } from './env'
import { ApiError, json, readJson } from './http'
import { audit, parseRights, requireAdmin, requireUser } from './auth'
import { loadSettings } from './settings'
import { notifyUser } from './notify'
import { visibleEmployeeIds } from './scope'
import {
  PETTY_CASH_CONSUMING_STATUSES,
  PETTY_CASH_METHODS,
  PETTY_CASH_METHOD_LABELS,
  PETTY_CASH_MOVEMENTS,
  type PettyCashMethod,
  type PettyCashMovement,
} from '../shared/expenses'

export interface PettyCashLedgerRow {
  id: string
  employee_id: string
  type: PettyCashMovement
  amount: number
  note: string | null
  created_by: string | null
  created_at: string
}

const CONSUMING = PETTY_CASH_CONSUMING_STATUSES.map(() => '?').join(',')

/** The float this employee should still be holding, in currency units. */
export async function balanceFor(env: Env, employeeId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COALESCE(SUM(
           CASE type WHEN 'issue' THEN amount WHEN 'return' THEN -amount ELSE amount END
         ), 0)
          FROM petty_cash_ledger WHERE employee_id = ?1)
       -
       (SELECT COALESCE(SUM(amount), 0)
          FROM expense_vouchers
         WHERE employee_id = ?1
           AND paid_from_petty_cash = 1
           AND status IN (${CONSUMING})) AS balance`,
  )
    .bind(employeeId, ...PETTY_CASH_CONSUMING_STATUSES)
    .first<{ balance: number }>()
  return Math.round((row?.balance ?? 0) * 100) / 100
}

/** Balances for everyone who has ever been issued a float. */
async function allBalances(env: Env, employeeIds: string[] | null) {
  const scope = employeeIds === null ? '' : employeeIds.length
    ? ` AND e.id IN (${employeeIds.map(() => '?').join(',')})`
    : ' AND 1 = 0'
  const { results } = await env.DB.prepare(
    `SELECT e.id AS employee_id, e.name AS employee_name, e.employee_code,
            COALESCE(l.issued, 0) AS issued,
            COALESCE(v.spent, 0) AS spent,
            COALESCE(l.issued, 0) - COALESCE(v.spent, 0) AS balance,
            l.last_issued_at
       FROM employees e
       LEFT JOIN (
         SELECT employee_id,
                SUM(CASE type WHEN 'issue' THEN amount WHEN 'return' THEN -amount ELSE amount END) AS issued,
                MAX(created_at) AS last_issued_at
           FROM petty_cash_ledger GROUP BY employee_id
       ) l ON l.employee_id = e.id
       LEFT JOIN (
         SELECT employee_id, SUM(amount) AS spent
           FROM expense_vouchers
          WHERE paid_from_petty_cash = 1 AND status IN (${CONSUMING})
          GROUP BY employee_id
       ) v ON v.employee_id = e.id
      WHERE (l.employee_id IS NOT NULL OR v.employee_id IS NOT NULL)${scope}
      ORDER BY e.name`,
  )
    .bind(...PETTY_CASH_CONSUMING_STATUSES, ...(employeeIds ?? []))
    .all()
  return results
}

/**
 * The caller's own float, plus — for anyone who can see beyond themselves —
 * everyone else's. Employees always see their own, right or not, so somebody
 * whose right was revoked can still account for cash they are holding.
 */
export async function getPettyCash(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const rights = parseRights(user)
  const settings = await loadSettings(env)

  const [balance, { results: ledger }] = await Promise.all([
    balanceFor(env, user.id),
    env.DB.prepare(
      `SELECT l.*, c.name AS created_by_name
         FROM petty_cash_ledger l
         LEFT JOIN employees c ON c.id = l.created_by
        WHERE l.employee_id = ?
        ORDER BY l.created_at DESC
        LIMIT 100`,
    )
      .bind(user.id)
      .all<PettyCashLedgerRow & { created_by_name: string | null }>(),
  ])

  // Vouchers that have drawn on the float, so the employee can reconcile.
  const { results: spent } = await env.DB.prepare(
    `SELECT id, voucher_number, expense_date, amount, status
       FROM expense_vouchers
      WHERE employee_id = ? AND paid_from_petty_cash = 1
      ORDER BY expense_date DESC
      LIMIT 100`,
  )
    .bind(user.id)
    .all()

  const oversight =
    user.role === 'admin' || rights.finance_expenses || rights.review_expenses
  const holders = oversight
    ? await allBalances(env, await visibleEmployeeIds(env, user))
    : []

  // Own requests always; an administrator additionally sees everyone's
  // outstanding ones, because they are the people who settle them.
  const { results: requests } = await env.DB.prepare(
    user.role === 'admin'
      ? `SELECT r.*, e.name AS employee_name, d.name AS decided_by_name
           FROM petty_cash_requests r
           JOIN employees e ON e.id = r.employee_id
           LEFT JOIN employees d ON d.id = r.decided_by
          WHERE r.status = 'pending' OR r.employee_id = ?
          ORDER BY r.status = 'pending' DESC, r.created_at DESC
          LIMIT 100`
      : `SELECT r.*, e.name AS employee_name, d.name AS decided_by_name
           FROM petty_cash_requests r
           JOIN employees e ON e.id = r.employee_id
           LEFT JOIN employees d ON d.id = r.decided_by
          WHERE r.employee_id = ?
          ORDER BY r.created_at DESC
          LIMIT 50`,
  )
    .bind(user.id)
    .all()

  return json({
    currency: settings.currency,
    can_use: rights.use_petty_cash,
    can_issue: user.role === 'admin',
    balance,
    ledger,
    spent,
    holders,
    requests,
  })
}

interface MovementBody {
  employee_id?: string
  type?: string
  amount?: number
  note?: string
  method?: string
  reference?: string
  request_id?: string
}

/** Cash or mobile money — required whenever money actually changes hands. */
function assertMethod(value: unknown, required: boolean): PettyCashMethod | null {
  const m = String(value ?? '') as PettyCashMethod
  if (!m) {
    if (required) throw new ApiError(400, 'Say whether it was cash or mobile money')
    return null
  }
  if (!PETTY_CASH_METHODS.includes(m)) {
    throw new ApiError(400, `method must be one of: ${PETTY_CASH_METHODS.join(', ')}`)
  }
  return m
}

/** Issue, take back, or correct a float. Administrators only. */
export async function recordPettyCashMovement(
  request: Request,
  env: Env,
): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const body = await readJson<MovementBody>(request)

  const type = body.type as PettyCashMovement
  if (!PETTY_CASH_MOVEMENTS.includes(type)) {
    throw new ApiError(400, `type must be one of: ${PETTY_CASH_MOVEMENTS.join(', ')}`)
  }
  const raw = Number(body.amount)
  if (!Number.isFinite(raw) || raw === 0) {
    throw new ApiError(400, 'amount must be a non-zero number')
  }
  // Issues and returns are magnitudes; only a correction may be negative.
  const amount =
    type === 'adjustment' ? Math.round(raw * 100) / 100 : Math.abs(Math.round(raw * 100) / 100)
  const note = (body.note ?? '').trim().slice(0, 200) || null
  if (type === 'adjustment' && !note) {
    throw new ApiError(400, 'A note is required for an adjustment')
  }

  const employeeId = (body.employee_id ?? '').trim()
  const target = await env.DB.prepare(
    "SELECT * FROM employees WHERE id = ? AND active = 1 AND approval_status = 'approved'",
  )
    .bind(employeeId)
    .first<Employee>()
  if (!target) throw new ApiError(400, 'Unknown employee')
  if (!parseRights(target).use_petty_cash) {
    throw new ApiError(
      400,
      `${target.name} does not hold the petty cash right — grant it in the Employees tab first.`,
    )
  }

  // Handing back more than they hold means the figures are already wrong;
  // say so rather than silently creating a negative float.
  if (type === 'return') {
    const held = await balanceFor(env, employeeId)
    if (Math.round(amount * 100) > Math.round(held * 100)) {
      throw new ApiError(
        400,
        `${target.name} is only holding ${held.toFixed(2)}; record an adjustment instead.`,
      )
    }
  }

  // An adjustment is a correction on paper, so it needs no payment method.
  const method = assertMethod(body.method, type !== 'adjustment')
  const reference = (body.reference ?? '').trim().slice(0, 120) || null

  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO petty_cash_ledger
       (id, employee_id, type, amount, note, created_by, method, reference, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      employeeId,
      type,
      amount,
      note,
      admin.id,
      method,
      reference,
      body.request_id ?? null,
    )
    .run()

  await audit(env, admin.id, `petty_cash_${type}`, employeeId, {
    amount,
    note,
    method,
    reference,
  })

  const balance = await balanceFor(env, employeeId)
  const settings = await loadSettings(env)
  const money = `${settings.currency}${Math.abs(amount).toFixed(2)}`
  await notifyUser(env, {
    employeeId,
    kind: `petty_cash_${type}`,
    title:
      type === 'issue'
        ? `Petty cash issued: ${money}`
        : type === 'return'
          ? `Petty cash returned: ${money}`
          : `Petty cash adjusted: ${money}`,
    body: `${admin.name} recorded a petty cash ${type} of ${money}${
      method ? ` by ${PETTY_CASH_METHOD_LABELS[method]}` : ''
    }${reference ? ` (ref ${reference})` : ''}${
      note ? ` — ${note}` : ''
    }. You are now holding ${settings.currency}${balance.toFixed(2)}.`,
  })

  return json({ ok: true, balance }, 201)
}

// ------------------------------------------------------------- top-up requests

/** A float holder asks for more cash. */
export async function requestPettyCash(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  if (!parseRights(user).use_petty_cash) {
    throw new ApiError(403, 'You do not hold a petty cash float')
  }
  const body = await readJson<{ amount?: number; reason?: string }>(request)
  const amount = Math.round(Number(body.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, 'amount must be greater than zero')
  }
  const reason = (body.reason ?? '').trim().slice(0, 300) || null

  // One open request at a time keeps the admin queue meaningful and stops a
  // holder from stacking duplicates while waiting.
  const open = await env.DB.prepare(
    "SELECT id FROM petty_cash_requests WHERE employee_id = ? AND status = 'pending'",
  )
    .bind(user.id)
    .first()
  if (open) {
    throw new ApiError(400, 'You already have a top-up request waiting for a decision')
  }

  const id = crypto.randomUUID()
  await env.DB.prepare(
    'INSERT INTO petty_cash_requests (id, employee_id, amount, reason) VALUES (?, ?, ?, ?)',
  )
    .bind(id, user.id, amount, reason)
    .run()
  await audit(env, user.id, 'request_petty_cash', id, { amount, reason })

  const settings = await loadSettings(env)
  const { results: admins } = await env.DB.prepare(
    "SELECT id FROM employees WHERE role = 'admin' AND active = 1 AND approval_status = 'approved'",
  ).all<{ id: string }>()
  for (const a of admins) {
    await notifyUser(env, {
      employeeId: a.id,
      kind: 'petty_cash_requested',
      title: `Petty cash requested: ${settings.currency}${amount.toFixed(2)}`,
      body: `${user.name} asked for a petty cash top-up of ${settings.currency}${amount.toFixed(
        2,
      )}${reason ? ` — ${reason}` : ''}. Confirm what you hand over on the Petty Cash tab.`,
    })
  }

  return json({ ok: true, id }, 201)
}

/**
 * Confirm what was actually handed over, or turn the request down.
 *
 * The confirmed amount is entered separately from the requested one — an
 * administrator may well hand over less — and only the confirmed figure
 * reaches the ledger.
 */
export async function decidePettyCashRequest(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const admin = await requireAdmin(request, env)
  const body = await readJson<{
    decision?: string
    amount?: number
    method?: string
    reference?: string
    note?: string
  }>(request)

  const existing = await env.DB.prepare(
    'SELECT * FROM petty_cash_requests WHERE id = ?',
  )
    .bind(id)
    .first<{ id: string; employee_id: string; amount: number; status: string }>()
  if (!existing) throw new ApiError(404, 'Request not found')
  if (existing.status !== 'pending') {
    throw new ApiError(400, 'That request has already been decided')
  }

  const note = (body.note ?? '').trim().slice(0, 300) || null
  const settings = await loadSettings(env)

  if (body.decision === 'rejected') {
    if (!note) throw new ApiError(400, 'A note is required when turning down a request')
    await env.DB.prepare(
      `UPDATE petty_cash_requests
          SET status = 'rejected', decided_by = ?, decided_at = ?, decision_note = ?
        WHERE id = ?`,
    )
      .bind(admin.id, new Date().toISOString(), note, id)
      .run()
    await audit(env, admin.id, 'decide_petty_cash_request', id, { decision: 'rejected', note })
    await notifyUser(env, {
      employeeId: existing.employee_id,
      kind: 'petty_cash_rejected',
      title: 'Petty cash request declined',
      body: `Your request for ${settings.currency}${existing.amount.toFixed(2)} was declined.\n\n${note}`,
    })
    return json({ ok: true, status: 'rejected' })
  }

  if (body.decision !== 'approved') {
    throw new ApiError(400, "decision must be 'approved' or 'rejected'")
  }

  // What was actually handed over — defaults to what was asked for.
  const given =
    body.amount === undefined
      ? existing.amount
      : Math.round(Number(body.amount) * 100) / 100
  if (!Number.isFinite(given) || given <= 0) {
    throw new ApiError(400, 'Confirm the amount actually given')
  }
  const method = assertMethod(body.method, true)
  const reference = (body.reference ?? '').trim().slice(0, 120) || null

  const ledgerId = crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO petty_cash_ledger
         (id, employee_id, type, amount, note, created_by, method, reference, request_id)
       VALUES (?, ?, 'issue', ?, ?, ?, ?, ?, ?)`,
    ).bind(ledgerId, existing.employee_id, given, note, admin.id, method, reference, id),
    env.DB.prepare(
      `UPDATE petty_cash_requests
          SET status = 'approved', decided_by = ?, decided_at = ?, decision_note = ?
        WHERE id = ?`,
    ).bind(admin.id, new Date().toISOString(), note, id),
  ])

  await audit(env, admin.id, 'decide_petty_cash_request', id, {
    decision: 'approved',
    requested: existing.amount,
    given,
    method,
    reference,
  })

  const balance = await balanceFor(env, existing.employee_id)
  const money = `${settings.currency}${given.toFixed(2)}`
  await notifyUser(env, {
    employeeId: existing.employee_id,
    kind: 'petty_cash_issued',
    title: `Petty cash issued: ${money}`,
    body: `${admin.name} confirmed ${money} by ${
      PETTY_CASH_METHOD_LABELS[method!]
    }${reference ? ` (ref ${reference})` : ''}${note ? ` — ${note}` : ''}. You are now holding ${
      settings.currency
    }${balance.toFixed(2)}.`,
  })

  return json({ ok: true, status: 'approved', balance })
}
