// Task API handlers.
//
// Rules live in shared/tasks.ts; this module is the enforcement point — it
// resolves who the caller is relative to each task, applies those rules, and
// notifies whoever the work lands on.

import type { Employee, Env } from './env'
import { ApiError, json, readJson, todayInTz } from './http'
import { audit, parseRights, requireUser } from './auth'
import { firstName, notifyUser, notifyUsers } from './notify'
import {
  allowedTaskActions,
  canTask,
  canViewTask,
  completionStamp,
  parseDueDate,
  parseTaskPriority,
  parseTaskStatus,
  type TaskActor,
  type TaskLike,
  type TaskPriority,
  type TaskStatus,
} from '../shared/tasks'

export interface TaskRow {
  id: string
  task_code: string | null
  title: string
  details: string | null
  assignee_id: string | null
  secondary_person_id: string | null
  secondary_role: string | null
  created_by: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  broadcast: number
  recurrence: string | null
}

export interface TaskCommentRow {
  id: string
  task_id: string
  employee_id: string
  employee_name?: string
  content: string
  created_at: string
}

/** The shape shared/tasks.ts's pure rules actually need, out of a DB row. */
function taskLike(t: TaskRow): TaskLike {
  return {
    assignee_id: t.assignee_id,
    secondary_person_id: t.secondary_person_id,
    secondary_role: t.secondary_role,
    created_by: t.created_by,
    status: t.status,
    broadcast: Boolean(t.broadcast),
  }
}

const SELECT_TASK = `
  SELECT t.*,
         a.name AS assignee_name,
         c.name AS created_by_name,
         s.name AS secondary_person_name
    FROM tasks t
    LEFT JOIN employees a ON a.id = t.assignee_id
    LEFT JOIN employees c ON c.id = t.created_by
    LEFT JOIN employees s ON s.id = t.secondary_person_id`

function actorFor(user: Employee): TaskActor {
  const rights = parseRights(user)
  return {
    id: user.id,
    is_admin: user.role === 'admin',
    can_manage: rights.manage_tasks,
    can_delete: rights.delete_tasks,
  }
}

function today(env: Env): string {
  return todayInTz(env.TEAM_TZ ?? 'Africa/Accra')
}

/** Attach what the caller may do, so the UI never offers a refused action. */
function withActions(rows: TaskRow[], actor: TaskActor) {
  return rows.map((t) => ({ ...t, actions: allowedTaskActions(taskLike(t), actor) }))
}

/**
 * Who a task can be given to: id and name, nothing else.
 *
 * A `manage_tasks` holder who is not an administrator needs the team's names
 * to assign work, but `/api/employees` deliberately returns only the caller
 * themself to a non-admin (it carries rights, rate overrides and pay
 * settings). The result was a right that could not actually be used — the
 * "Assigned to" select listed one person, the holder. This endpoint closes
 * that gap without widening the other one: two harmless columns, and only
 * for someone who can already assign.
 */
export async function listTaskAssignees(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  if (user.role !== 'admin' && !parseRights(user).manage_tasks) {
    throw new ApiError(403, 'You do not have permission for this')
  }
  const { results } = await env.DB.prepare(
    "SELECT id, name FROM employees WHERE active = 1 AND approval_status = 'approved' ORDER BY name",
  ).all<{ id: string; name: string }>()
  return json(results)
}

/**
 * Tasks the caller may see: everything for a manager of tasks, otherwise the
 * ones assigned to them, the ones they raised, plus anything open to
 * everyone (claimed or not — the shared board). Scoped in SQL rather than
 * filtered afterwards, so a large board cannot leak through pagination later.
 */
