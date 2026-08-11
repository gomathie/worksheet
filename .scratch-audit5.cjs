const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8788';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.on('console', (m) => console.log('[console]', m.text()));
  await page.goto(BASE + '/login');
  await page.fill('#username', 'localadmin');
  await page.fill('#password', 'localtest123');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 });
  await page.goto(BASE + '/card-audit');
  await page.waitForSelector('h2:has-text("Card audit")');
  await page.fill('#ca-q', 'AuditDup');
  await page.click('button:has-text("Search")');
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    window.addEventListener('popstate', () => console.log('popstate', location.href));
  });

  const openLink = page.locator('a:has-text("Open")').nth(1);
  const href = await openLink.getAttribute('href');
  console.log('clicking href:', href);
  await openLink.click();
  await page.waitForTimeout(1500);
  console.log('landed at:', page.url());
  const empValue = await page.locator('select[aria-label="Filter employee"]').inputValue();
  console.log('employee select value after click-nav:', empValue);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
