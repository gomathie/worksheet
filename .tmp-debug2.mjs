import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)))
await page.goto('http://127.0.0.1:8788/login', { waitUntil: 'networkidle' })
await page.fill('#username', 'cardemp')
await page.fill('#password', 'DashTest2026!')
await page.click('button:has-text("Sign in")')
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })
await page.locator('h3', { hasText: 'Your productivity' }).waitFor({ state: 'visible', timeout: 15000 })
await page.waitForTimeout(1500)

const info = await page.evaluate(() => {
  const inst = window.__trendChart
  if (!inst) return { error: 'no instance' }
  const chart = inst.chart ?? inst
  const canvas = chart.canvas
  const y = chart.scales.y
  const x = chart.scales.x
  return {
    keys: Object.keys(inst).slice(0, 12),
    indexAxis: chart.options.indexAxis,
    layoutPadding: chart.options.layout?.padding,
    xAxis: { left: Math.round(x.left), right: Math.round(x.right), width: Math.round(x.width), type: x.type },
    yAxis: {
      left: Math.round(y.left),
      right: Math.round(y.right),
      width: Math.round(y.width),
      type: y.type,
      tickFont: y.options.ticks?.font,
      sampleTicks: y.ticks.map((t) => ({
        label: t.label,
        w: Math.round(y._labelSizes?.widths?.[t.index] ?? -1),
      })),
    },
    chartArea: {
      left: Math.round(chart.chartArea.left),
      right: Math.round(chart.chartArea.right),
    },
    canvasW: canvas.width,
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
