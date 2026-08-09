import { describe, it, expect } from 'vitest'
import { headerSafe } from '../server/header-safe'
import { neutralizeFormula } from '../src/spreadsheet-safety'

describe('headerSafe', () => {
  it('leaves ordinary text untouched', () => {
    expect(headerSafe('Ruptela')).toBe('Ruptela')
    expect(headerSafe('  Fix the onboarding doc  ')).toBe('Fix the onboarding doc')
  })

  it('strips an injected header out of a crafted name', () => {
    const attack = 'x\r\nBcc: attacker@evil.com\r\nSubject: hijacked'
    expect(headerSafe(attack)).not.toMatch(/[\r\n]/)
    expect(headerSafe(attack)).toBe('x Bcc: attacker@evil.com Subject: hijacked')
  })

  it('strips a bare LF the same way', () => {
    expect(headerSafe('a\nb')).toBe('a b')
  })

  it('collapses several consecutive line breaks into one space', () => {
    expect(headerSafe('a\r\n\r\n\r\nb')).toBe('a b')
  })
})

describe('neutralizeFormula', () => {
  it('leaves ordinary text untouched', () => {
    expect(neutralizeFormula('Taxi to airport')).toBe('Taxi to airport')
    expect(neutralizeFormula('')).toBe('')
  })

  it('quotes a value that would open as a formula', () => {
    expect(neutralizeFormula('=HYPERLINK("http://evil","x")')).toBe(
      "'=HYPERLINK(\"http://evil\",\"x\")",
    )
    expect(neutralizeFormula('+1')).toBe("'+1")
    expect(neutralizeFormula('-1')).toBe("'-1")
    expect(neutralizeFormula('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('quotes a value starting with a tab or carriage return', () => {
    expect(neutralizeFormula('\t=cmd')).toBe("'\t=cmd")
    expect(neutralizeFormula('\r=cmd')).toBe("'\r=cmd")
  })

  it('does not touch a value that merely contains one of the characters mid-string', () => {
    expect(neutralizeFormula('Cost: $5 - includes tip')).toBe('Cost: $5 - includes tip')
  })
})
