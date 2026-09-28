import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isMobileOrPwa, canShareFiles, shareOrDownloadFile } from '../src/pdf'

describe('PDF & Web Share integration', () => {
  const originalNavigator = globalThis.navigator
  const originalWindow = globalThis.window

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    })
  })

  it('detects mobile user agent', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
      configurable: true,
      writable: true,
    })
    expect(isMobileOrPwa()).toBe(true)
  })

  it('detects desktop user agent without standalone display mode', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      configurable: true,
      writable: true,
    })
    expect(isMobileOrPwa()).toBe(false)
  })

  it('detects canShare with files when supported', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        canShare: vi.fn().mockReturnValue(true),
        share: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
      writable: true,
    })
    expect(canShareFiles()).toBe(true)
  })

  it('returns false for canShareFiles when canShare throws or returns false', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        canShare: vi.fn().mockImplementation(() => {
          throw new Error('Not supported')
        }),
      },
      configurable: true,
      writable: true,
    })
    expect(canShareFiles()).toBe(false)
  })

  it('attempts navigator.share on mobile when canShare is true', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Android',
        canShare: vi.fn().mockReturnValue(true),
        share: shareMock,
      },
      configurable: true,
      writable: true,
    })

    const blob = new Blob(['sample content'], { type: 'application/pdf' })
    await shareOrDownloadFile(blob, 'sample.pdf', 'Sample Title')
    expect(shareMock).toHaveBeenCalled()
  })
})

describe('Month-End Auto-Locking Logic', () => {
  function isMonthEnded(current: string, targetMonth: string): boolean {
    return targetMonth < current
  }

  it('considers prior calendar months as ended', () => {
    const current = '2026-09'
    expect(isMonthEnded(current, '2026-08')).toBe(true)
    expect(isMonthEnded(current, '2026-01')).toBe(true)
    expect(isMonthEnded(current, '2025-12')).toBe(true)
  })

  it('does not consider the current or future months as ended', () => {
    const current = '2026-09'
    expect(isMonthEnded(current, '2026-09')).toBe(false)
    expect(isMonthEnded(current, '2026-10')).toBe(false)
    expect(isMonthEnded(current, '2027-01')).toBe(false)
  })
})