export async function listTasks(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const actor = actorFor(user)
  const url = new URL(request.url)
  const status = parseTaskStatus(url.searchParams.get('status'))
  const mineOnly = url.searchParams.get('mine') === '1'

  let sql = `${SELECT_TASK} WHERE 1 = 1`
  const binds: unknown[] = []

  if (!actor.is_admin && !actor.can_manage) {
    sql += ' AND (t.assignee_id = ? OR t.secondary_person_id = ? OR t.created_by = ? OR t.broadcast = 1)'
    binds.push(user.id, user.id, user.id)
  } else if (mineOnly) {
    sql += " AND (t.assignee_id = ? OR (t.secondary_person_id = ? AND t.secondary_role = 'assignee'))"
    binds.push(user.id, user.id)
  }
  if (status) {
    sql += ' AND t.status = ?'
    binds.push(status)
  }
  // Undated tasks last, then soonest first; high priority above the rest.
  sql += `
    ORDER BY CASE t.status WHEN 'done' THEN 1 WHEN 'cancelled' THEN 1 ELSE 0 END,
             t.due_date IS NULL, t.due_date,
             CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
             t.created_at DESC`

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all<TaskRow>()
  return json(withActions(results, actor))
}

interface TaskBody {
  title?: string
  details?: string | null
  assignee_id?: string | null
  secondary_person_id?: string | null
  secondary_role?: string | null
  status?: string
  priority?: string
  due_date?: string | null
  /** Raise for "Everyone" instead of one person. Create only. */
  broadcast?: boolean
  /** Claim an unclaimed broadcast task as your own. Patch only. */
  accept?: boolean
  recurrence?: string | null
}

async function loadTask(env: Env, id: string): Promise<TaskRow> {
  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?')
    .bind(id)
    .first<TaskRow>()
  if (!task) throw new ApiError(404, 'Task not found')
  return task
}

async function assertAssignee(env: Env, id: string): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT id FROM employees WHERE id = ? AND active = 1',
  )
    .bind(id)
    .first()
  if (!row) throw new ApiError(400, 'Unknown employee')
}

/** Next TASK-NNN code. Increment-then-read in one batch, same pattern as
 * expense voucher numbers, so two concurrent creates cannot collide. */
async function nextTaskCode(env: Env): Promise<string> {
  const batch = await env.DB.batch<{ next: number }>([
    env.DB.prepare(
      'INSERT INTO task_seq (id, next) VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET next = next + 1',
    ),
    env.DB.prepare('SELECT next FROM task_seq WHERE id = 1'),
  ])
  const seq = batch[1].results?.[0]?.next ?? 1
  return `TASK-${String(seq).padStart(3, '0')}`
}

export async function getTask(request: Request, env: Env, id: string): Promise<Response> {
  const user = await requireUser(request, env)
  const actor = actorFor(user)
  const task = await env.DB.prepare(`${SELECT_TASK} WHERE t.id = ?`).bind(id).first<TaskRow>()
  if (!task) throw new ApiError(404, 'Task not found')
  if (!canViewTask(taskLike(task), actor)) throw new ApiError(403, 'You cannot see this task')
  return json({ ...task, actions: allowedTaskActions(taskLike(task), actor) })
}

