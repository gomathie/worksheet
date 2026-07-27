// Pure calculation logic shared by the Worker API, the client, and tests.

export interface RateSettings {
  point_value: number
  currency: string
  /** Global cap on entries an employee may log per day; 0 = unlimited. */
  max_entries_per_day: number
  /** 1 = employee entries need admin approval before they count; 0 = off. */
  require_entry_approval: number
}

export interface WorkType {
  id: string
  name: string
  points_per_unit: number
}

export interface EntryLike {
  employee_id: string
  work_date: string // YYYY-MM-DD
  hours: number
  units: Record<string, number> // work_type_id -> units logged
}

export interface EmployeeLike {
  id: string
  name: string
  /** Per-employee points_per_unit overrides, keyed by work_type_id. */
  rate_overrides?: Record<string, number>
}

export interface PersonSummary {
  employee_id: string
  name: string
  days_worked: number
  hours: number
  units: Record<string, number>
  points: number
  remuneration: number
}

export interface DailyTotal {
  date: string
  hours: number
  units: Record<string, number>
}

export interface MonthlyReport {
  month: string
  totals: {
    hours: number
    units: Record<string, number>
    points: number
    remuneration: number
    days_worked: number
  }
  per_person: PersonSummary[]
  daily_totals: DailyTotal[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Parse "HH:MM" into minutes since midnight; throws on malformed input. */
export function parseTime(t: string): number {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t)
  if (!m) throw new Error(`Invalid time: ${t}`)
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Hours between start and end, ((end - start) mod 24) in hours, rounded to
 * 2 decimals. end < start is treated as overnight (end + 24h).
 */
export function computeHours(start: string, end: string): number {
  const diff = (parseTime(end) - parseTime(start) + 1440) % 1440
  return round2(diff / 60)
}

/**
 * Points for a set of logged units. Each work type's general rate applies
 * unless the employee has a custom rate override for it.
 */
export function computePoints(
  units: Record<string, number>,
  workTypes: WorkType[],
  rateOverrides?: Record<string, number>,
): number {
  let points = 0
  for (const wt of workTypes) {
    const rate = rateOverrides?.[wt.id] ?? wt.points_per_unit
    points += (units[wt.id] ?? 0) * rate
  }
  return round2(points)
}

export function computeRemuneration(points: number, s: RateSettings): number {
  return round2(points * s.point_value)
}

function addUnits(target: Record<string, number>, source: Record<string, number>) {
  for (const [id, n] of Object.entries(source)) {
    if (n) target[id] = (target[id] ?? 0) + n
  }
}

/** Aggregate a month's entries into totals, per-person summaries, and daily totals. */
export function aggregateMonthly(
  month: string,
  entries: EntryLike[],
  employees: EmployeeLike[],
  workTypes: WorkType[],
  settings: RateSettings,
): MonthlyReport {
  const names = new Map(employees.map((e) => [e.id, e.name]))
  const overridesBy = new Map(employees.map((e) => [e.id, e.rate_overrides]))
  const perPerson = new Map<string, PersonSummary & { dates: Set<string> }>()
  const daily = new Map<string, DailyTotal>()
  const allDates = new Set<string>()

  for (const e of entries) {
    let p = perPerson.get(e.employee_id)
    if (!p) {
      p = {
        employee_id: e.employee_id,
        name: names.get(e.employee_id) ?? 'Unknown',
        days_worked: 0,
        hours: 0,
        units: {},
        points: 0,
        remuneration: 0,
        dates: new Set(),
      }
      perPerson.set(e.employee_id, p)
    }
    p.dates.add(e.work_date)
    p.hours = round2(p.hours + e.hours)
    addUnits(p.units, e.units)

    let d = daily.get(e.work_date)
    if (!d) {
      d = { date: e.work_date, hours: 0, units: {} }
      daily.set(e.work_date, d)
    }
    d.hours = round2(d.hours + e.hours)
    addUnits(d.units, e.units)
    allDates.add(e.work_date)
  }

  const per_person: PersonSummary[] = [...perPerson.values()]
    .map(({ dates, ...p }) => {
      const points = computePoints(p.units, workTypes, overridesBy.get(p.employee_id))
      return {
        ...p,
        days_worked: dates.size,
        points,
        remuneration: computeRemuneration(points, settings),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const unitTotals: Record<string, number> = {}
  const totals = per_person.reduce(
    (t, p) => {
      addUnits(unitTotals, p.units)
      return {
        hours: round2(t.hours + p.hours),
        units: unitTotals,
        points: round2(t.points + p.points),
        remuneration: round2(t.remuneration + p.remuneration),
        days_worked: t.days_worked,
      }
    },
    {
      hours: 0,
      units: unitTotals,
      points: 0,
      remuneration: 0,
      days_worked: allDates.size,
    },
  )

  return {
    month,
    totals,
    per_person,
    daily_totals: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }
}
