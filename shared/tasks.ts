// Task rules shared by the Worker API, the client, and tests.
// Pure functions only — no DB, no fetch. The API is the enforcement point;
// the client uses the same helpers so the UI never offers an action the
// server would reject.

export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
}

/** Statuses that still want somebody's attention. Drives the counters. */
export const OPEN_TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress']

export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
}

export function parseTaskStatus(value: unknown): TaskStatus | null {
  const s = String(value ?? '')
  return (TASK_STATUSES as readonly string[]).includes(s) ? (s as TaskStatus) : null
}

export function parseTaskPriority(value: unknown): TaskPriority | null {
  const s = String(value ?? '')
  return (TASK_PRIORITIES as readonly string[]).includes(s) ? (s as TaskPriority) : null
}

export function isOpen(status: TaskStatus): boolean {
  return OPEN_TASK_STATUSES.includes(status)
}

// ------------------------------------------------------------- permissions

/** What the acting user is to one task. */
export interface TaskActor {
  id: string
  is_admin: boolean
  /** Holds `manage_tasks`: may assign to anyone and see everyone's tasks. */
  can_manage: boolean
  /**
   * Holds `delete_tasks`: may delete a task that has been given to someone
   * else. Separate from `can_manage` on purpose — organising work and
   * destroying the record of it are different powers, and only one of them
   * cannot be undone. Deleting your own private to-do needs none of this.
   */
  can_delete: boolean
}

export interface TaskLike {
  assignee_id: string | null
  created_by: string | null
  status: TaskStatus
}

export type TaskAction = 'edit' | 'delete' | 'set_status'

/**
 * Everything the user may do to this task.
 *
 * Relationships are deliberately unequal: a manager of tasks may organise
 * anything; whoever raised a task may reword it; whoever it was given to may
 * move it along but not rewrite what they were asked to do.
 *
 * Deletion is not on that ladder. Removing your own note to self is
 * housekeeping, so anyone may do it; but once work has been handed to somebody
 * else the task is a record of what was asked of them, and destroying it takes
 * the `delete_tasks` right. `manage_tasks` deliberately does not carry it —
 * organising work and erasing it are different powers, and only one cannot be
 * undone. Cancelling is the reversible way to retire work either way.
 */
export function allowedTaskActions(task: TaskLike, actor: TaskActor): TaskAction[] {
  const actions = new Set<TaskAction>()
  const manages = actor.is_admin || actor.can_manage

  if (manages) {
    actions.add('edit')
    actions.add('set_status')
  }
  if (task.created_by && task.created_by === actor.id) {
    actions.add('edit')
    actions.add('set_status')
  }
  // The assignee owns progress, not wording — otherwise "do X" could quietly
  // become "do Y" and then be marked done.
  if (task.assignee_id && task.assignee_id === actor.id) {
    actions.add('set_status')
  }
  if (actor.is_admin || actor.can_delete || isOwnPrivateTask(task, actor)) {
    actions.add('delete')
  }
  return [...actions]
}

/**
 * A task the actor raised that has not been given to anybody else — either
 * still unassigned, or assigned to themselves. This is the "own to-do" case
 * that needs no right to delete.
 */
function isOwnPrivateTask(task: TaskLike, actor: TaskActor): boolean {
  if (!task.created_by || task.created_by !== actor.id) return false
  return task.assignee_id === null || task.assignee_id === actor.id
}

export function canTask(action: TaskAction, task: TaskLike, actor: TaskActor): boolean {
  return allowedTaskActions(task, actor).includes(action)
}

/** May this user see the task at all? */
export function canViewTask(task: TaskLike, actor: TaskActor): boolean {
  if (actor.is_admin || actor.can_manage) return true
  return task.assignee_id === actor.id || task.created_by === actor.id
}

/**
 * `completed_at` for a status change: stamped when a task first finishes, and
 * cleared if it is reopened, so the field always answers "when did this
 * finish" rather than "when was it last touched".
 */
export function completionStamp(
  next: TaskStatus,
  previous: TaskStatus,
  existing: string | null,
  now: string,
): string | null {
  if (next === 'done') return previous === 'done' ? existing : now
  return null
}

const DUE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export function parseDueDate(value: unknown): string | null | undefined {
  if (value === null || value === '' || value === undefined) return null
  const s = String(value)
  return DUE_RE.test(s) ? s : undefined // undefined signals "invalid"
}

/** Open, dated, and the date has passed. Drives the overdue marker. */
export function isOverdue(
  task: { status: TaskStatus; due_date: string | null },
  today: string,
): boolean {
  return isOpen(task.status) && task.due_date !== null && task.due_date < today
}
