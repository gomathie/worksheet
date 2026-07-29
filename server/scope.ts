// Whose records a signed-in user may see.
//
// Driven by employees.data_scope, which an administrator assigns per person
// rather than being implied by the role. Every list endpoint that can return
// other people's records funnels through here, so the rule is defined once.

import type { Employee, Env } from './env'
import { parseDataScope } from './auth'

/**
 * The employee ids this user may see, or `null` meaning "no restriction".
 * Always includes the user themselves — nobody is scoped out of their own
 * records.
 */
export async function visibleEmployeeIds(
  env: Env,
  user: Employee,
): Promise<string[] | null> {
  // Administrators are unrestricted regardless of the stored scope.
  if (user.role === 'admin') return null

  const scope = parseDataScope(user.data_scope)
  if (scope === 'all') return null

  const ids = new Set<string>([user.id])

  if (scope === 'direct_reports') {
    const { results } = await env.DB.prepare(
      'SELECT id FROM employees WHERE manager_id = ?',
    )
      .bind(user.id)
      .all<{ id: string }>()
    for (const r of results) ids.add(r.id)
  } else if (scope === 'department') {
    if (user.department_id) {
      const { results } = await env.DB.prepare(
        'SELECT id FROM employees WHERE department_id = ?',
      )
        .bind(user.department_id)
        .all<{ id: string }>()
      for (const r of results) ids.add(r.id)
    }
    // With no department set, 'department' collapses to just themselves —
    // better than silently widening to everyone.
  }

  return [...ids]
}

/**
 * An ` AND <column> IN (?, ?, …)` fragment plus its bindings, or an empty
 * fragment when the user is unrestricted.
 */
export function scopeClause(
  ids: string[] | null,
  column: string,
): { sql: string; binds: string[] } {
  if (ids === null) return { sql: '', binds: [] }
  if (ids.length === 0) {
    // Defensive: never fall through to "no filter" on an empty list.
    return { sql: ' AND 1 = 0', binds: [] }
  }
  return {
    sql: ` AND ${column} IN (${ids.map(() => '?').join(',')})`,
    binds: ids,
  }
}

/** Convenience for in-memory filtering of an already-fetched list. */
export function isVisible(ids: string[] | null, employeeId: string): boolean {
  return ids === null || ids.includes(employeeId)
}
