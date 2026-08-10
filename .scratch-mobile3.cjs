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

  // Navigate via in-app link click (not a fresh page load) to exercise the
  // route-change watcher, same as a real user tapping through.
  await page.goto(BASE + '/employees');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/gomat/AppData/Local/Temp/claude/c--Users-gomat-Downloads-worksheet/255500bb-5ca5-4f80-a1d3-3399909063f9/scratchpad/scrolled-admin-fresh-load.png' });

  // Now go home then click through in-app to Employees via the Admin pill's
  // route (simulating clicking Finance then Admin nav pill)
  await page.goto(BASE + '/');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const links = [...document.querySelectorAll('nav a')];
    const admin = links.find((a) => a.textContent?.trim() === 'Admin');
    admin?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'C:/Users/gomat/AppData/Local/Temp/claude/c--Users-gomat-Downloads-worksheet/255500bb-5ca5-4f80-a1d3-3399909063f9/scratchpad/scrolled-admin-clicked.png' });

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
