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

// firstName lives in shared/names.ts (a pure helper, and importable from
// tests without dragging in this module's Workers-only email/SMS deps).
// Re-exported here so notification code can pull it from the same place it
// pulls notifyUser/notifyUsers.
export { firstName } from '../shared/names'

/**
 * Kinds safe to delay and consolidate — informational only, never gating an
 * approval, a payment, or a discipline action. Anything not listed here is
 * delivered immediately, which is the safe default for a kind nobody has
 * explicitly reviewed and decided is low-stakes (point_deduction and every
 * approval/payment/assignment kind are deliberately left off this list).
 */
export const BATCHABLE_KINDS = new Set(['card_duplicate', 'task_accepted', 'task_done'])

/** How long a batch collects before being sent as one consolidated message. */
export const BATCH_WINDOW_MINUTES = 10

type BatchItem = { kind: string; title: string; body: string }

/**
 * The actual multi-channel delivery — in-app row, then best-effort email/
 * SMS/push. Shared by the immediate path (notifyUser) and the batch-flush
 * path (flushDueNotificationBatches) so both deliver identically.
 */
async function deliverNotification(
  env: Env,
  employeeId: string,
  kind: string,
  title: string,
  body: string,
  voucherId: string | null,
  inAppOnly: boolean,
): Promise<void> {
  const recipient = await env.DB.prepare(
    'SELECT email, phone FROM employees WHERE id = ? AND active = 1',
  )
    .bind(employeeId)
    .first<{ email: string | null; phone: string | null }>()
  if (!recipient) return

  const id = crypto.randomUUID()
  const emailable = !inAppOnly && Boolean(recipient.email)

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
  if (!inAppOnly && recipient.phone) {
    // notifySms already swallows mnotify errors and no-ops when disabled.
    // Kept short and flat — SMS is billed per segment, unlike email.
    await notifySms(env, recipient.phone, body ? `${title}: ${body}` : title)
  }

  // Wake any device this person has subscribed; it fetches the detail itself.
  if (!inAppOnly) await pushToEmployees(env, [employeeId])
}

/**
 * Record one notification and try to email it. Returns without throwing on
 * any failure — a broken mail server must not roll back an approval.
 *
 * A BATCHABLE_KINDS kind (and not `inAppOnly`, which is already the quiet
 * option) is queued instead of delivered immediately — see
 * queueBatchedNotification.
 */
export async function notifyUser(env: Env, input: NotifyInput): Promise<void> {
  const { employeeId, kind, title, body = '', voucherId = null } = input
  try {
    if (!input.inAppOnly && BATCHABLE_KINDS.has(kind)) {
      await queueBatchedNotification(env, employeeId, kind, title, body)
      return
    }
    await deliverNotification(env, employeeId, kind, title, body, voucherId, Boolean(input.inAppOnly))
  } catch (e) {
    console.error('notifyUser failed:', e)
  }
}

/**
 * Adds one item to the employee's open batch, creating one (due in
 * BATCH_WINDOW_MINUTES) if they don't already have one. The window is
 * anchored to the *first* item in a batch, not reset by each new arrival —
 * a throttle, not a debounce, so an item is never delayed more than
 * BATCH_WINDOW_MINUTES no matter how many more pile in behind it.
 */
async function queueBatchedNotification(
  env: Env,
  employeeId: string,
  kind: string,
  title: string,
  body: string,
): Promise<void> {
  const existing = await env.DB.prepare(
    'SELECT id, items FROM notification_batches WHERE employee_id = ?',
  )
    .bind(employeeId)
    .first<{ id: string; items: string }>()

  if (existing) {
    const items = JSON.parse(existing.items) as BatchItem[]
    items.push({ kind, title, body })
    await env.DB.prepare('UPDATE notification_batches SET items = ? WHERE id = ?')
      .bind(JSON.stringify(items), existing.id)
      .run()
    return
  }

  try {
    await env.DB.prepare(
      `INSERT INTO notification_batches (id, employee_id, items, flush_at)
       VALUES (?, ?, ?, datetime('now', '+${BATCH_WINDOW_MINUTES} minutes'))`,
    )
      .bind(crypto.randomUUID(), employeeId, JSON.stringify([{ kind, title, body }]))
      .run()
  } catch (e) {
    // Unique constraint on employee_id — a near-simultaneous call already
    // created the batch first; append to that one instead of losing this item.
    if (String(e).includes('UNIQUE')) {
      const row = await env.DB.prepare(
        'SELECT id, items FROM notification_batches WHERE employee_id = ?',
      )
        .bind(employeeId)
        .first<{ id: string; items: string }>()
      if (row) {
        const items = JSON.parse(row.items) as BatchItem[]
        items.push({ kind, title, body })
        await env.DB.prepare('UPDATE notification_batches SET items = ? WHERE id = ?')
          .bind(JSON.stringify(items), row.id)
          .run()
      }
      return
    }
    throw e
  }
}

/**
 * Sends every batch whose window has elapsed, as one consolidated
 * notification per employee (or, if only one item ever landed in the
 * window, delivers it exactly as it would have gone out immediately — no
 * "1 update" wrapper for a batch of one).
 *
 * No cron trigger exists for Pages Functions here (the same constraint
 * `isTaskStale`'s doc comment in shared/tasks.ts describes for task
 * violations), so this runs opportunistically instead — called from
 * listNotifications, which fires whenever anyone's notification bell loads.
 * Sweeping *every* due batch (not just the caller's own) on each call means
 * any user's visit can flush any other employee's overdue batch, which
 * gives reasonable real-world coverage in an actively-used app without new
 * infrastructure (a Cloudflare Queue or Durable Object alarm would give a
 * harder latency guarantee, but neither is wired up in this project).
 */
export async function flushDueNotificationBatches(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT id, employee_id, items FROM notification_batches WHERE flush_at <= datetime('now')",
  ).all<{ id: string; employee_id: string; items: string }>()

  for (const batch of results) {
    try {
      const items = JSON.parse(batch.items) as BatchItem[]
      if (items.length === 1) {
        const [only] = items
        await deliverNotification(env, batch.employee_id, only.kind, only.title, only.body, null, false)
      } else {
        const title = `${items.length} updates`
        const body = items.map((it) => (it.body ? `${it.title}\n${it.body}` : it.title)).join('\n\n')
        await deliverNotification(env, batch.employee_id, 'digest_batch', title, body, null, false)
      }
    } catch (e) {
      console.error('flushDueNotificationBatches: failed to deliver batch', batch.id, e)
      continue // leave it queued — retried on the next sweep
    }
    await env.DB.prepare('DELETE FROM notification_batches WHERE id = ?').bind(batch.id).run()
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
  right:
    | 'review_expenses'
    | 'record_expenses'
    | 'approve_expenses'
    | 'send_for_approval',
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
  // Opportunistic sweep — see flushDueNotificationBatches's doc comment for
  // why this runs here rather than on a schedule. Swallow a failure (e.g. an
  // unmigrated environment missing the table) so a broken batch sweep never
  // blocks someone from just reading their notifications.
  await flushDueNotificationBatches(env).catch((e) => console.error('notification batch sweep failed:', e))

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
