import { describe, it, expect } from 'vitest'
import { formatDayHeading, groupByDay } from '../src/dates'

interface Row {
  date: string
  hours: number
}

describe('groupByDay', () => {
  it('keeps a single entry as its own one-row group', () => {
    const rows: Row[] = [{ date: '2026-08-07', hours: 8 }]
    const groups = groupByDay(rows, (r) => r.date, (r) => r.hours)
    expect(groups).toEqual([{ date: '2026-08-07', rows, totalHours: 8 }])
  })

  it('groups two entries on the same day into one group, not two', () => {
    const a: Row = { date: '2026-08-07', hours: 3 }
    const b: Row = { date: '2026-08-07', hours: 5 }
    const groups = groupByDay([a, b], (r) => r.date, (r) => r.hours)
    expect(groups).toHaveLength(1)
    expect(groups[0].rows).toEqual([a, b])
    expect(groups[0].totalHours).toBe(8)
  })

  it('keeps different days as separate groups, in first-seen order', () => {
    const rows: Row[] = [
      { date: '2026-08-09', hours: 8 },
      { date: '2026-08-07', hours: 3 },
      { date: '2026-08-07', hours: 5 },
    ]
    const groups = groupByDay(rows, (r) => r.date, (r) => r.hours)
    expect(groups.map((g) => g.date)).toEqual(['2026-08-09', '2026-08-07'])
    expect(groups[1].totalHours).toBe(8)
  })

  it('rounds the daily total to two decimal places', () => {
    const rows: Row[] = [
      { date: '2026-08-07', hours: 0.1 },
      { date: '2026-08-07', hours: 0.2 },
    ]
    const groups = groupByDay(rows, (r) => r.date, (r) => r.hours)
    // 0.1 + 0.2 !== 0.3 in floating point without rounding.
    expect(groups[0].totalHours).toBe(0.3)
  })

  it('returns nothing for an empty list', () => {
    expect(groupByDay([], (r: Row) => r.date, (r: Row) => r.hours)).toEqual([])
  })
})

describe('formatDayHeading', () => {
  it('reads the weekday from the date itself, not the local time zone', () => {
    // 2026-08-07 is a Friday.
    expect(formatDayHeading('2026-08-07')).toBe('Fri, Aug 7, 2026')
  })
})
