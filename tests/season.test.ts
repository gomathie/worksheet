import { describe, expect, it } from 'vitest'
import { isFestiveSeason } from '../shared/season'

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12)

describe('isFestiveSeason', () => {
  it.each([
    [d(2026, 11, 1), true],
    [d(2026, 12, 25), true],
    [d(2027, 1, 1), true],
    [d(2027, 1, 9), true],
    [d(2027, 1, 10), false],
    [d(2027, 6, 15), false],
    [d(2026, 10, 31), false],
  ])('%s -> %s', (date, expected) => {
    expect(isFestiveSeason(date)).toBe(expected)
  })
})
