// Pure calculation logic shared by the Worker API, the client, and tests.

export interface RateSettings {
  points_per_classification: number
  points_per_qap: number
  point_value: number
  currency: string
}

export interface EntryLike {
  employee_id: string
  work_date: string // YYYY-MM-DD
  hours: number
  classifications: number
  qap: number
}

export interface EmployeeLike {
  id: string
  name: string
}

export interface PersonSummary {
  employee_id: string
  name: string
  days_worked: number
  hours: number
  classifications: number
  qap: number
  points: number
  remuneration: number
}

export interface DailyTotal {
  date: string
  hours: number
  classifications: number
  qap: number
}

export interface MonthlyReport {
  month: string
  totals: {
    hours: number
    classifications: number
    qap: number
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

export function computePoints(
  classifications: number,
  qap: number,
  s: RateSettings,
): number {
  return classifications * s.points_per_classification + qap * s.points_per_qap
}

export function computeRemuneration(points: number, s: RateSettings): number {
  return round2(points * s.point_value)
}

/** Aggregate a month's entries into totals, per-person summaries, and daily totals. */
export function aggregateMonthly(
  month: string,
  entries: EntryLike[],
  employees: EmployeeLike[],
  settings: RateSettings,
): MonthlyReport {
  const names = new Map(employees.map((e) => [e.id, e.name]))
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
        classifications: 0,
        qap: 0,
        points: 0,
        remuneration: 0,
        dates: new Set(),
      }
      perPerson.set(e.employee_id, p)
    }
    p.dates.add(e.work_date)
    p.hours = round2(p.hours + e.hours)
    p.classifications += e.classifications
    p.qap += e.qap

    let d = daily.get(e.work_date)
    if (!d) {
      d = { date: e.work_date, hours: 0, classifications: 0, qap: 0 }
      daily.set(e.work_date, d)
    }
    d.hours = round2(d.hours + e.hours)
    d.classifications += e.classifications
    d.qap += e.qap
    allDates.add(e.work_date)
  }

  const per_person: PersonSummary[] = [...perPerson.values()]
    .map(({ dates, ...p }) => {
      const points = computePoints(p.classifications, p.qap, settings)
      return {
        ...p,
        days_worked: dates.size,
        points,
        remuneration: computeRemuneration(points, settings),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const totals = per_person.reduce(
    (t, p) => ({
      hours: round2(t.hours + p.hours),
      classifications: t.classifications + p.classifications,
      qap: t.qap + p.qap,
      points: t.points + p.points,
      remuneration: round2(t.remuneration + p.remuneration),
      days_worked: t.days_worked,
    }),
    {
      hours: 0,
      classifications: 0,
      qap: 0,
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
