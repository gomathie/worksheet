// Shared "group rows by calendar day" helper — used wherever a list of dated
// rows (time entries, daily report detail) should read as days worked rather
// than a flat list, so a day logged more than once still shows as one day's
// work instead of two unrelated rows that happen to share a date.

export interface DayGroup<T> {
  date: string
  rows: T[]
  totalHours: number
}

/**
 * Groups `rows` by `dateOf(row)`, preserving first-seen order — callers pass
 * already-sorted data, so this never re-sorts — and summing `hoursOf(row)`
 * per day.
 */
export function groupByDay<T>(
  rows: T[],
  dateOf: (row: T) => string,
  hoursOf: (row: T) => number,
): DayGroup<T>[] {
  const order: string[] = []
  const byDate = new Map<string, T[]>()
  for (const row of rows) {
    const date = dateOf(row)
    if (!byDate.has(date)) {
      byDate.set(date, [])
      order.push(date)
    }
    byDate.get(date)!.push(row)
  }
  return order.map((date) => {
    const dayRows = byDate.get(date)!
    return {
      date,
      rows: dayRows,
      totalHours: Math.round(dayRows.reduce((sum, row) => sum + hoursOf(row), 0) * 100) / 100,
    }
  })
}

/**
 * "Fri, Aug 7, 2026" — parsed as UTC so the weekday matches the stored date
 * regardless of the viewer's own time zone.
 */
export function formatDayHeading(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
