const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8788';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE + '/login');
  await page.fill('#username', 'localadmin');
  await page.fill('#password', 'localtest123');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 });
  await page.goto(BASE + '/?month=2026-08&employee_id=5a7500e2-9f2b-4561-827b-ecdd3ff3dd8f&entry=test123');
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const sel = document.querySelector('select[aria-label="Filter employee"]');
    return {
      value: sel.value,
      checkedText: sel.querySelector('option:checked')?.textContent,
      allOptions: [...sel.options].map(o => ({ value: o.value, text: o.textContent, selected: o.selected })),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
