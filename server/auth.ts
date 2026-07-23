import type { Employee, Env } from './env'
import { ApiError, getCookie } from './http'

export const SESSION_COOKIE = 'ledger_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
export const CODE_TTL_MINUTES = 10

export function sessionCookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes))
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return n.toString().padStart(6, '0')
}

export async function currentUser(
  request: Request,
  env: Env,
): Promise<Employee | null> {
  const token = getCookie(request, SESSION_COOKIE)
  if (!token) return null
  const raw = await env.SESSIONS.get(`session:${token}`)
  if (!raw) return null
  const { employee_id } = JSON.parse(raw) as { employee_id: string }
  const user = await env.DB.prepare(
    'SELECT * FROM employees WHERE id = ? AND active = 1',
  )
    .bind(employee_id)
    .first<Employee>()
  return user ?? null
}

export async function requireUser(request: Request, env: Env): Promise<Employee> {
  const user = await currentUser(request, env)
  if (!user) throw new ApiError(401, 'Not signed in')
  return user
}

export async function requireAdmin(request: Request, env: Env): Promise<Employee> {
  const user = await requireUser(request, env)
  if (user.role !== 'admin') throw new ApiError(403, 'Admin only')
  return user
}

export async function audit(
  env: Env,
  actorId: string | null,
  action: string,
  targetId: string | null,
  meta: unknown = null,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO audit_log (id, actor_id, action, target_id, meta) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      actorId,
      action,
      targetId,
      meta === null ? null : JSON.stringify(meta),
    )
    .run()
}
