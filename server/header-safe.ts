// Guards against header/command injection into the hand-rolled SMTP client
// in email.ts. Kept separate from that module (which pulls in
// `cloudflare:sockets` at import time) so it's plain, dependency-free, and
// unit-testable without a Workers runtime.

/**
 * Strip CR/LF from a value that becomes one line of a raw SMTP header or
 * command. Free text throughout the app (a device type name, a task title,
 * an employee's own name) only ever gets `.trim()`ed and length-capped
 * before it can reach a notification's `title` — and `.trim()` removes
 * leading/trailing whitespace but leaves an embedded "\r\nBcc: ..." or
 * "\r\nRCPT TO:<...>" untouched. This is the backstop: the one place every
 * subject, address, and hostname actually turns into wire data, rather than
 * something every call site across the app has to remember to sanitize.
 */
export function headerSafe(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim()
}
