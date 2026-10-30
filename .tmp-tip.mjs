import { chromium } from 'playwright'

const OUT = process.env.SHOT_DIR
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
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

const canvas = panel.locator('canvas')
const box = await canvas.boundingBox()
// Hover the middle row (September) roughly midway along its classification bar.
await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
await page.waitForTimeout(700)
await panel.screenshot({ path: `${OUT}/chart-horizontal-tooltip.png` })

// Vertical chart tooltip regression on Trends.
await page.goto('http://127.0.0.1:8788/trends', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const tCanvas = page.locator('canvas').first()
const tBox = await tCanvas.boundingBox()
await page.mouse.move(tBox.x + tBox.width * 0.45, tBox.y + tBox.height * 0.3)
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/chart-trends-tooltip.png` })

await browser.close()
