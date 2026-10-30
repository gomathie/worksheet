import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
await page.goto('http://127.0.0.1:8788/login', { waitUntil: 'networkidle' })
await page.fill('#username', 'cardemp')
await page.fill('#password', 'DashTest2026!')
await page.click('button:has-text("Sign in")')
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })
await page.locator('h3', { hasText: 'Your productivity' }).waitFor({ state: 'visible', timeout: 15000 })
await page.waitForTimeout(1500)

const info = await page.evaluate(() => {
  const inst = window.__trendChart
  const chart = inst?.chart ?? inst
  const y = chart.scales.y
  const ctx = document.createElement('canvas').getContext('2d')
  const measure = (font, text) => {
    ctx.font = font
    return Math.round(ctx.measureText(text).width)
  }
  const sizes = y._labelSizes
  return {
    resolvedFont: y.font,
    ticksPadding: y.options.ticks?.padding,
    crossAlign: y.options.ticks?.crossAlign,
    align: y.options.ticks?.align,
    labelSizes: sizes
      ? {
          widths: sizes.widths?.map((w) => Math.round(w)),
          heights: sizes.heights?.map((h) => Math.round(h)),
        }
      : null,
    measuredWithResolved: {
      aug: measure(y.font, 'Aug 26'),
      sep: measure(y.font, 'Sep 26'),
    },
    axisLeftRight: [Math.round(y.left), Math.round(y.right)],
    paddingLeft: y.paddingLeft,
    paddingRight: y.paddingRight,
    maxWidth: y.maxWidth,
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
