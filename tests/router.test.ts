import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearRouteChunkRecovery,
  isRecoveredRouteChunkError,
  isRouteChunkLoadError,
  recoverRouteChunkLoad,
  resetRouteChunkRecoveryState,
} from '../src/router/chunkRecovery'

function fakeStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe('route chunk recovery', () => {
  beforeEach(() => {
    resetRouteChunkRecoveryState()
  })
  it.each([
    'Load failed',
    'ChunkLoadError: Loading chunk 42 failed',
    'Failed to fetch dynamically imported module: /assets/PaymentsView-old.js',
    'Importing a module script failed.',
    "'text/html' is not a valid JavaScript MIME type.",
  ])('recognizes browser chunk errors: %s', (message) => {
    expect(isRouteChunkLoadError(new TypeError(message))).toBe(true)
  })

  it('does not treat ordinary application errors as chunk failures', () => {
    expect(isRouteChunkLoadError(new Error('Request failed (500)'))).toBe(false)
  })

  it('reloads a failed route only once until navigation succeeds', () => {
    const storage = fakeStorage()
    const navigate = vi.fn()
    const error = new TypeError('Load failed')

    expect(recoverRouteChunkLoad(error, '/payments', storage, navigate)).toBe(true)
    expect(recoverRouteChunkLoad(error, '/payments', storage, navigate)).toBe(false)
    expect(navigate).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/payments')

    clearRouteChunkRecovery(storage)

    expect(recoverRouteChunkLoad(error, '/payments', storage, navigate)).toBe(true)
  })

  it('marks the recovered failure as already handled so monitoring can drop it', () => {
    const storage = fakeStorage()
    const error = new TypeError('Failed to fetch dynamically imported module: /assets/NewsView-old.js')

    expect(isRecoveredRouteChunkError(error)).toBe(false)

    recoverRouteChunkLoad(error, '/news', storage, vi.fn())

    expect(isRecoveredRouteChunkError(error)).toBe(true)
    // A second signal for the very same failure is the same incident.
    expect(isRecoveredRouteChunkError(new TypeError(error.message))).toBe(true)
  })

  it('still reports unrelated errors after a recovery', () => {
    const storage = fakeStorage()
    recoverRouteChunkLoad(new TypeError('Load failed'), '/news', storage, vi.fn())

    expect(isRecoveredRouteChunkError(new Error('Request failed (500)'))).toBe(false)
    expect(isRecoveredRouteChunkError(undefined)).toBe(false)
  })

  it('keeps reporting a chunk failure that survives the reload', () => {
    const storage = fakeStorage()
    const error = new TypeError('Load failed')
    recoverRouteChunkLoad(error, '/news', storage, vi.fn())

    // A fresh document re-imports this module, so drop the in-memory flag while
    // keeping session storage: the reload guard now blocks a second reload.
    resetRouteChunkRecoveryState()

    expect(recoverRouteChunkLoad(error, '/news', storage, vi.fn())).toBe(false)
    expect(isRecoveredRouteChunkError(error)).toBe(false)
  })

  it('does not mark a non-chunk error as recovered', () => {
    const storage = fakeStorage()
    recoverRouteChunkLoad(new Error('Request failed (500)'), '/news', storage, vi.fn())

    expect(isRecoveredRouteChunkError(new Error('Load failed'))).toBe(false)
  })
})
