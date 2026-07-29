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
  add_entries: boolean
  edit_entries: boolean
  delete_entries: boolean
  view_dashboard: boolean
  view_reports: boolean
  view_remuneration: boolean
  view_payslip: boolean
  log_leave: boolean
  // Card-based work types (Classification/QAP) are normally logged as cards.
  // This right lets the holder type the count directly instead.
  direct_counts: boolean
  // Expense vouchers. "Manager" and "finance" are rights rather than roles:
  // review_expenses only bites for the holder's own direct reports
  // (employees.manager_id), finance_expenses is organization-wide.
  add_expenses: boolean
  review_expenses: boolean
  finance_expenses: boolean
  // Final approval authority. Unlike every other right, this one is NOT
  // implied by the admin role — see parseRights. An approver is an
  // administrator who has also been granted this explicitly, so approval is
  // something delegated rather than something the role carries.
  approve_expenses: boolean
}

export const DEFAULT_RIGHTS: Rights = {
  add_entries: true,
  edit_entries: true,
  delete_entries: true,
  view_dashboard: false,
  view_reports: false,
  view_remuneration: false,
  view_payslip: false,
  log_leave: false,
  direct_counts: false,
  add_expenses: true,
  review_expenses: false,
  finance_expenses: false,
  approve_expenses: false,
}

const ALL_RIGHTS: Rights = {
  add_entries: true,
  edit_entries: true,
  delete_entries: true,
  view_dashboard: true,
  view_reports: true,
  view_remuneration: true,
  view_payslip: true,
  log_leave: true,
  direct_counts: true,
  add_expenses: true,
  review_expenses: true,
  finance_expenses: true,
  // Not granted here — see the carve-out in parseRights.
  approve_expenses: false,
}

/** Read one right straight from the stored JSON, ignoring role shortcuts. */
function rawRight(employee: Employee, key: keyof Rights): boolean {
  try {
    return Boolean((JSON.parse(employee.rights || '{}') as Partial<Rights>)[key])
  } catch {
    return false
  }
}

export function parseRights(employee: Employee): Rights {
  if (employee.role === 'admin') {
    // Admins hold everything implicitly *except* expense approval, which must
    // be granted deliberately so it can also be withheld from an admin.
    return { ...ALL_RIGHTS, approve_expenses: rawRight(employee, 'approve_expenses') }
  }
  try {
    const raw = JSON.parse(employee.rights || '{}') as Partial<Rights>
    return {
      // Rows written before add/edit/delete were split only have
      // edit_entries; let it stand in until the admin re-saves them.
      add_entries: Boolean(raw.add_entries ?? raw.edit_entries ?? true),
      edit_entries: Boolean(raw.edit_entries ?? true),
      delete_entries: Boolean(raw.delete_entries ?? raw.edit_entries ?? true),
      view_dashboard: Boolean(raw.view_dashboard),
      view_reports: Boolean(raw.view_reports),
      // view_payslip predates the split; let it stand in for view_remuneration
      // so existing payslip-holders keep the Payments summary until re-saved.
      view_remuneration: Boolean(raw.view_remuneration ?? raw.view_payslip),
      view_payslip: Boolean(raw.view_payslip),
      log_leave: Boolean(raw.log_leave),
      direct_counts: Boolean(raw.direct_counts),
      // Filing your own expenses is the baseline, like logging your own time:
      // rows written before the expense module default to allowed.
      add_expenses: Boolean(raw.add_expenses ?? true),
      review_expenses: Boolean(raw.review_expenses),
      finance_expenses: Boolean(raw.finance_expenses),
      // Only meaningful alongside the admin role; kept here so the stored
      // value survives a round trip through the Employees form.
      approve_expenses: Boolean(raw.approve_expenses),
    }
  } catch {
    return { ...DEFAULT_RIGHTS }
  }
}

/** True when the user may see their own pay figures via either pay view. */
export function canSeeOwnPay(rights: Rights): boolean {
  return rights.view_remuneration || rights.view_payslip
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
