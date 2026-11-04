const ROUTE_CHUNK_RELOAD_KEY = 'ledger:route-chunk-reload'

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

// Sentry's vue-router instrumentation reports every router.onError through its
// own captureException, independently of the recovery listener. Remembering the
// reload in memory lets that report be dropped for the failure we are already
// reloading away from, while a failure that repeats after the reload stays
// reportable: the storage guard below blocks a second reload, so recovery is
// never scheduled and the page is genuinely stuck.
let recoveryScheduled = false

export function isRouteChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return (
    /^Load failed$/i.test(message) ||
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  )
}

export function recoverRouteChunkLoad(
  error: unknown,
  target: string,
  storage: SessionStorageLike,
  navigate: (target: string) => void,
): boolean {
  if (!isRouteChunkLoadError(error) || storage.getItem(ROUTE_CHUNK_RELOAD_KEY) === target) {
    return false
  }

  recoveryScheduled = true
  storage.setItem(ROUTE_CHUNK_RELOAD_KEY, target)
  navigate(target)
  return true
}

export function clearRouteChunkRecovery(storage: SessionStorageLike): void {
  storage.removeItem(ROUTE_CHUNK_RELOAD_KEY)
}

/**
 * True when the error is a chunk failure this document is already recovering
 * from, so it should not be reported as a new incident. Deliberately not reset
 * by `clearRouteChunkRecovery`, which only re-arms the reload guard for the
 * next route.
 */
export function isRecoveredRouteChunkError(error: unknown): boolean {
  return recoveryScheduled && isRouteChunkLoadError(error)
}

export function resetRouteChunkRecoveryState(): void {
  recoveryScheduled = false
}
