import { describe, it, expect } from 'vitest'
import {
  ADMIN_MAX_DAYS,
  MAX_DAYS,
  addDays,
  isNewsActive,
  maxDaysFor,
  parseExpiryDays,
  parseNewsStyle,
  validateNews,
} from '../shared/news'

describe('parseNewsStyle', () => {
  it('accepts the two known styles', () => {
    expect(parseNewsStyle('feed')).toBe('feed')
    expect(parseNewsStyle('popup')).toBe('popup')
  })

  it('refuses anything else', () => {
    expect(parseNewsStyle('banner')).toBeNull()
    expect(parseNewsStyle(undefined)).toBeNull()
    expect(parseNewsStyle('')).toBeNull()
  })
})

describe('maxDaysFor / parseExpiryDays', () => {
  it('caps an ordinary holder at 7 days', () => {
    expect(maxDaysFor(false)).toBe(MAX_DAYS)
    expect(parseExpiryDays(7, false)).toBe(7)
    expect(parseExpiryDays(8, false)).toBeNull()
  })

  it('lets an admin go further, still bounded', () => {
    expect(maxDaysFor(true)).toBe(ADMIN_MAX_DAYS)
    expect(parseExpiryDays(30, true)).toBe(30)
    expect(parseExpiryDays(ADMIN_MAX_DAYS, true)).toBe(ADMIN_MAX_DAYS)
    expect(parseExpiryDays(ADMIN_MAX_DAYS + 1, true)).toBeNull()
  })

  it('refuses zero, negative, fractional, and non-numeric input for either actor', () => {
    for (const isAdmin of [true, false]) {
      expect(parseExpiryDays(0, isAdmin)).toBeNull()
      expect(parseExpiryDays(-1, isAdmin)).toBeNull()
      expect(parseExpiryDays(2.5, isAdmin)).toBeNull()
      expect(parseExpiryDays('soon', isAdmin)).toBeNull()
      expect(parseExpiryDays(undefined, isAdmin)).toBeNull()
    }
  })

  it('accepts the boundary of 1 day for both', () => {
    expect(parseExpiryDays(1, false)).toBe(1)
    expect(parseExpiryDays(1, true)).toBe(1)
  })
})

describe('addDays', () => {
  it('adds within a month', () => {
    expect(addDays('2026-08-11', 3)).toBe('2026-08-14')
  })

  it('rolls over a month/year boundary', () => {
    expect(addDays('2026-08-29', 5)).toBe('2026-09-03')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('supports a 1-day lifetime', () => {
    expect(addDays('2026-08-11', 1)).toBe('2026-08-12')
  })
})

describe('isNewsActive', () => {
  it('is active while the expiry date is today or later', () => {
    expect(isNewsActive('2026-08-11', '2026-08-11')).toBe(true)
    expect(isNewsActive('2026-08-12', '2026-08-11')).toBe(true)
  })

  it('is inactive once the expiry date has passed', () => {
    expect(isNewsActive('2026-08-10', '2026-08-11')).toBe(false)
  })
})

describe('validateNews', () => {
  it('requires a title', () => {
    expect(validateNews({ title: '' })).toEqual([
      { field: 'title', message: 'A title is required' },
    ])
    expect(validateNews({ title: '   ' })).toHaveLength(1)
    expect(validateNews({})).toHaveLength(1)
  })

  it('passes with just a title — the body is optional', () => {
    expect(validateNews({ title: 'Office closed Friday' })).toEqual([])
  })
})
