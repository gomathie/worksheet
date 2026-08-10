const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8788';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE + '/login');
  await page.fill('#username', 'localadmin');
  await page.fill('#password', 'localtest123');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/gomat/AppData/Local/Temp/claude/c--Users-gomat-Downloads-worksheet/255500bb-5ca5-4f80-a1d3-3399909063f9/scratchpad/new-nav-entries.png' });

  await page.goto(BASE + '/report');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/gomat/AppData/Local/Temp/claude/c--Users-gomat-Downloads-worksheet/255500bb-5ca5-4f80-a1d3-3399909063f9/scratchpad/new-nav-report.png' });

  await page.goto(BASE + '/employees');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/gomat/AppData/Local/Temp/claude/c--Users-gomat-Downloads-worksheet/255500bb-5ca5-4f80-a1d3-3399909063f9/scratchpad/new-nav-admin.png' });

  // Desktop check too
  const desktopPage = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await desktopPage.goto(BASE + '/login');
  await desktopPage.fill('#username', 'localadmin');
  await desktopPage.fill('#password', 'localtest123');
  await desktopPage.click('button:has-text("Sign in")');
  await desktopPage.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 });
  await desktopPage.waitForTimeout(400);
  await desktopPage.screenshot({ path: 'C:/Users/gomat/AppData/Local/Temp/claude/c--Users-gomat-Downloads-worksheet/255500bb-5ca5-4f80-a1d3-3399909063f9/scratchpad/new-nav-desktop.png' });

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
