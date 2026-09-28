const ROUTE_CHUNK_RELOAD_KEY = 'ledger:route-chunk-reload'

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

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

  storage.setItem(ROUTE_CHUNK_RELOAD_KEY, target)
  navigate(target)
  return true
}

export function clearRouteChunkRecovery(storage: SessionStorageLike): void {
  storage.removeItem(ROUTE_CHUNK_RELOAD_KEY)
}
