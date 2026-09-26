import { json } from '@mjackson/form-data-parser'
import type { Env, Employee } from './env'
import { ApiError } from './error'
import { notifyUser } from './notify'

export async function sendWeeklyDigest(request: Request, env: Env): Promise<Response> {
  // Simple auth for cron: require a specific header or just rely on Cloudflare Access / Internal trigger.
  // For simplicity, we assume this is protected by CF Access or an API key in production.
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== \`Bearer \${env.CRON_SECRET ?? 'local-cron'}\` && env.CRON_SECRET) {
    throw new ApiError(401, 'Unauthorized cron trigger')
  }

  // Calculate "last week" date range
  const now = new Date()
  
  // Go back to previous Monday
  const dayOfWeek = now.getDay()
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  
  const lastMonday = new Date(now)
  lastMonday.setDate(now.getDate() - daysSinceMonday - 7)
  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)
  
  const fromDate = lastMonday.toISOString().split('T')[0]
  const toDate = lastSunday.toISOString().split('T')[0]

  // Get active employees
  const { results: employees } = await env.DB.prepare(
    'SELECT id, name FROM employees WHERE active = 1'
  ).all<{ id: string; name: string }>()

  // Get all entries for last week
  const { results: entries } = await env.DB.prepare(
    \`SELECT employee_id, hours, units 
     FROM entries 
     WHERE work_date >= ? AND work_date <= ?\`
  )
    .bind(fromDate, toDate)
    .all<{ employee_id: string; hours: number; units: string }>()

  // Group entries by employee
  const employeeData = new Map<string, { hours: number, units: number }>()
  for (const entry of entries) {
    const data = employeeData.get(entry.employee_id) || { hours: 0, units: 0 }
    data.hours += entry.hours
    
    let entryUnits = 0
    if (entry.units) {
      try {
        const parsed = JSON.parse(entry.units) as Record<string, number>
        entryUnits = Object.values(parsed).reduce((sum, val) => sum + (val || 0), 0)
      } catch (e) {
        // ignore invalid json
      }
    }
    data.units += entryUnits
    employeeData.set(entry.employee_id, data)
  }

  // Send digests
  const sentCount = 0
  for (const emp of employees) {
    const data = employeeData.get(emp.id)
    if (!data) continue // No work recorded last week, maybe don't spam them?

    const body = \`Last week (\${fromDate} to \${toDate}), you logged \${data.hours} hours and completed \${data.units} units. Great job!\`
    
    await notifyUser(env, {
      employeeId: emp.id,
      kind: 'digest',
      title: 'Weekly Performance Digest',
      body,
    })
  }

  return json({ ok: true, sent: employeeData.size })
}
