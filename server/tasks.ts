// Task API handlers.
//
// Rules live in shared/tasks.ts; this module is the enforcement point — it
// resolves who the caller is relative to each task, applies those rules, and
// notifies whoever the work lands on.

import type { Employee, Env } from './env'
import { ApiError, json, readJson, todayInTz } from './http'
import { audit, parseRights, requireUser } from './auth'
import { notifyUser } from './notify'
import {
  allowedTaskActions,
  canTask,
  canViewTask,
  completionStamp,
  parseDueDate,
  parseTaskPriority,
  parseTaskStatus,
  type TaskActor,
  type TaskPriority,
  type TaskStatus,
} from '../shared/tasks'

export interface TaskRow {
  id: string
  title: string
  details: string | null
  assignee_id: string | null
  created_by: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

const SELECT_TASK = `
  SELECT t.*,
         a.name AS assignee_name,
         c.name AS created_by_name
    FROM tasks t
    LEFT JOIN employees a ON a.id = t.assignee_id
    LEFT JOIN employees c ON c.id = t.created_by`

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
  return rows.map((t) => ({ ...t, actions: allowedTaskActions(t, actor) }))
}

/**
 * Tasks the caller may see: everything for a manager of tasks, otherwise the
 * ones assigned to them plus the ones they raised. Scoped in SQL rather than
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
    sql += ' AND (t.assignee_id = ? OR t.created_by = ?)'
    binds.push(user.id, user.id)
  } else if (mineOnly) {
    sql += ' AND t.assignee_id = ?'
    binds.push(user.id)
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
  status?: string
  priority?: string
  due_date?: string | null
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

export async function createTask(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const actor = actorFor(user)
  const body = await readJson<TaskBody>(request)

  const title = (body.title ?? '').trim().slice(0, 200)
  if (!title) throw new ApiError(400, 'A title is required')

  // Anyone may raise a task for themselves; giving work to someone else is
  // what the right is for.
  const manages = actor.is_admin || actor.can_manage
  const assignee = body.assignee_id ?? user.id
  if (assignee !== user.id && !manages) {
    throw new ApiError(403, 'You can only create tasks for yourself')
  }
  if (assignee) await assertAssignee(env, assignee)

  const due = parseDueDate(body.due_date)
  if (due === undefined) throw new ApiError(400, 'due_date must be YYYY-MM-DD')
  const priority = parseTaskPriority(body.priority ?? 'normal')
  if (!priority) throw new ApiError(400, 'Unknown priority')

  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO tasks (id, title, details, assignee_id, created_by, priority, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      title,
      (body.details ?? '')?.toString().trim().slice(0, 2000) || null,
      assignee,
      user.id,
      priority,
      due,
    )
    .run()
  await audit(env, user.id, 'create_task', id, { title, assignee_id: assignee })

  if (assignee && assignee !== user.id) {
    await notifyUser(env, {
      employeeId: assignee,
      kind: 'task_assigned',
      title: `${user.name} assigned you a task`,
      body: due ? `${title}\n\nWanted by ${due}.` : title,
    })
  }

  const created = await env.DB.prepare(`${SELECT_TASK} WHERE t.id = ?`)
    .bind(id)
    .first<TaskRow>()
  return json({ ...created, actions: allowedTaskActions(created!, actor) }, 201)
}

export async function patchTask(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const user = await requireUser(request, env)
  const actor = actorFor(user)
  const task = await loadTask(env, id)
  if (!canViewTask(task, actor)) throw new ApiError(403, 'You cannot see this task')

  const body = await readJson<TaskBody>(request)
  const wantsStatus = body.status !== undefined
  const wantsEdit =
    body.title !== undefined ||
    body.details !== undefined ||
    body.assignee_id !== undefined ||
    body.priority !== undefined ||
    body.due_date !== undefined

  if (wantsEdit && !canTask('edit', task, actor)) {
    throw new ApiError(403, 'You can only change the status of this task')
  }
  if (wantsStatus && !canTask('set_status', task, actor)) {
    throw new ApiError(403, 'You cannot change this task')
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

  let assignee = task.assignee_id
  if (body.assignee_id !== undefined) {
    assignee = body.assignee_id || null
    if (assignee) await assertAssignee(env, assignee)
  }

  const now = new Date().toISOString()
  const completed = completionStamp(status, task.status, task.completed_at, now)

  await env.DB.prepare(
    `UPDATE tasks SET title = ?, details = ?, assignee_id = ?, status = ?,
       priority = ?, due_date = ?, completed_at = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      title,
      body.details !== undefined
        ? (String(body.details).trim().slice(0, 2000) || null)
        : task.details,
      assignee,
      status,
      priority,
      due,
      completed,
      id,
    )
    .run()
  await audit(env, user.id, 'update_task', id, { status, assignee_id: assignee })

  // Tell someone when work newly lands on them, and tell whoever asked for it
  // when it is finished — the two moments that need a person to know.
  if (assignee && assignee !== task.assignee_id && assignee !== user.id) {
    await notifyUser(env, {
      employeeId: assignee,
      kind: 'task_assigned',
      title: `${user.name} assigned you a task`,
      body: title,
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
      title: `${user.name} completed a task you raised`,
      body: title,
    })
  }

  const updated = await env.DB.prepare(`${SELECT_TASK} WHERE t.id = ?`)
    .bind(id)
    .first<TaskRow>()
  return json({ ...updated, actions: allowedTaskActions(updated!, actor) })
}

export async function deleteTask(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const user = await requireUser(request, env)
  const actor = actorFor(user)
  const task = await loadTask(env, id)
  if (!canTask('delete', task, actor)) {
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
     FROM tasks WHERE assignee_id = ?`,
  )
    .bind(today(env), user.id)
    .first<{ open: number | null; overdue: number | null }>()
  return json({ open: row?.open ?? 0, overdue: row?.overdue ?? 0 })
}
