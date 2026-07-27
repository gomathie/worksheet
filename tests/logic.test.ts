import { describe, it, expect } from 'vitest'
import {
  computeHours,
  computePoints,
  computeRemuneration,
  aggregateMonthly,
  parseTime,
  type RateSettings,
  type WorkType,
} from '../shared/logic'

const rates: RateSettings = { point_value: 1, currency: '$' }

const workTypes: WorkType[] = [
  { id: 'wt-classification', name: 'Classification', points_per_unit: 1 },
  { id: 'wt-qap', name: 'QAP', points_per_unit: 1 },
]

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
  it('applies 1-point-per-unit rates', () => {
    expect(
      computePoints({ 'wt-classification': 3, 'wt-qap': 2 }, workTypes),
    ).toBe(5)
    expect(computeRemuneration(5, rates)).toBe(5)
  })
  it('applies custom per-type rates and point value', () => {
    const custom: WorkType[] = [
      { id: 'wt-classification', name: 'Classification', points_per_unit: 2 },
      { id: 'wt-qap', name: 'QAP', points_per_unit: 3 },
      { id: 'wt-design', name: 'Graphic design', points_per_unit: 5 },
    ]
    const points = computePoints(
      { 'wt-classification': 4, 'wt-qap': 2, 'wt-design': 1 },
      custom,
    ) // 8 + 6 + 5
    expect(points).toBe(19)
    expect(computeRemuneration(points, { point_value: 0.5, currency: '₵' })).toBe(9.5)
  })
  it('ignores units for unknown work types', () => {
    expect(computePoints({ ghost: 10 }, workTypes)).toBe(0)
  })
  it('applies per-employee rate overrides over the general rate', () => {
    const units = { 'wt-classification': 4, 'wt-qap': 2 }
    // Override classification to 3 pts; QAP keeps its general 1 pt.
    expect(computePoints(units, workTypes, { 'wt-classification': 3 })).toBe(14)
  })
})

describe('aggregateMonthly with rate overrides', () => {
  it('uses each employee’s own rates', () => {
    const emps = [
      { id: 'a', name: 'Ama', rate_overrides: { 'wt-classification': 2 } },
      { id: 'b', name: 'Kojo' },
    ]
    const entries = [
      {
        employee_id: 'a',
        work_date: '2026-07-01',
        hours: 8,
        units: { 'wt-classification': 3 },
      },
      {
        employee_id: 'b',
        work_date: '2026-07-01',
        hours: 8,
        units: { 'wt-classification': 3 },
      },
    ]
    const r = aggregateMonthly('2026-07', entries, emps, workTypes, rates)
    expect(r.per_person.find((p) => p.employee_id === 'a')!.points).toBe(6)
    expect(r.per_person.find((p) => p.employee_id === 'b')!.points).toBe(3)
    expect(r.totals.points).toBe(9)
  })
})

describe('aggregateMonthly', () => {
  const employees = [
    { id: 'a', name: 'Ama' },
    { id: 'b', name: 'Kojo' },
  ]
  const entries = [
    {
      employee_id: 'a',
      work_date: '2026-07-01',
      hours: 8,
      units: { 'wt-classification': 3, 'wt-qap': 1 },
    },
    {
      employee_id: 'a',
      work_date: '2026-07-01',
      hours: 2,
      units: { 'wt-classification': 1 },
    },
    { employee_id: 'a', work_date: '2026-07-02', hours: 7.5, units: { 'wt-qap': 2 } },
    {
      employee_id: 'b',
      work_date: '2026-07-02',
      hours: 6,
      units: { 'wt-classification': 5 },
    },
  ]

  it('aggregates totals, per-person, and daily breakdowns', () => {
    const r = aggregateMonthly('2026-07', entries, employees, workTypes, rates)

    expect(r.totals).toEqual({
      hours: 23.5,
      units: { 'wt-classification': 9, 'wt-qap': 3 },
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
      units: { 'wt-classification': 4, 'wt-qap': 3 },
      points: 7,
      remuneration: 7,
    })

    expect(r.daily_totals).toEqual([
      {
        date: '2026-07-01',
        hours: 10,
        units: { 'wt-classification': 4, 'wt-qap': 1 },
      },
      {
        date: '2026-07-02',
        hours: 13.5,
        units: { 'wt-classification': 5, 'wt-qap': 2 },
      },
    ])
  })

  it('applies point_value to remuneration in summaries', () => {
    const r = aggregateMonthly('2026-07', entries, employees, workTypes, {
      point_value: 2.5,
      currency: '$',
    })
    expect(r.totals.points).toBe(12)
    expect(r.totals.remuneration).toBe(30)
  })

  it('handles an empty month', () => {
    const r = aggregateMonthly('2026-08', [], employees, workTypes, rates)
    expect(r.totals).toEqual({
      hours: 0,
      units: {},
      points: 0,
      remuneration: 0,
      days_worked: 0,
    })
    expect(r.per_person).toEqual([])
    expect(r.daily_totals).toEqual([])
  })
})
