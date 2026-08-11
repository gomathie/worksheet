const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8788';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
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

  const links = await page.$$eval('a:has-text("Open")', (els) => els.map((e) => e.getAttribute('href')));
  console.log('Open link hrefs:', JSON.stringify(links, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
