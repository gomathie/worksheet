import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8788';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // ---- login
  await page.goto(`${BASE}/login`);
  await page.fill('#username, input[name="username"]', 'localadmin').catch(async () => {
    await page.fill('input[type="text"]', 'localadmin');
  });
  await page.fill('input[type="password"]', 'localtest123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|entries)?$/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
  console.log('After login URL:', page.url());

  // ---- go to Settings, confirm SMTP/SMS panels gone
  await page.goto(`${BASE}/settings`);
  await page.waitForTimeout(800);
  const smtpOnSettings = await page.locator('h2:has-text("Email notifications (SMTP)")').count();
  const smsOnSettings = await page.locator('h2:has-text("SMS notifications (mnotify)")').count();
  console.log('Settings page — SMTP panel count (expect 0):', smtpOnSettings);
  console.log('Settings page — SMS panel count (expect 0):', smsOnSettings);
  await page.screenshot({ path: 'settings-page.png', fullPage: true });

  // ---- confirm mini-tabs show Notifications
  const tabs = await page.locator('.no-print a, .no-print .btn').allTextContents().catch(() => []);
  console.log('Mini-tab texts near admin nav (best-effort):', tabs);

  // ---- go to Notifications page
  await page.goto(`${BASE}/notifications`);
  await page.waitForTimeout(800);
  const smtpHeading = await page.locator('h2:has-text("Email notifications (SMTP)")').count();
  const smsHeading = await page.locator('h2:has-text("SMS notifications (mnotify)")').count();
  const newsHeading = await page.locator('h2:has-text("News")').count();
  console.log('Notifications page — SMTP heading (expect 1):', smtpHeading);
  console.log('Notifications page — SMS heading (expect 1):', smsHeading);
  console.log('Notifications page — News heading (expect 1):', newsHeading);

  // password field masking check for SMS API key
  const pwInput = page.locator('#sms-key input, #sms-key');
  console.log('SMS key field present:', await pwInput.count());

  await page.screenshot({ path: 'notifications-page.png', fullPage: true });

  // ---- click "Go to News" link and confirm navigation
  await page.click('a:has-text("Go to News")');
  await page.waitForTimeout(800);
  console.log('After clicking Go to News, URL:', page.url());
  await page.screenshot({ path: 'notifications-news-nav.png', fullPage: true });

  // ---- check Admin mini-tab row active state on /notifications
  await page.goto(`${BASE}/notifications`);
  await page.waitForTimeout(600);
  const adminBtnSolid = await page.locator('a:has-text("Admin").btn-solid, a.btn-solid:has-text("Admin")').count();
  console.log('Admin nav pill highlighted on /notifications (expect >=1):', adminBtnSolid);

  console.log('Console/page errors:', errors);

  await browser.close();
})();
