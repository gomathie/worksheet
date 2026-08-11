// News/announcements rules shared by the Worker API, the client, and tests.
// Pure functions only — no DB, no fetch. The API is the enforcement point;
// the client uses the same helpers so the UI never offers something the
// server would reject.
//
// A right holder can broadcast a message to everyone, either as a plain item
// in the News feed ('feed') or as a modal that interrupts login while it's
// still live ('popup'). Every announcement expires on its own — there is no
// "leave it up forever" option, so a stale notice can't linger unnoticed.

export const NEWS_STYLES = ['feed', 'popup'] as const
export type NewsStyle = (typeof NEWS_STYLES)[number]

export const NEWS_STYLE_LABELS: Record<NewsStyle, string> = {
  feed: 'Announcement',
  popup: 'Pop-up on login',
}

export function parseNewsStyle(value: unknown): NewsStyle | null {
  const s = String(value ?? '')
  return (NEWS_STYLES as readonly string[]).includes(s) ? (s as NewsStyle) : null
}

/** Everyone gets a short leash — long enough for a real notice, short enough
 * that it can't be forgotten and left running. */
export const MAX_DAYS = 7
/** An administrator may hold one open longer, for something that genuinely
 * needs weeks of visibility (a policy change, a long maintenance window) —
 * but still bounded, so "forever" is never actually on offer. */
export const ADMIN_MAX_DAYS = 90

export function maxDaysFor(isAdmin: boolean): number {
  return isAdmin ? ADMIN_MAX_DAYS : MAX_DAYS
}

/** Validates the requested lifetime for this actor; null signals invalid
 * (out of range, or not a whole number of days). */
export function parseExpiryDays(value: unknown, isAdmin: boolean): number | null {
  const n = Number(value)
  if (!Number.isInteger(n)) return null
  if (n < 1 || n > maxDaysFor(isAdmin)) return null
  return n
}

/** `date` (YYYY-MM-DD) plus `days`, as another YYYY-MM-DD. Used to turn a
 * requested lifetime into the stored expiry, and to decide whether an
 * announcement is still live. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** An announcement is live through the end of its expiry day, inclusive —
 * created for 1 day and read that same day should still show it. */
export function isNewsActive(expiresAt: string, today: string): boolean {
  return expiresAt >= today
}

export interface NewsInput {
  title?: string
  body?: string
}

export interface ValidationIssue {
  field: string
  message: string
}

/** Only the title is required — the message itself may be as short as the
 * headline, same as the pattern for a task's title/details split. */
export function validateNews(input: NewsInput): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!(input.title ?? '').trim()) {
    issues.push({ field: 'title', message: 'A title is required' })
  }
  return issues
}
