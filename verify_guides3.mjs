import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8788';

async function login(page, username, password) {
  await page.goto(`${BASE}/login`);
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/entries/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch();

  // Admin
  const adminPage = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  await login(adminPage, 'localadmin', 'localtest123');
  await adminPage.click('button:has-text("Account")');
  await adminPage.waitForTimeout(200);
  const adminItems = await adminPage.locator('.panel.absolute a, .panel.absolute button').allTextContents();
  console.log('Admin menu:', adminItems.map((s) => s.trim()));
  await adminPage.click('text=Admin Guide');
  await adminPage.waitForTimeout(500);
  console.log('Admin Guide url:', adminPage.url());
  console.log('Admin Guide tables:', await adminPage.locator('table').count());

  // Non-admin, separate context (fresh cookies)
  const empCtx = await browser.newContext();
  const empPage = await empCtx.newPage();
  await login(empPage, 'testinstaller', 'testpass123');
  await empPage.click('button:has-text("Account")');
  await empPage.waitForTimeout(200);
  const empItems = await empPage.locator('.panel.absolute a, .panel.absolute button').allTextContents();
  console.log('Employee menu:', empItems.map((s) => s.trim()));
  await empPage.goto(`${BASE}/help/admin`);
  await empPage.waitForTimeout(500);
  console.log('Employee -> /help/admin redirected to:', empPage.url());

  await browser.close();
  console.log('DONE');
})();
