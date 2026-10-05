import { describe, it, expect } from 'vitest'
import {
  OPEN_TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_VIOLATION_DAYS,
  allowedTaskActions,
  canTask,
  canViewTask,
  completionStamp,
  formatElapsed,
  isOpen,
  isOverdue,
  isTaskStale,
  parseDueDate,
  parseTaskPriority,
  parseTaskStatus,
  type TaskActor,
  type TaskLike,
} from '../shared/tasks'

const TODAY = '2026-08-07'

const stranger: TaskActor = { id: 'stranger', is_admin: false, can_manage: false, can_delete: false }
const raiser: TaskActor = { id: 'raiser', is_admin: false, can_manage: false, can_delete: false }
const doer: TaskActor = { id: 'doer', is_admin: false, can_manage: false, can_delete: false }
const manager: TaskActor = { id: 'manager', is_admin: false, can_manage: true, can_delete: false }
const admin: TaskActor = { id: 'admin', is_admin: true, can_manage: false, can_delete: true }

/** Raised by `raiser`, given to `doer`. */
const task: TaskLike = { assignee_id: 'doer', created_by: 'raiser', status: 'todo' }

describe('task vocabulary', () => {
  it('labels every status and priority, so none renders as a raw key', () => {
    for (const s of TASK_STATUSES) expect(TASK_STATUS_LABELS[s]).toBeTruthy()
    for (const p of TASK_PRIORITIES) expect(TASK_PRIORITY_LABELS[p]).toBeTruthy()
  })

  it('counts only unfinished work as open', () => {
    expect(OPEN_TASK_STATUSES).toEqual(['todo', 'in_progress'])
    expect(isOpen('todo')).toBe(true)
    expect(isOpen('in_progress')).toBe(true)
    expect(isOpen('done')).toBe(false)
    expect(isOpen('cancelled')).toBe(false)
  })

  it('accepts known values and refuses anything else', () => {
    expect(parseTaskStatus('done')).toBe('done')
    expect(parseTaskStatus('finished')).toBeNull()
    expect(parseTaskPriority('high')).toBe('high')
    expect(parseTaskPriority('urgent')).toBeNull()
  })
})

describe('allowedTaskActions', () => {
  it('lets whoever raised it reword and move it, but not delete it', () => {
    // It has been given to someone else, so it is a record of what was asked.
    expect(allowedTaskActions(task, raiser).sort()).toEqual(['edit', 'set_status'])
    expect(canTask('delete', task, raiser)).toBe(false)
  })

  it('lets the assignee move it along but not rewrite it', () => {
    // Otherwise "do X" could quietly become "do Y" and then be marked done.
    const actions = allowedTaskActions(task, doer)
    expect(actions).toEqual(['set_status'])
    expect(canTask('edit', task, doer)).toBe(false)
    expect(canTask('delete', task, doer)).toBe(false)
  })

  it('lets a task manager organise but not delete', () => {
    // manage_tasks deliberately does not carry the irreversible action.
    expect(allowedTaskActions(task, manager).sort()).toEqual(['edit', 'set_status'])
  })

  it('gives an admin full control', () => {
    expect(allowedTaskActions(task, admin).sort()).toEqual([
      'delete',
      'edit',
      'set_status',
    ])
  })

  it('lets the delete_tasks holder delete work given to someone else', () => {
    const deleter: TaskActor = {
      id: 'deleter',
      is_admin: false,
      can_manage: false,
      can_delete: true,
    }
    expect(canTask('delete', task, deleter)).toBe(true)
  })

  it('gives an unrelated person nothing at all', () => {
    expect(allowedTaskActions(task, stranger)).toEqual([])
  })

  it('does not grant anything from a null assignee or creator', () => {
    // A task nobody owns must not become editable by someone whose id is
    // also absent — the comparison has to reject null, not match it.
    const orphan: TaskLike = { assignee_id: null, created_by: null, status: 'todo' }
    const nobody: TaskActor = { id: '', is_admin: false, can_manage: false, can_delete: false }
    expect(allowedTaskActions(orphan, nobody)).toEqual([])
  })
})

describe('canViewTask', () => {
  it('shows a task to the person it is for and the person who raised it', () => {
    expect(canViewTask(task, doer)).toBe(true)
    expect(canViewTask(task, raiser)).toBe(true)
  })

  it('hides it from everyone else', () => {
    expect(canViewTask(task, stranger)).toBe(false)
  })

  it('shows everything to a task manager and an admin', () => {
    expect(canViewTask(task, manager)).toBe(true)
    expect(canViewTask(task, admin)).toBe(true)
  })
})

