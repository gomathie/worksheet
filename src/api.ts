export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// A 401 from one of these is a normal, locally-handled outcome (e.g. a wrong
// password on the login form) — not "the session died mid-use". The global
// auth:unauthorized event below is only useful for the latter, so these are
// excluded from triggering it.
const AUTH_ENDPOINT_PREFIX = '/api/auth/'

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json: body, ...rest } = init
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...rest.headers,
    },
    body: body !== undefined ? JSON.stringify(body) : rest.body,
    credentials: 'same-origin',
  })
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`
    // Session expired, got deleted, or the account was deactivated mid-use
    // — every view otherwise has to notice this itself, and several don't,
    // which is how an unguarded 401 ends up as an unhandled exception
    // reported to Sentry instead of a clean bounce back to the login
    // screen. App.vue listens for this and handles the actual redirect.
    if (res.status === 401 && !path.startsWith(AUTH_ENDPOINT_PREFIX)) {
      window.dispatchEvent(new Event('auth:unauthorized'))
    }
    throw new ApiClientError(res.status, message)
  }
  return data as T
}
