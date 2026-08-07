// In-app notifications, with email and SMS delivery layered on top.
//
// Every notification is recorded in the `notifications` table (that is what
// the header bell reads). If SMTP/mnotify are configured, the same message
// also goes out by email and/or SMS — best effort, and never allowed to fail
// the action that triggered it.

import type { Env, NotificationRow } from './env'
import { notify as sendEmail } from './email'
import { notifySms } from './sms'
import { pushToEmployees } from './push'

export interface NotifyInput {
  employeeId: string
  kind: string
  title: string
  body?: string
  voucherId?: string | null
  /** Skip the email and record in-app only. */
  inAppOnly?: boolean
}

/**
 * Record one notification and try to email it. Returns without throwing on
 * any failure — a broken mail server must not roll back an approval.
 */
export async function notifyUser(env: Env, input: NotifyInput): Promise<void> {
  const { employeeId, kind, title, body = '', voucherId = null } = input
  try {
    const recipient = await env.DB.prepare(
      'SELECT email, phone FROM employees WHERE id = ? AND active = 1',
    )
      .bind(employeeId)
      .first<{ email: string | null; phone: string | null }>()
    if (!recipient) return

    const id = crypto.randomUUID()
    const emailable = !input.inAppOnly && Boolean(recipient.email)

    await env.DB.prepare(
      `INSERT INTO notifications (id, employee_id, kind, title, body, voucher_id, emailed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, employeeId, kind, title, body, voucherId, emailable ? new Date().toISOString() : null)
      .run()

    if (emailable) {
      // sendEmail already swallows SMTP errors and no-ops when disabled.
      await sendEmail(env, recipient.email, title, body)
    }
    if (!input.inAppOnly && recipient.phone) {
      // notifySms already swallows mnotify errors and no-ops when disabled.
      // Kept short and flat — SMS is billed per segment, unlike email.
      await notifySms(env, recipient.phone, body ? `${title}: ${body}` : title)
    }

    // Wake any device this person has subscribed; it fetches the detail itself.
    if (!input.inAppOnly) await pushToEmployees(env, [employeeId])
  } catch (e) {
    console.error('notifyUser failed:', e)
  }
}

/** Notify several people at once; failures are per-recipient. */
export async function notifyUsers(
  env: Env,
  employeeIds: string[],
  input: Omit<NotifyInput, 'employeeId'>,
): Promise<void> {
  for (const employeeId of [...new Set(employeeIds)]) {
    await notifyUser(env, { ...input, employeeId })
  }
}

/** Active employees holding a given right, for queue notifications. */
export async function employeesWithRight(
  env: Env,
  right: 'review_expenses' | 'record_expenses' | 'approve_expenses',
): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, role, rights FROM employees WHERE active = 1",
  ).all<{ id: string; role: string; rights: string }>()
  const has = (e: { rights: string }) => {
    try {
      return Boolean((JSON.parse(e.rights || '{}') as Record<string, unknown>)[right])
    } catch {
      return false
    }
  }
  return results
    .filter((e) => {
      // approve_expenses is never implied by the admin role — an approver is
      // an admin who also holds it. Every other right admins get for free.
      if (right === 'approve_expenses') return e.role === 'admin' && has(e)
      return e.role === 'admin' || has(e)
    })
    .map((e) => e.id)
}

export async function listNotifications(
  env: Env,
  employeeId: string,
  limit = 50,
): Promise<NotificationRow[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM notifications WHERE employee_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
  )
    .bind(employeeId, limit)
    .all<NotificationRow>()
  return results
}

export async function markNotificationsRead(
  env: Env,
  employeeId: string,
  ids: string[] | 'all',
): Promise<void> {
  const now = new Date().toISOString()
  if (ids === 'all') {
    await env.DB.prepare(
      'UPDATE notifications SET read_at = ? WHERE employee_id = ? AND read_at IS NULL',
    )
      .bind(now, employeeId)
      .run()
    return
  }
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  await env.DB.prepare(
    `UPDATE notifications SET read_at = ? WHERE employee_id = ? AND read_at IS NULL AND id IN (${placeholders})`,
  )
    .bind(now, employeeId, ...ids)
    .run()
}
