export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

/** "Today" as YYYY-MM-DD in the team's time zone. */
export function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** The current wall-clock time as HH:MM in the team's time zone — pairs with
 * todayInTz to compare a logged (date, time) against "right now" without
 * ever converting either side through UTC. */
export function nowTimeInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
}

/** Which calendar day, in the team's time zone, a stored timestamp falls on
 * — for turning something like a task's `completed_at` (a real instant)
 * into a YYYY-MM-DD comparable against work_date (already a plain calendar
 * date with no time zone of its own). Accepts the bare "YYYY-MM-DD HH:MM:SS"
 * SQLite writes via datetime('now') as well as a proper ISO string. */
export function dateInTz(timestamp: string, tz: string): string {
  const iso = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T') + 'Z'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}
