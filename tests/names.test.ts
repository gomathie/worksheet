import { describe, it, expect } from 'vitest'
import { firstName } from '../shared/names'

// Notification text uses first names only — SMS is billed per 160-character
// segment, so a full name is pure cost for no added clarity within one team.
describe('firstName', () => {
  it('takes the first word of a full name', () => {
    expect(firstName('Philip Samuel Aruna')).toBe('Philip')
    expect(firstName('Nathaniel Jayson R Ankrah')).toBe('Nathaniel')
  })

  it('drops a trailing surname initial', () => {
    expect(firstName('Benjamin A.')).toBe('Benjamin')
    expect(firstName('Emmanuel D.')).toBe('Emmanuel')
  })

  it('leaves a single-word name alone', () => {
    expect(firstName('Mathie')).toBe('Mathie')
  })

  it('tolerates messy spacing', () => {
    expect(firstName('  Saint   N.  ')).toBe('Saint')
  })

  it('falls back rather than returning an empty string', () => {
    expect(firstName('')).toBe('Someone')
    expect(firstName('   ')).toBe('Someone')
    expect(firstName(null)).toBe('Someone')
    expect(firstName(undefined)).toBe('Someone')
  })
})
