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
await page.waitForTimeout(900)

const rects = await page.evaluate(() => {
  const panelEl = [...document.querySelectorAll('.panel')].find((p) =>
    p.textContent.includes('YOUR PRODUCTIVITY') || p.textContent.includes('Your productivity'),
  )
  const canvas = panelEl.querySelector('canvas')
  const r = (el) => {
    const b = el.getBoundingClientRect()
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  }
  const cs = getComputedStyle(canvas)
  return {
    panel: r(panelEl),
    canvasCss: r(canvas),
    canvasBacking: { w: canvas.width, h: canvas.height },
    dpr: window.devicePixelRatio,
    fontsStatus: document.fonts.status,
    plexLoaded: document.fonts.check('11px "IBM Plex Mono"'),
    canvasStyleWidth: cs.width,
    panelPadding: getComputedStyle(panelEl).padding,
  }
})
console.log(JSON.stringify(rects, null, 2))

await panel.locator('canvas').screenshot({ path: `${OUT}/chart-canvas-only.png` })
await browser.close()
