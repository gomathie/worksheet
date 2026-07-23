import type { Employee, Env } from './env'
import { ApiError, getCookie } from './http'

export const SESSION_COOKIE = 'ledger_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

export function sessionCookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes))
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ------------------------------------------------------------------ passwords

const PBKDF2_ITERATIONS = 100_000

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

function toHex(buf: Uint8Array): string {
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, iterStr, saltHex, hashHex] = stored.split('$')
  const iterations = Number(iterStr)
  if (scheme !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 1) {
    return false
  }
  const hash = await pbkdf2(password, fromHex(saltHex), iterations)
  const expected = fromHex(hashHex)
  if (hash.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i]
  return diff === 0
}

// -------------------------------------------------------------------- rights

export interface Rights {
  edit_entries: boolean
  view_dashboard: boolean
  view_reports: boolean
}

export const DEFAULT_RIGHTS: Rights = {
  edit_entries: true,
  view_dashboard: false,
  view_reports: false,
}

const ALL_RIGHTS: Rights = {
  edit_entries: true,
  view_dashboard: true,
  view_reports: true,
}

export function parseRights(employee: Employee): Rights {
  if (employee.role === 'admin') return { ...ALL_RIGHTS }
  try {
    const raw = JSON.parse(employee.rights || '{}') as Partial<Rights>
    return {
      edit_entries: Boolean(raw.edit_entries ?? true),
      view_dashboard: Boolean(raw.view_dashboard),
      view_reports: Boolean(raw.view_reports),
    }
  } catch {
    return { ...DEFAULT_RIGHTS }
  }
}

export function requireRight(user: Employee, right: keyof Rights): void {
  if (!parseRights(user)[right]) {
    throw new ApiError(403, 'You do not have permission for this')
  }
}

// ------------------------------------------------------------------- session

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
