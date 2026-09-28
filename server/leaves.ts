import type { Env } from './env'
import { ApiError, json } from './http'
import { requireAdmin, requireUser } from './auth'
import { visibleEmployeeIds } from './scope'

export interface LeaveRow {
  id: string
  employee_id: string
  employee_name?: string
  type: string
  start_date: string
  end_date: string
  status: string
  reason: string | null
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

const SELECT_LEAVES = `
  SELECT l.*, e.name AS employee_name
  FROM leaves l
  JOIN employees e ON e.id = l.employee_id
`

export async function listLeaves(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  let sql = `${SELECT_LEAVES} WHERE 1 = 1`
  const binds: any[] = []

  if (user.role !== 'admin') {
    const scopeIds = await visibleEmployeeIds(env, user) || []
    if (scopeIds.length > 0) {
      const placeholders = scopeIds.map(() => '?').join(',')
      sql += ` AND l.employee_id IN (${placeholders})`
      binds.push(...scopeIds)
    } else {
      sql += ` AND 1 = 0`
    }
  }

  sql += ' ORDER BY l.start_date DESC'

  const { results } = await env.DB.prepare(sql).bind(...binds).all<LeaveRow>().catch(() => ({ results: [] }))
  return json(results)
}

export async function createLeave(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const body = (await request.json()) as any

  if (!body.type || !['sick', 'vacation', 'unpaid', 'personal'].includes(body.type)) {
    throw new ApiError(400, 'Invalid leave type')
  }
  if (!body.start_date || !body.end_date) {
    throw new ApiError(400, 'Missing dates')
  }

  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO leaves (id, employee_id, type, start_date, end_date, status, reason)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`
  )
    .bind(
      id,
      user.id,
      body.type,
      body.start_date,
      body.end_date,
      (body.reason || null)?.toString().slice(0, 500) || null
    )
    .run()

  const leave = await env.DB.prepare(`${SELECT_LEAVES} WHERE l.id = ?`).bind(id).first<LeaveRow>()
  return json(leave, 201)
}

export async function updateLeave(request: Request, env: Env, id: string): Promise<Response> {
  const user = await requireAdmin(request, env)
  const body = (await request.json()) as any
  
  if (!['approved', 'rejected'].includes(body.status)) {
    throw new ApiError(400, 'Invalid status')
  }

  await env.DB.prepare(
    `UPDATE leaves 
     SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(body.status, user.id, id)
    .run()

  const leave = await env.DB.prepare(`${SELECT_LEAVES} WHERE l.id = ?`).bind(id).first<LeaveRow>()
  if (!leave) throw new ApiError(404, 'Leave not found')
  return json(leave)
}
