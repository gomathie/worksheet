import { describe, it, expect } from 'vitest'
import {
  computeHours,
  computePoints,
  computeRemuneration,
  aggregateMonthly,
  normalizeCardName,
  groupCardAudit,
  hasSameDayDuplicate,
  findSameDayCardClashes,
  shiftIsInFuture,
  addOneDay,
  FUTURE_GRACE_MINUTES,
  type CardAuditRow,
  parseTime,
  type RateSettings,
  type WorkType,
} from '../shared/logic'

const rates: RateSettings = { point_value: 1, currency: '$', max_entries_per_day: 0, require_entry_approval: 0 }

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

describe('addOneDay', () => {
  it('advances the date, including across month/year boundaries', () => {
    expect(addOneDay('2026-08-11')).toBe('2026-08-12')
    expect(addOneDay('2026-01-31')).toBe('2026-02-01')
    expect(addOneDay('2026-12-31')).toBe('2027-01-01')
  })
})

describe('shiftIsInFuture', () => {
  it('is false for a shift that already finished, same day', () => {
    expect(shiftIsInFuture('2026-08-11', '09:00', '10:00', '2026-08-11', '10:30')).toBe(false)
  })
  it('is false for any shift on a past work_date, regardless of time', () => {
    expect(shiftIsInFuture('2026-08-10', '09:00', '23:59', '2026-08-11', '00:01')).toBe(false)
  })
  it('is true for a work_date after today', () => {
    expect(shiftIsInFuture('2026-08-12', '09:00', '17:00', '2026-08-11', '10:00')).toBe(true)
  })
  it('is true for an end time well past now, same day', () => {
    expect(shiftIsInFuture('2026-08-11', '09:00', '17:00', '2026-08-11', '10:00')).toBe(true)
  })
  it('allows up to FUTURE_GRACE_MINUTES past now, same day', () => {
    // now = 10:00, end = 10:59 -> 59 minutes ahead, within the grace window
    expect(shiftIsInFuture('2026-08-11', '09:00', '10:59', '2026-08-11', '10:00')).toBe(false)
    expect(FUTURE_GRACE_MINUTES).toBe(60)
    // exactly on the boundary is still allowed ("more than", not "at least")
    expect(shiftIsInFuture('2026-08-11', '09:00', '11:00', '2026-08-11', '10:00')).toBe(false)
    // one minute past the boundary is not
    expect(shiftIsInFuture('2026-08-11', '09:00', '11:01', '2026-08-11', '10:00')).toBe(true)
  })
  it('treats end < start as an overnight shift finishing the next day', () => {
    // Logged for 2026-08-11 22:00 -> 06:00; if "now" is 2026-08-11 23:00,
    // the shift hasn't reached its (next-day) finish time yet.
    expect(shiftIsInFuture('2026-08-11', '22:00', '06:00', '2026-08-11', '23:00')).toBe(true)
    // Once it's actually the 12th and past 06:00, it has finished.
    expect(shiftIsInFuture('2026-08-11', '22:00', '06:00', '2026-08-12', '07:00')).toBe(false)
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
    expect(
      computeRemuneration(points, { point_value: 0.5, currency: '₵', max_entries_per_day: 0, require_entry_approval: 0 }),
    ).toBe(9.5)
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
      max_entries_per_day: 0,
      require_entry_approval: 0,
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

describe('normalizeCardName', () => {
  it('folds the spaced form onto the underscore convention', () => {
    expect(normalizeCardName('Boost us')).toBe('Boost_us')
    expect(normalizeCardName('Carphonewarehouse gb')).toBe('Carphonewarehouse_gb')
  })

  it('leaves an already-correct name untouched', () => {
    expect(normalizeCardName('Boost_us')).toBe('Boost_us')
    expect(normalizeCardName('Currys')).toBe('Currys')
  })

  it('collapses runs of whitespace to a single underscore', () => {
    expect(normalizeCardName('Orange   es')).toBe('Orange_es')
    expect(normalizeCardName('Orange\tes')).toBe('Orange_es')
  })

  it('trims the edges rather than turning them into underscores', () => {
    expect(normalizeCardName('  Amazon fr  ')).toBe('Amazon_fr')
  })

  it('preserves case, so Amazon_us and amazon_us stay distinct', () => {
    expect(normalizeCardName('PBTECH nz')).toBe('PBTECH_nz')
  })

  it('returns empty for blank input so the caller can reject it', () => {
    expect(normalizeCardName('   ')).toBe('')
    expect(normalizeCardName(undefined)).toBe('')
    expect(normalizeCardName(null)).toBe('')
  })

  it('caps the length after folding', () => {
    expect(normalizeCardName('a'.repeat(200))).toHaveLength(120)
  })
})

describe('groupCardAudit', () => {
  const row = (
    card_name: string,
    work_type_id: string,
    employee_name: string,
    work_date: string,
  ): CardAuditRow => ({
    card_name,
    work_type_id,
    work_type_name: work_type_id === 'wt-qap' ? 'QAP' : 'Classification',
    employee_id: employee_name.toLowerCase(),
    employee_name,
    work_date,
    total_audits: 10,
    time_completed: null,
    entry_id: `${employee_name}-${work_date}`,
  })

  it('groups every logging of a card together', () => {
    const g = groupCardAudit([
      row('Alza_cz', 'wt-classification', 'Ama', '2026-08-01'),
      row('Alza_cz', 'wt-qap', 'Kojo', '2026-08-02'),
      row('Boost_us', 'wt-qap', 'Ama', '2026-08-03'),
    ])
    expect(g).toHaveLength(2)
    expect(g.find((x) => x.card_name === 'Alza_cz')!.rows).toHaveLength(2)
  })

  it('does not flag the normal case: classified once, QAP\u2019d once', () => {
    const g = groupCardAudit([
      row('Alza_cz', 'wt-classification', 'Ama', '2026-08-01'),
      row('Alza_cz', 'wt-qap', 'Kojo', '2026-08-02'),
    ])
    expect(g[0].repeats).toEqual([])
  })

  it('flags the same work type logged twice, naming both people', () => {
    const g = groupCardAudit([
      row('Target_us', 'wt-classification', 'Ama', '2026-08-01'),
      row('Target_us', 'wt-classification', 'Kojo', '2026-08-05'),
    ])
    expect(g[0].repeats).toEqual([
      {
        work_type_name: 'Classification',
        times: 2,
        people: ['Ama', 'Kojo'],
        // Different days — could be rework, so not a same-day duplicate.
        same_day_dates: [],
      },
    ])
    expect(hasSameDayDuplicate(g[0])).toBe(false)
  })

  it('records the date when the same work type is logged twice in one day', () => {
    const g = groupCardAudit([
      row('Target_us', 'wt-classification', 'Ama', '2026-08-01'),
      row('Target_us', 'wt-classification', 'Kojo', '2026-08-01'),
    ])
    expect(g[0].repeats[0].same_day_dates).toEqual(['2026-08-01'])
    expect(hasSameDayDuplicate(g[0])).toBe(true)
  })

  it('flags QAP twice in a day just as it flags Classification', () => {
    const g = groupCardAudit([
      row('Target_us', 'wt-qap', 'Ama', '2026-08-01'),
      row('Target_us', 'wt-qap', 'Ama', '2026-08-01'),
    ])
    expect(g[0].repeats[0]).toMatchObject({
      work_type_name: 'QAP',
      same_day_dates: ['2026-08-01'],
    })
  })

  it('does not treat classify-and-QAP on one day as a same-day duplicate', () => {
    const g = groupCardAudit([
      row('Target_us', 'wt-classification', 'Ama', '2026-08-01'),
      row('Target_us', 'wt-qap', 'Kojo', '2026-08-01'),
    ])
    expect(hasSameDayDuplicate(g[0])).toBe(false)
    expect(g[0].repeats).toEqual([])
  })

  it('lists every date a work type was doubled up on', () => {
    const g = groupCardAudit([
      row('Target_us', 'wt-qap', 'Ama', '2026-08-01'),
      row('Target_us', 'wt-qap', 'Ama', '2026-08-01'),
      row('Target_us', 'wt-qap', 'Kojo', '2026-08-03'),
      row('Target_us', 'wt-qap', 'Kojo', '2026-08-03'),
    ])
    expect(g[0].repeats[0].same_day_dates).toEqual(['2026-08-01', '2026-08-03'])
  })

  it('sorts same-day duplicates above repeats on other days', () => {
    const g = groupCardAudit([
      // Repeated, but days apart.
      row('Apart', 'wt-qap', 'Ama', '2026-08-01'),
      row('Apart', 'wt-qap', 'Ama', '2026-08-04'),
      // Twice in one day — the serious one, must come first.
      row('Zulu', 'wt-qap', 'Kojo', '2026-08-02'),
      row('Zulu', 'wt-qap', 'Kojo', '2026-08-02'),
    ])
    expect(g.map((x) => x.card_name)).toEqual(['Zulu', 'Apart'])
  })

  it('flags one person doing the same card twice, without repeating the name', () => {
    const g = groupCardAudit([
      row('Alza_cz_app', 'wt-qap', 'Ama', '2026-08-06'),
      row('Alza_cz_app', 'wt-qap', 'Ama', '2026-08-06'),
    ])
    expect(g[0].repeats[0]).toMatchObject({ times: 2, people: ['Ama'] })
  })

  it('flags each repeated work type separately', () => {
    const g = groupCardAudit([
      row('Both', 'wt-classification', 'Ama', '2026-08-01'),
      row('Both', 'wt-classification', 'Ama', '2026-08-02'),
      row('Both', 'wt-qap', 'Kojo', '2026-08-03'),
      row('Both', 'wt-qap', 'Kojo', '2026-08-04'),
    ])
    expect(g[0].repeats).toHaveLength(2)
  })

  it('sorts cards needing attention first, then alphabetically', () => {
    const g = groupCardAudit([
      row('Zebra', 'wt-qap', 'Ama', '2026-08-01'),
      row('Apple', 'wt-qap', 'Ama', '2026-08-01'),
      row('Middle', 'wt-qap', 'Ama', '2026-08-01'),
      row('Middle', 'wt-qap', 'Kojo', '2026-08-02'),
    ])
    expect(g.map((x) => x.card_name)).toEqual(['Middle', 'Apple', 'Zebra'])
  })

  it('returns nothing for no rows', () => {
    expect(groupCardAudit([])).toEqual([])
  })
})

describe('findSameDayCardClashes', () => {
  const existing = [
    {
      card_name: 'Alza_cz',
      work_type_id: 'wt-classification',
      work_type_name: 'Classification',
      employee_id: 'ama',
      employee_name: 'Ama',
      entry_id: 'entry-1',
    },
  ]

  it('flags the same card and work type already done that day', () => {
    const c = findSameDayCardClashes(
      [{ card_name: 'Alza_cz', work_type_id: 'wt-classification' }],
      existing,
      'kojo',
    )
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ employee_name: 'Ama', own: false })
  })

  it('marks it as your own when you already did it yourself', () => {
    const c = findSameDayCardClashes(
      [{ card_name: 'Alza_cz', work_type_id: 'wt-classification' }],
      existing,
      'ama',
    )
    expect(c[0].own).toBe(true)
  })

  it('does not flag the same card under the other work type', () => {
    // Classified once and QAP'd once on the same day is the normal flow.
    expect(
      findSameDayCardClashes(
        [{ card_name: 'Alza_cz', work_type_id: 'wt-qap' }],
        existing,
        'kojo',
      ),
    ).toEqual([])
  })

  it('does not flag a different card', () => {
    expect(
      findSameDayCardClashes(
        [{ card_name: 'Boost_us', work_type_id: 'wt-classification' }],
        existing,
        'kojo',
      ),
    ).toEqual([])
  })

  it('ignores the entry being edited, so it cannot clash with itself', () => {
    expect(
      findSameDayCardClashes(
        [{ card_name: 'Alza_cz', work_type_id: 'wt-classification' }],
        existing,
        'ama',
        'entry-1',
      ),
    ).toEqual([])
  })

  it('reports one clash per person, not one per duplicate row', () => {
    const twice = [...existing, { ...existing[0], entry_id: 'entry-2' }]
    expect(
      findSameDayCardClashes(
        [{ card_name: 'Alza_cz', work_type_id: 'wt-classification' }],
        twice,
        'kojo',
      ),
    ).toHaveLength(1)
  })

  it('ignores blank names and trims before comparing', () => {
    expect(
      findSameDayCardClashes([{ card_name: '  ', work_type_id: 'wt-classification' }], existing, 'k'),
    ).toEqual([])
    expect(
      findSameDayCardClashes(
        [{ card_name: ' Alza_cz ', work_type_id: 'wt-classification' }],
        existing,
        'kojo',
      ),
    ).toHaveLength(1)
  })
})
