import { chromium } from 'playwright'

const OUT = process.env.SHOT_DIR
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

await page.goto('http://127.0.0.1:8788/login', { waitUntil: 'networkidle' })
await page.fill('#username', 'cardemp')
await page.fill('#password', 'DashTest2026!')
await page.click('button:has-text("Sign in")')
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })

const heading = page.locator('h3', { hasText: 'Your productivity' })
await heading.waitFor({ state: 'visible', timeout: 15000 })
const panel = page.locator('.panel', { has: heading }).first()
await panel.scrollIntoViewIfNeeded()
await page.waitForTimeout(800)
console.log('canvas box:', JSON.stringify(await panel.locator('canvas').boundingBox()))
await panel.screenshot({ path: `${OUT}/chart-horizontal-panel.png` })

// Tooltip check (value must come from x on a horizontal bar).
const canvas = panel.locator('canvas')
const box = await canvas.boundingBox()
await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5)
await page.waitForTimeout(600)
const tip = await page.evaluate(() => {
  const els = [...document.querySelectorAll('canvas')]
  return els.length
})
console.log('tooltip canvases:', tip)

// mobile
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(700)
await panel.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
console.log(
  'mobile:',
  JSON.stringify(
    await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    })),
  ),
)
await panel.screenshot({ path: `${OUT}/chart-horizontal-mobile.png` })

// Regression: vertical (grouped) charts on Trends must still be vertical.
await page.setViewportSize({ width: 1440, height: 1000 })
await page.goto('http://127.0.0.1:8788/trends', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/chart-trends-regression2.png` })

console.log('errors:', JSON.stringify(errors))
await browser.close()
