import { describe, expect, it } from 'vitest'
import { taskShortPath, taskShortUrl } from '../src/taskLink'

describe('task short links', () => {
  it('uses the task code when there is one', () => {
    expect(taskShortPath({ id: 'abc', title: 'x', task_code: 'TASK-007' })).toBe('/t/TASK-007')
  })

  it('falls back to the id route without a code', () => {
    expect(taskShortPath({ id: 'abc', title: 'x', task_code: null })).toBe('/tasks/abc')
  })

  it('builds an absolute URL on the given origin', () => {
    expect(
      taskShortUrl({ id: 'abc', title: 'x', task_code: 'TASK-7' }, 'https://dem.trace365.net'),
    ).toBe('https://dem.trace365.net/t/TASK-7')
  })
})
