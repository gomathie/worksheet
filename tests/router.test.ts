import { describe, expect, it, vi } from 'vitest'
import {
  clearRouteChunkRecovery,
  isRouteChunkLoadError,
  recoverRouteChunkLoad,
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
  it.each([
    'Load failed',
    'ChunkLoadError: Loading chunk 42 failed',
    'Failed to fetch dynamically imported module: /assets/PaymentsView-old.js',
    'Importing a module script failed.',
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
})