export async function createTask(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const actor = actorFor(user)
  const body = await readJson<TaskBody>(request)

  const title = (body.title ?? '').trim().slice(0, 200)
  if (!title) throw new ApiError(400, 'A title is required')

  // Anyone may raise a task for themselves. Naming one specific other person
  // is what the right is for — that is volunteering someone else's time.
  // Opening it to Everyone needs no right at all: it is a ticket for the
  // pool, not an instruction to anybody in particular, and whoever takes it
  // does so by choice (see the 'accept' action in shared/tasks.ts).
  const manages = actor.is_admin || actor.can_manage
  const broadcast = body.broadcast === true
  const assignee = broadcast ? null : (body.assignee_id ?? user.id)
  if (!broadcast && assignee !== user.id && !manages) {
    throw new ApiError(403, 'You can only create tasks for yourself')
  }
  if (assignee) await assertAssignee(env, assignee)

  const secondaryAssignee = broadcast ? null : (body.secondary_person_id ?? null)
  if (!broadcast && secondaryAssignee !== null && !manages) {
    throw new ApiError(403, 'You can only create tasks for yourself')
  }
  if (secondaryAssignee) {
    await assertAssignee(env, secondaryAssignee)
    if (secondaryAssignee === assignee) {
      throw new ApiError(400, 'Primary and secondary person cannot be the same')
    }
  }
  const secondaryRole = secondaryAssignee ? (body.secondary_role === 'assignee' ? 'assignee' : 'observer') : null

  const due = parseDueDate(body.due_date)
  if (due === undefined) throw new ApiError(400, 'due_date must be YYYY-MM-DD')
  const priority = parseTaskPriority(body.priority ?? 'normal')
  if (!priority) throw new ApiError(400, 'Unknown priority')

  const recurrence = (body.recurrence === 'daily' || body.recurrence === 'weekly' || body.recurrence === 'monthly') ? body.recurrence : null

  const id = crypto.randomUUID()
  const code = await nextTaskCode(env)
  await env.DB.prepare(
    `INSERT INTO tasks (id, task_code, title, details, assignee_id, secondary_person_id, secondary_role, created_by, priority, due_date, broadcast, recurrence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      code,
      title,
      (body.details ?? '')?.toString().trim().slice(0, 2000) || null,
      assignee,
      secondaryAssignee,
      secondaryRole,
      user.id,
      priority,
      due,
      broadcast ? 1 : 0,
      recurrence,
    )
    .run()
  await audit(env, user.id, 'create_task', id, { task_code: code, title, assignee_id: assignee, secondary_person_id: secondaryAssignee, secondary_role: secondaryRole, broadcast })

  if (assignee && assignee !== user.id) {
    await notifyUser(env, {
      employeeId: assignee,
      kind: 'task_assigned',
      title: `${firstName(user.name)} assigned you a task`,
      body: due ? `${code}: ${title}\n\nWanted by ${due}.` : `${code}: ${title}`,
    })
  } else if (broadcast) {
    const { results } = await env.DB.prepare(
      'SELECT id FROM employees WHERE active = 1 AND id != ?',
    )
      .bind(user.id)
      .all<{ id: string }>()
    await notifyUsers(
      env,
      results.map((e) => e.id),
      {
        kind: 'task_broadcast',
        title: `${firstName(user.name)} opened a task to everyone`,
        body: due ? `${code}: ${title}\n\nWanted by ${due}.` : `${code}: ${title}`,
      },
    )
  }

  const created = await env.DB.prepare(`${SELECT_TASK} WHERE t.id = ?`)
    .bind(id)
    .first<TaskRow>()
  return json({ ...created, actions: allowedTaskActions(taskLike(created!), actor) }, 201)
}

export async function patchTask(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const user = await requireUser(request, env)
  const actor = actorFor(user)
  const task = await loadTask(env, id)
  if (!canViewTask(taskLike(task), actor)) throw new ApiError(403, 'You cannot see this task')

  const body = await readJson<TaskBody>(request)
  const wantsStatus = body.status !== undefined
  // Claiming an open task is its own action, not an edit — anyone the task
  // is open to may do it, whether or not they could otherwise touch it.
  const wantsAccept = body.accept === true
  const wantsEdit =
    body.title !== undefined ||
    body.details !== undefined ||
    body.assignee_id !== undefined ||
    body.secondary_person_id !== undefined ||
    body.secondary_role !== undefined ||
    body.priority !== undefined ||
    body.due_date !== undefined ||
    body.recurrence !== undefined

  if (wantsEdit && !canTask('edit', taskLike(task), actor)) {
    throw new ApiError(403, 'You can only change the status of this task')
  }
  if (wantsStatus && !canTask('set_status', taskLike(task), actor)) {
    throw new ApiError(403, 'You cannot change this task')
  }
  if (wantsAccept && !canTask('accept', taskLike(task), actor)) {
    throw new ApiError(400, 'This task is not open to accept')
  }

  const title =
    body.title !== undefined ? String(body.title).trim().slice(0, 200) : task.title
  if (!title) throw new ApiError(400, 'A title is required')

  const status = wantsStatus ? parseTaskStatus(body.status) : task.status
  if (!status) throw new ApiError(400, 'Unknown status')
  const priority =
    body.priority !== undefined ? parseTaskPriority(body.priority) : task.priority
  if (!priority) throw new ApiError(400, 'Unknown priority')

  const due = body.due_date !== undefined ? parseDueDate(body.due_date) : task.due_date
  if (due === undefined) throw new ApiError(400, 'due_date must be YYYY-MM-DD')

  let recurrence = task.recurrence
  if (body.recurrence !== undefined) {
    recurrence = (body.recurrence === 'daily' || body.recurrence === 'weekly' || body.recurrence === 'monthly') ? body.recurrence : null
  }

  let assignee = task.assignee_id
  if (body.assignee_id !== undefined) {
    assignee = body.assignee_id || null
    if (assignee) await assertAssignee(env, assignee)
  } else if (wantsAccept) {
    assignee = user.id
  }

  let secondaryAssignee = task.secondary_person_id
  let secondaryRole = task.secondary_role
  if (body.secondary_person_id !== undefined) {
    secondaryAssignee = body.secondary_person_id || null
    if (secondaryAssignee) {
      await assertAssignee(env, secondaryAssignee)
    }
  }
  if (body.secondary_role !== undefined) {
    secondaryRole = body.secondary_role === 'assignee' ? 'assignee' : (body.secondary_role === 'observer' ? 'observer' : null)
  }
  if (!secondaryAssignee) secondaryRole = null
  
  if (assignee && secondaryAssignee && assignee === secondaryAssignee) {
    throw new ApiError(400, 'Primary and secondary person cannot be the same')
  }

  const now = new Date().toISOString()
  const completed = completionStamp(status, task.status, task.completed_at, now)

  await env.DB.prepare(
    `UPDATE tasks SET title = ?, details = ?, assignee_id = ?, secondary_person_id = ?, secondary_role = ?, status = ?,
       priority = ?, due_date = ?, completed_at = ?, recurrence = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      title,
      body.details !== undefined
        ? (String(body.details).trim().slice(0, 2000) || null)
        : task.details,
      assignee,
      secondaryAssignee,
      secondaryRole,
      status,
      priority,
      due,
      completed,
      recurrence,
      id,
    )
    .run()
  await audit(env, user.id, 'update_task', id, { status, assignee_id: assignee, secondary_person_id: secondaryAssignee, secondary_role: secondaryRole, accepted: wantsAccept })

  // Tell someone when work newly lands on them, whoever opened it to
  // everyone when it is claimed, and whoever asked for it when it is
  // finished — the moments that need a person to know.
  if (assignee && assignee !== task.assignee_id && assignee !== user.id) {
    await notifyUser(env, {
      employeeId: assignee,
      kind: 'task_assigned',
      title: `${firstName(user.name)} assigned you a task`,
      body: `${task.task_code}: ${title}`,
    })
  }
  if (secondaryAssignee && secondaryAssignee !== task.secondary_person_id && secondaryAssignee !== user.id) {
    const roleLabel = secondaryRole === 'assignee' ? 'assigned you a task as an additional assignee' : 'added you as an observer to a task'
    await notifyUser(env, {
      employeeId: secondaryAssignee,
      kind: 'task_assigned',
      title: `${firstName(user.name)} ${roleLabel}`,
      body: `${task.task_code}: ${title}`,
    })
  }
  if (wantsAccept && task.created_by && task.created_by !== user.id) {
    await notifyUser(env, {
      employeeId: task.created_by,
      kind: 'task_accepted',
      title: `${firstName(user.name)} accepted a task you opened to everyone`,
      body: `${task.task_code}: ${title}`,
    })
  }
  if (
    status === 'done' &&
    task.status !== 'done' &&
    task.created_by &&
    task.created_by !== user.id
  ) {
    await notifyUser(env, {
      employeeId: task.created_by,
      kind: 'task_done',
      title: `${firstName(user.name)} completed a task you raised`,
      body: `${task.task_code}: ${title}`,
    })
  }

  // Handle recurrence: clone the task with a new due date if applicable
  if (status === 'done' && task.status !== 'done' && recurrence) {
    let nextDue = null
    if (due) {
      const d = new Date(due)
      if (recurrence === 'daily') d.setUTCDate(d.getUTCDate() + 1)
      else if (recurrence === 'weekly') d.setUTCDate(d.getUTCDate() + 7)
      else if (recurrence === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1)
      nextDue = d.toISOString().slice(0, 10)
    }
    const newId = crypto.randomUUID()
    const newCode = await nextTaskCode(env)
    await env.DB.prepare(
      `INSERT INTO tasks (id, task_code, title, details, assignee_id, secondary_person_id, secondary_role, created_by, priority, due_date, broadcast, recurrence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        newId, newCode, title, body.details !== undefined ? (String(body.details).trim().slice(0, 2000) || null) : task.details,
        assignee, secondaryAssignee, secondaryRole, task.created_by, priority, nextDue, task.broadcast, recurrence
      )
      .run()
    await audit(env, task.created_by ?? user.id, 'create_task', newId, { task_code: newCode, title, assignee_id: assignee, broadcast: task.broadcast, note: 'auto-recurring' })
  }

  const updated = await env.DB.prepare(`${SELECT_TASK} WHERE t.id = ?`)
    .bind(id)
    .first<TaskRow>()
  return json({ ...updated, actions: allowedTaskActions(taskLike(updated!), actor) })
}

export async function deleteTask(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const user = await requireUser(request, env)
  const actor = actorFor(user)
  const task = await loadTask(env, id)
  if (!canTask('delete', taskLike(task), actor)) {
    throw new ApiError(403, 'You cannot delete this task')
  }
  await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run()
  await audit(env, user.id, 'delete_task', id, { title: task.title })
  return json({ ok: true })
}

/** Open tasks assigned to the caller, for the "today" line on the page. */
export async function taskSummary(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const row = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN status IN ('todo','in_progress') THEN 1 ELSE 0 END) AS open,
       SUM(CASE WHEN status IN ('todo','in_progress')
                 AND due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) AS overdue
     FROM tasks WHERE assignee_id = ? OR (secondary_person_id = ? AND secondary_role = 'assignee')`,
  )
    .bind(today(env), user.id, user.id)
    .first<{ open: number | null; overdue: number | null }>()
  return json({ open: row?.open ?? 0, overdue: row?.overdue ?? 0 })
}

export async function listTaskComments(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const user = await requireUser(request, env)
  const actor = actorFor(user)
  const task = await loadTask(env, id)
  if (!canViewTask(taskLike(task), actor)) throw new ApiError(403, 'You cannot see this task')

  const { results } = await env.DB.prepare(
    `SELECT c.*, e.name AS employee_name
     FROM task_comments c
     JOIN employees e ON e.id = c.employee_id
     WHERE c.task_id = ?
     ORDER BY c.created_at ASC`
  )
    .bind(id)
    .all<TaskCommentRow>()
  return json(results)
}

export async function createTaskComment(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const user = await requireUser(request, env)
  const actor = actorFor(user)
  const task = await loadTask(env, id)
  
  // Anyone who can view the task can comment on it.
  if (!canViewTask(taskLike(task), actor)) throw new ApiError(403, 'You cannot see this task')

  const body = await readJson<{ content?: string }>(request)
  const content = (body.content ?? '').trim().slice(0, 2000)
  if (!content) throw new ApiError(400, 'Content is required')

  const commentId = crypto.randomUUID()
  await env.DB.prepare(
    'INSERT INTO task_comments (id, task_id, employee_id, content) VALUES (?, ?, ?, ?)'
  )
    .bind(commentId, id, user.id, content)
    .run()

  // Notify assigned personnel if someone else comments
  const notifyIds = new Set<string>()
  if (task.assignee_id && task.assignee_id !== user.id) notifyIds.add(task.assignee_id)
  if (task.secondary_person_id && task.secondary_person_id !== user.id) notifyIds.add(task.secondary_person_id)
  if (task.created_by && task.created_by !== user.id) notifyIds.add(task.created_by)

  const names = [...notifyIds]
  if (names.length > 0) {
    await notifyUsers(env, names, {
      kind: 'task_assigned', // Reusing the notification kind
      title: `${firstName(user.name)} commented on a task`,
      body: `${task.task_code}: ${task.title}`
    })
  }

  const newComment = await env.DB.prepare(
    `SELECT c.*, e.name AS employee_name
     FROM task_comments c
     JOIN employees e ON e.id = c.employee_id
     WHERE c.id = ?`
  )
    .bind(commentId)
    .first<TaskCommentRow>()

  return json(newComment)
}
