import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8788';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

  // Fresh login as Test Installer triggers the popup (justLoggedIn).
  await page.goto(`${BASE}/login`);
  await page.fill('#username', 'testinstaller');
  await page.fill('#password', 'testpass123');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/entries/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const popupVisible = await page.locator('text=Test popup masking').count();
  console.log('Popup visible:', popupVisible);
  const popupText = await page.locator('.fixed.inset-0').innerText().catch(() => '');
  console.log('Popup text:', JSON.stringify(popupText));
  await page.screenshot({ path: 'news-popup-masked.png' });

  await page.click('button:has-text("Got it")').catch(() => {});
  await page.goto(`${BASE}/news`);
  await page.waitForTimeout(800);
  const feedText = await page.locator('.panel', { hasText: 'Test popup masking' }).innerText();
  console.log('Feed item text:', JSON.stringify(feedText));
  await page.screenshot({ path: 'news-feed-masked.png' });

  await browser.close();
})();
