import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isFestiveSeason } from '../shared/season'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const inline = /<script>([\s\S]*?)<\/script>/.exec(html)![1]

function runIndexHtmlSwitch(at: Date): string {
  vi.useFakeTimers()
  vi.setSystemTime(at)
  const links: Record<string, { href: string }> = {
    favicon: { href: '/favicon.svg' },
    manifest: { href: '/manifest.webmanifest' },
    'apple-touch-icon': { href: '/apple-touch-icon.png' },
  }
  new Function('document', inline)({ getElementById: (id: string) => links[id] })
  return links.manifest.href
}

afterEach(() => {
  vi.useRealTimers()
})

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12)

describe('isFestiveSeason', () => {
  it.each([
    [d(2026, 11, 1), true],
    [d(2026, 12, 25), true],
    [d(2027, 1, 1), true],
    [d(2027, 1, 9), true],
    [d(2027, 1, 10), false],
    [d(2027, 6, 15), false],
    [d(2026, 10, 31), false],
  ])('%s -> %s', (date, expected) => {
    expect(isFestiveSeason(date)).toBe(expected)
    expect(runIndexHtmlSwitch(date)).toBe(
      expected ? '/manifest-festive.webmanifest' : '/manifest.webmanifest',
    )
  })
})
