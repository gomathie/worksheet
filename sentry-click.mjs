import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
const sentryRequests = []
page.on('request', (req) => {
  if (req.url().includes('sentry.io')) sentryRequests.push({ url: req.url(), method: req.method() })
})
page.on('response', (res) => {
  if (res.url().includes('sentry.io')) console.log('SENTRY RESPONSE', res.status(), res.url())
})
page.on('pageerror', (err) => console.log('[pageerror]', err.message))

await page.goto('http://127.0.0.1:8788/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Test Sentry' }).click()
await page.waitForTimeout(4000)

console.log('--- sentry requests seen ---')
console.log(JSON.stringify(sentryRequests, null, 2))

await browser.close()