describe('completionStamp', () => {
  const NOW = '2026-08-07T10:00:00.000Z'

  it('stamps the moment a task first finishes', () => {
    expect(completionStamp('done', 'todo', null, NOW)).toBe(NOW)
  })

  it('keeps the original time when an already-done task is saved again', () => {
    const earlier = '2026-08-01T09:00:00.000Z'
    expect(completionStamp('done', 'done', earlier, NOW)).toBe(earlier)
  })

  it('clears it when a finished task is reopened', () => {
    expect(completionStamp('todo', 'done', NOW, NOW)).toBeNull()
  })

  it('leaves it unset for a task that was never finished', () => {
    expect(completionStamp('in_progress', 'todo', null, NOW)).toBeNull()
  })

  it('clears it when a done task is cancelled', () => {
    expect(completionStamp('cancelled', 'done', NOW, NOW)).toBeNull()
  })
})

describe('parseDueDate', () => {
  it('accepts a full date', () => {
    expect(parseDueDate('2026-08-07')).toBe('2026-08-07')
  })

  it('treats blank, null and absent as no date rather than an error', () => {
    expect(parseDueDate('')).toBeNull()
    expect(parseDueDate(null)).toBeNull()
    expect(parseDueDate(undefined)).toBeNull()
  })

  it('signals invalid separately from empty, so the API can refuse it', () => {
    expect(parseDueDate('07/08/2026')).toBeUndefined()
    expect(parseDueDate('2026-13-01')).toBeUndefined()
    expect(parseDueDate('tomorrow')).toBeUndefined()
  })
})

describe('isOverdue', () => {
  it('flags an open task whose date has passed', () => {
    expect(isOverdue({ status: 'todo', due_date: '2026-08-06' }, TODAY)).toBe(true)
  })

  it('does not flag one due today', () => {
    expect(isOverdue({ status: 'todo', due_date: TODAY }, TODAY)).toBe(false)
  })

  it('never flags a finished or cancelled task', () => {
    expect(isOverdue({ status: 'done', due_date: '2026-01-01' }, TODAY)).toBe(false)
    expect(isOverdue({ status: 'cancelled', due_date: '2026-01-01' }, TODAY)).toBe(false)
  })

  it('never flags an undated task', () => {
    expect(isOverdue({ status: 'todo', due_date: null }, TODAY)).toBe(false)
  })
})

describe('isTaskStale', () => {
  const DAY_MS = 24 * 60 * 60 * 1000
  const now = new Date('2026-08-07T12:00:00Z').getTime()

  it('is 5 days', () => {
    expect(TASK_VIOLATION_DAYS).toBe(5)
  })

  it('does not flag a task touched less than 5 days ago', () => {
    const updated_at = new Date(now - 4 * DAY_MS).toISOString()
    expect(isTaskStale({ status: 'todo', updated_at, created_at: updated_at }, now)).toBe(false)
  })

  it('flags a task untouched for exactly 5 days', () => {
    const updated_at = new Date(now - 5 * DAY_MS).toISOString()
    expect(isTaskStale({ status: 'in_progress', updated_at, created_at: updated_at }, now)).toBe(true)
  })

  it('flags a task untouched for more than 5 days', () => {
    const updated_at = new Date(now - 10 * DAY_MS).toISOString()
    expect(isTaskStale({ status: 'todo', updated_at, created_at: updated_at }, now)).toBe(true)
  })

  it('never flags done or cancelled tasks, no matter how old', () => {
    const updated_at = new Date(now - 30 * DAY_MS).toISOString()
    expect(isTaskStale({ status: 'done', updated_at, created_at: updated_at }, now)).toBe(false)
    expect(isTaskStale({ status: 'cancelled', updated_at, created_at: updated_at }, now)).toBe(false)
  })

  it('falls back to created_at when updated_at is missing', () => {
    const created_at = new Date(now - 6 * DAY_MS).toISOString()
    expect(isTaskStale({ status: 'todo', updated_at: null, created_at }, now)).toBe(true)
  })

  it('parses the space-separated SQLite datetime format as UTC, not local time', () => {
    // datetime('now') in SQLite returns "YYYY-MM-DD HH:MM:SS" (UTC, no 'Z').
    // Six days ago, formatted that way, must still read as stale.
    const d = new Date(now - 6 * DAY_MS)
    const sqliteFormat = d.toISOString().slice(0, 19).replace('T', ' ')
    expect(isTaskStale({ status: 'todo', updated_at: sqliteFormat, created_at: sqliteFormat }, now)).toBe(true)
  })

  it('resets to not-stale once the task is touched (ping/reopen bump updated_at)', () => {
    const staleUpdatedAt = new Date(now - 10 * DAY_MS).toISOString()
    expect(isTaskStale({ status: 'todo', updated_at: staleUpdatedAt, created_at: staleUpdatedAt }, now)).toBe(true)
    const freshUpdatedAt = new Date(now - 1 * DAY_MS).toISOString()
    expect(isTaskStale({ status: 'todo', updated_at: freshUpdatedAt, created_at: staleUpdatedAt }, now)).toBe(false)
  })
})

