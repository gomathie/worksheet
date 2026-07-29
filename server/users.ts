// New-user approval.
//
// Anyone holding `add_users` may propose an account. Unless the proposer is
// an administrator, the account lands 'pending': it cannot sign in, and it
// stays invisible to the rest of the app until somebody holding
// `approve_users` approves it.
//
// The privilege-escalation guard lives here: a non-administrator can never
// choose the new account's role, rights, or data scope. Those are set by an
// administrator after approval, so `add_users` can only ever create an
// ordinary employee.

import type { Employee, Env } from './env'
import { ApiError, json, readJson } from './http'
import { audit, parseRights, requireUser } from './auth'
import { notifyUser, notifyUsers } from './notify'

/** Active, approved employees holding a given user-administration right. */
async function usersWithRight(
  env: Env,
  right: 'add_users' | 'approve_users',
): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, role, rights FROM employees WHERE active = 1 AND approval_status = 'approved'",
  ).all<{ id: string; role: string; rights: string }>()
  return results
    .filter((e) => {
      let held = false
      try {
        held = Boolean((JSON.parse(e.rights || '{}') as Record<string, unknown>)[right])
      } catch {
        held = false
      }
      // approve_users is never implied by the admin role, matching
      // approve_expenses; add_users is.
      if (right === 'approve_users') return e.role === 'admin' && held
      return e.role === 'admin' || held
    })
    .map((e) => e.id)
}

function publicPendingUser(e: Employee & { created_by_name?: string | null }) {
  return {
    id: e.id,
    name: e.name,
    email: e.email,
    username: e.username,
    role: e.role,
    department_id: e.department_id,
    manager_id: e.manager_id,
    approval_status: e.approval_status,
    created_by: e.created_by,
    created_by_name: e.created_by_name ?? null,
    approval_note: e.approval_note,
    created_at: e.created_at,
  }
}

/** Everything awaiting a decision, for the Approvals screen. */
export async function listPendingUsers(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const rights = parseRights(user)
  const canApprove = user.role === 'admin' && rights.approve_users

  // Approvers see the whole queue; a proposer sees only what they submitted,
  // so they can track it without gaining visibility into anyone else's.
  let sql = `SELECT e.*, c.name AS created_by_name
             FROM employees e
             LEFT JOIN employees c ON c.id = e.created_by
             WHERE e.approval_status = 'pending'`
  const binds: unknown[] = []
  if (!canApprove) {
    if (!rights.add_users) throw new ApiError(403, 'You do not have permission for this')
    sql += ' AND e.created_by = ?'
    binds.push(user.id)
  }
  sql += ' ORDER BY e.created_at'

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all<Employee & { created_by_name: string | null }>()
  return json(results.map(publicPendingUser))
}

interface ProposeBody {
  name?: string
  email?: string | null
  username?: string | null
  password?: string
  department_id?: string | null
  manager_id?: string | null
}

/**
 * Propose a new account. Called by holders of `add_users` who are not
 * administrators — admins go through the full createEmployee route instead,
 * which can set rights directly.
 */
export async function proposeUser(
  request: Request,
  env: Env,
  helpers: {
    normalizeUsername: (v: unknown) => string | null
    assertPassword: (v: unknown) => string
    hashPassword: (p: string) => Promise<string>
    rightsToJson: (raw: undefined, fallback: ReturnType<typeof parseRights>) => string
    defaultRights: ReturnType<typeof parseRights>
  },
): Promise<Response> {
  const user = await requireUser(request, env)
  const rights = parseRights(user)
  if (!rights.add_users) {
    throw new ApiError(403, 'You do not have permission to add users')
  }

  const body = await readJson<ProposeBody>(request)
  const name = (body.name ?? '').trim()
  if (!name) throw new ApiError(400, 'name is required')
  const email = (body.email ?? '').trim().toLowerCase() || null
  const username = helpers.normalizeUsername(body.username)
  const passwordHash =
    username !== null && body.password
      ? await helpers.hashPassword(helpers.assertPassword(body.password))
      : null
  if (username && !passwordHash) {
    throw new ApiError(400, 'password is required when assigning a username')
  }

  // Optional references are validated loosely — an approver reviews them.
  const departmentId = (body.department_id ?? '') || null
  const managerId = (body.manager_id ?? '') || null

  const id = crypto.randomUUID()
  try {
    await env.DB.prepare(
      `INSERT INTO employees
         (id, name, email, username, password_hash, role, rights, department_id,
          manager_id, data_scope, active, approval_status, created_by)
       VALUES (?, ?, ?, ?, ?, 'employee', ?, ?, ?, 'own', 0, 'pending', ?)`,
    )
      .bind(
        id,
        name,
        email,
        username,
        passwordHash,
        helpers.rightsToJson(undefined, helpers.defaultRights),
        departmentId,
        managerId,
        user.id,
      )
      .run()
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      throw new ApiError(409, 'Email or username already in use')
    }
    throw e
  }

  await audit(env, user.id, 'propose_user', id, { name, email, username })
  await notifyUsers(env, await usersWithRight(env, 'approve_users'), {
    kind: 'user_pending_approval',
    title: `New user ${name} needs approval`,
    body: `${user.name} proposed a new account for ${name}${
      email ? ` (${email})` : ''
    }. They cannot sign in until it is approved.`,
  })

  const created = await env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(id)
    .first<Employee>()
  return json(publicPendingUser(created!), 201)
}

/** Approve or reject a pending account. */
export async function decideUser(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const user = await requireUser(request, env)
  const rights = parseRights(user)
  if (!(user.role === 'admin' && rights.approve_users)) {
    throw new ApiError(403, 'You do not have user approval rights')
  }

  const existing = await env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(id)
    .first<Employee>()
  if (!existing) throw new ApiError(404, 'User not found')
  if (existing.approval_status !== 'pending') {
    throw new ApiError(400, 'That account has already been decided')
  }

  const body = await readJson<{ decision?: string; note?: string }>(request)
  if (body.decision !== 'approved' && body.decision !== 'rejected') {
    throw new ApiError(400, "decision must be 'approved' or 'rejected'")
  }
  const note = (body.note ?? '').trim().slice(0, 500) || null
  if (body.decision === 'rejected' && !note) {
    throw new ApiError(400, 'A note is required when rejecting an account')
  }

  // Approval activates the account; rejection leaves it inactive so the row
  // (and its audit trail) survives without ever granting access.
  await env.DB.prepare(
    `UPDATE employees
        SET approval_status = ?, approved_by = ?, approved_at = ?,
            approval_note = ?, active = ?
      WHERE id = ?`,
  )
    .bind(
      body.decision,
      user.id,
      new Date().toISOString(),
      note,
      body.decision === 'approved' ? 1 : 0,
      id,
    )
    .run()

  await audit(env, user.id, 'decide_user', id, { decision: body.decision, note })

  if (existing.created_by) {
    await notifyUser(env, {
      employeeId: existing.created_by,
      kind: `user_${body.decision}`,
      title: `New user ${existing.name} ${body.decision}`,
      body:
        body.decision === 'approved'
          ? `The account you proposed for ${existing.name} was approved and can now sign in.`
          : `The account you proposed for ${existing.name} was rejected.\n\nNote: ${note}`,
    })
  }
  if (body.decision === 'approved') {
    await notifyUser(env, {
      employeeId: id,
      kind: 'account_approved',
      title: 'Your account has been approved',
      body: `Welcome to Ledger, ${existing.name}. You can now sign in.`,
    })
  }

  const updated = await env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(id)
    .first<Employee>()
  return json(publicPendingUser(updated!))
}
