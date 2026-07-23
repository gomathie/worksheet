import { describe, it, expect } from 'vitest'
import {
  computeHours,
  computePoints,
  computeRemuneration,
  aggregateMonthly,
  parseTime,
  type RateSettings,
} from '../shared/logic'

const rates: RateSettings = {
  points_per_classification: 1,
  points_per_qap: 1,
  point_value: 1,
  currency: '$',
}

describe('parseTime', () => {
  it('parses valid times', () => {
    expect(parseTime('00:00')).toBe(0)
    expect(parseTime('9:30')).toBe(570)
    expect(parseTime('23:59')).toBe(1439)
  })
  it('rejects malformed times', () => {
    expect(() => parseTime('24:00')).toThrow()
    expect(() => parseTime('12:60')).toThrow()
    expect(() => parseTime('noon')).toThrow()
    expect(() => parseTime('')).toThrow()
  })
})

describe('computeHours', () => {
  it('computes a normal day shift', () => {
    expect(computeHours('09:00', '17:00')).toBe(8)
  })
  it('handles minutes and rounds to 2 decimals', () => {
    expect(computeHours('09:15', '17:35')).toBe(8.33)
    expect(computeHours('09:00', '09:10')).toBe(0.17)
  })
  it('treats end < start as overnight (+24h)', () => {
    expect(computeHours('22:00', '06:00')).toBe(8)
    expect(computeHours('23:30', '00:15')).toBe(0.75)
  })
  it('returns 0 when start equals end', () => {
    expect(computeHours('08:00', '08:00')).toBe(0)
  })
})

describe('points & remuneration', () => {
  it('applies default 1/1/1 rates', () => {
    expect(computePoints(3, 2, rates)).toBe(5)
    expect(computeRemuneration(5, rates)).toBe(5)
  })
  it('applies custom rates', () => {
    const custom: RateSettings = {
      points_per_classification: 2,
      points_per_qap: 3,
      point_value: 0.5,
      currency: '₵',
    }
    const points = computePoints(4, 2, custom) // 8 + 6
    expect(points).toBe(14)
    expect(computeRemuneration(points, custom)).toBe(7)
  })
})

describe('aggregateMonthly', () => {
  const employees = [
    { id: 'a', name: 'Ama' },
    { id: 'b', name: 'Kojo' },
  ]
  const entries = [
    { employee_id: 'a', work_date: '2026-07-01', hours: 8, classifications: 3, qap: 1 },
    { employee_id: 'a', work_date: '2026-07-01', hours: 2, classifications: 1, qap: 0 },
    { employee_id: 'a', work_date: '2026-07-02', hours: 7.5, classifications: 0, qap: 2 },
    { employee_id: 'b', work_date: '2026-07-02', hours: 6, classifications: 5, qap: 0 },
  ]

  it('aggregates totals, per-person, and daily breakdowns', () => {
    const r = aggregateMonthly('2026-07', entries, employees, rates)

    expect(r.totals).toEqual({
      hours: 23.5,
      classifications: 9,
      qap: 3,
      points: 12,
      remuneration: 12,
      days_worked: 2,
    })

    expect(r.per_person).toHaveLength(2)
    const ama = r.per_person.find((p) => p.employee_id === 'a')!
    expect(ama).toMatchObject({
      name: 'Ama',
      days_worked: 2, // two distinct dates despite three entries
      hours: 17.5,
      classifications: 4,
      qap: 3,
      points: 7,
      remuneration: 7,
    })

    expect(r.daily_totals).toEqual([
      { date: '2026-07-01', hours: 10, classifications: 4, qap: 1 },
      { date: '2026-07-02', hours: 13.5, classifications: 5, qap: 2 },
    ])
  })

  it('applies point_value to remuneration in summaries', () => {
    const custom: RateSettings = { ...rates, point_value: 2.5 }
    const r = aggregateMonthly('2026-07', entries, employees, custom)
    expect(r.totals.points).toBe(12)
    expect(r.totals.remuneration).toBe(30)
  })

  it('handles an empty month', () => {
    const r = aggregateMonthly('2026-08', [], employees, rates)
    expect(r.totals).toEqual({
      hours: 0,
      classifications: 0,
      qap: 0,
      points: 0,
      remuneration: 0,
      days_worked: 0,
    })
    expect(r.per_person).toEqual([])
    expect(r.daily_totals).toEqual([])
  })
})
