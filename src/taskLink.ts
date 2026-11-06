import type { Task } from './types'

type Linkable = Pick<Task, 'id' | 'title' | 'task_code'>

/** Short link by code (/t/TASK-007), falling back to the id route. */
export function taskShortPath(task: Linkable): string {
  return task.task_code ? `/t/${task.task_code}` : `/tasks/${task.id}`
}

export function taskShortUrl(task: Linkable, origin = window.location.origin): string {
  return origin + taskShortPath(task)
}

/**
 * Opens the native share sheet where there is one (phones, the PWA) and
 * otherwise copies the link. Resolves to what happened so the caller can
 * confirm it; a dismissed share sheet is not an error.
 */
export async function shareTask(task: Linkable): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = taskShortUrl(task)
  const title = task.task_code ? `${task.task_code}: ${task.title}` : task.title
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text: title, url })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}
