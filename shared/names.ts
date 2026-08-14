// Name formatting shared by the Worker API, the client, and tests.
// Pure functions only — no DB, no fetch.

/**
 * The name to use inside a notification: first name only.
 *
 * SMS is billed per 160-character segment, so every word in a message has a
 * price, and a full name is the most expendable padding in a line like
 * "Nathaniel Jayson R Ankrah assigned you a task". Within one small team a
 * first name identifies somebody perfectly well.
 *
 * Trailing-initial surnames ("Benjamin A.") are the common shape here, and
 * the initial goes with the rest — it adds characters and no clarity. Falls
 * back rather than ever returning an empty string, so a notification can't
 * end up reading "  assigned you a task".
 */
export function firstName(full: string | null | undefined): string {
  const first = (full ?? '').trim().split(/\s+/)[0]
  return first || 'Someone'
}