describe('deleting your own to-do', () => {
  const plain: TaskActor = {
    id: 'raiser',
    is_admin: false,
    can_manage: false,
    can_delete: false,
  }

  it('lets you delete a task you raised for yourself', () => {
    const mine: TaskLike = {
      assignee_id: 'raiser',
      created_by: 'raiser',
      status: 'todo',
    }
    expect(canTask('delete', mine, plain)).toBe(true)
  })

  it('lets you delete one you raised that nobody has picked up', () => {
    const unclaimed: TaskLike = {
      assignee_id: null,
      created_by: 'raiser',
      status: 'todo',
    }
    expect(canTask('delete', unclaimed, plain)).toBe(true)
  })

  it('stops you deleting it the moment it is given to someone else', () => {
    // This is the boundary: once assigned, the task records what was asked of
    // another person, so removing it takes the right.
    const handedOver: TaskLike = {
      assignee_id: 'doer',
      created_by: 'raiser',
      status: 'todo',
    }
    expect(canTask('delete', handedOver, plain)).toBe(false)
  })

  it('does not let the assignee delete work given to them', () => {
    const mine: TaskLike = { assignee_id: 'doer', created_by: 'raiser', status: 'todo' }
    const assignee: TaskActor = {
      id: 'doer',
      is_admin: false,
      can_manage: false,
      can_delete: false,
    }
    expect(canTask('delete', mine, assignee)).toBe(false)
  })

  it('does not let someone delete a self-assigned task they did not raise', () => {
    const someoneElses: TaskLike = {
      assignee_id: 'raiser',
      created_by: 'other',
      status: 'todo',
    }
    expect(canTask('delete', someoneElses, plain)).toBe(false)
  })
})

describe('broadcast ("Everyone") tasks', () => {
  const open: TaskLike = {
    assignee_id: null,
    created_by: 'raiser',
    status: 'todo',
    broadcast: true,
  }

  it('lets any unrelated person accept an unclaimed pool task', () => {
    expect(canTask('accept', open, stranger)).toBe(true)
  })

  it('lets the person who raised it accept their own pool task too', () => {
    expect(canTask('accept', open, raiser)).toBe(true)
  })

  it('closes once someone has claimed it', () => {
    const claimed: TaskLike = { ...open, assignee_id: 'doer' }
    expect(canTask('accept', claimed, stranger)).toBe(false)
    // Claiming hands them the normal assignee power to move it along.
    expect(canTask('set_status', claimed, doer)).toBe(true)
  })

  it('is never offered on a task nobody opened to everyone', () => {
    const normal: TaskLike = { assignee_id: null, created_by: 'raiser', status: 'todo' }
    expect(canTask('accept', normal, stranger)).toBe(false)
  })

  it('is never offered once the task is finished or cancelled', () => {
    expect(canTask('accept', { ...open, status: 'done' }, stranger)).toBe(false)
    expect(canTask('accept', { ...open, status: 'cancelled' }, stranger)).toBe(false)
  })

  it('is visible to anyone while unclaimed, unlike a private task', () => {
    expect(canViewTask(open, stranger)).toBe(true)
  })

  it('stays visible to everyone once claimed, so the board shows who has it', () => {
    const claimed: TaskLike = { ...open, assignee_id: 'doer' }
    expect(canViewTask(claimed, stranger)).toBe(true)
  })
})

describe('formatElapsed', () => {
  const HOUR = 60 * 60 * 1000
  const DAY = 24 * HOUR

  it('reads distinctly under an hour rather than "0 hours so far"', () => {
    expect(formatElapsed(30 * 60 * 1000)).toBe('less than an hour so far')
  })

  it('uses singular "hour" for exactly one', () => {
    expect(formatElapsed(1 * HOUR)).toBe('1 hour so far')
  })

  it('pluralizes hours', () => {
    expect(formatElapsed(4 * HOUR)).toBe('4 hours so far')
  })

  it('rounds to the nearest hour', () => {
    expect(formatElapsed(4.4 * HOUR)).toBe('4 hours so far')
    expect(formatElapsed(4.6 * HOUR)).toBe('5 hours so far')
  })

  it('switches to days at 24 hours', () => {
    expect(formatElapsed(24 * HOUR)).toBe('1 day so far')
  })

  it('uses singular "day" for exactly one', () => {
    expect(formatElapsed(1 * DAY)).toBe('1 day so far')
  })

  it('pluralizes days', () => {
    expect(formatElapsed(2 * DAY)).toBe('2 days so far')
  })

  it('does not land on "24 hours" for something that rounds up to a full day', () => {
    // 23.6h rounds to 24 in the hour branch — must fall through to days instead.
    expect(formatElapsed(23.6 * HOUR)).toBe('1 day so far')
  })
})
