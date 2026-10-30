import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()))
await page.goto('http://127.0.0.1:8788/login', { waitUntil: 'networkidle' })
await page.fill('#username', 'cardemp')
await page.fill('#password', 'DashTest2026!')
await page.click('button:has-text("Sign in")')
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })
await page.locator('h3', { hasText: 'Your productivity' }).waitFor({ state: 'visible', timeout: 15000 })
await page.waitForTimeout(1500)

// Measure the tick font width in the page to compare against what chart.js draws.
const widths = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('2d')
  const measure = (font, text) => {
    c.font = font
    return Math.round(c.measureText(text).width)
  }
  return {
    mono11: measure('11px "IBM Plex Mono"', 'Aug 26'),
    mono12: measure('12px "IBM Plex Mono"', 'Aug 26'),
    sans11: measure('11px sans-serif', 'Aug 26'),
    mono11Sep: measure('11px "IBM Plex Mono"', 'Sep 26'),
  }
})
console.log('WIDTHS', JSON.stringify(widths))
await browser.close()
