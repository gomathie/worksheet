const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8788';
const SHOTS = 'C:/Users/gomat/AppData/Local/Temp/claude/c--Users-gomat-Downloads-worksheet/255500bb-5ca5-4f80-a1d3-3399909063f9/scratchpad';

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
  console.log('OK: ' + msg);
}

async function login(page, username, password) {
  await page.goto(BASE + '/login');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 });
}

(async () => {
  const browser = await chromium.launch();
  const instCtx = await browser.newContext();
  const installer = await instCtx.newPage();
  installer.on('dialog', (d) => { console.log('[native dialog]', d.message()); d.accept(); });
  await login(installer, 'testinstaller', 'test12345');
  await installer.waitForSelector('text=Recent entries');
  await installer.waitForTimeout(800);

  const cardName = 'AuditDup_' + Date.now().toString().slice(-6);
  const classPanel = installer.locator('div.mb-2.flex.items-center.justify-between', { hasText: 'Classification cards' });

  await installer.fill('#date', '2026-08-06');
  await classPanel.locator('button:has-text("+ Add card")').click();
  await installer.locator('input[placeholder="Pick or type a name"]').fill(cardName);
  await installer.click('button:has-text("Add entry")');
  await installer.waitForSelector('text=Recent entries');
  await installer.waitForTimeout(800);

  await installer.fill('#date', '2026-08-06');
  await classPanel.locator('button:has-text("+ Add card")').click();
  await installer.locator('input[placeholder="Pick or type a name"]').fill(cardName);
  await installer.click('button:has-text("Add entry")');
  await installer.waitForSelector('text=Already done today', { timeout: 10000 });
  await installer.click('button:has-text("Continue and notify admins")');
  await installer.waitForTimeout(1000);
  console.log('OK: created a same-day duplicate card');

  // ---- Card Audit, as admin ----
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, 'localadmin', 'localtest123');
  await admin.goto(BASE + '/card-audit');
  await admin.waitForSelector('h2:has-text("Card audit")');
  await admin.fill('#ca-q', cardName);
  await admin.click('button:has-text("Search")');
  await admin.waitForTimeout(800);
  await admin.screenshot({ path: SHOTS + '/audit-01-grouped.png', fullPage: true });

  assert(await admin.locator('tr.group-head', { hasText: 'Aug 6, 2026' }).isVisible(), 'day-group heading shown');
  assert(await admin.locator('text=logged 2 times this day').isVisible(), 'same-day count called out');
  const openLink = admin.locator('a:has-text("Open")').first();
  assert(await openLink.isVisible(), '"Open" action link present');

  await openLink.click();
  await admin.waitForURL((u) => u.toString().startsWith(BASE + '/'), { timeout: 10000 });
  await admin.waitForTimeout(1200);
  await admin.screenshot({ path: SHOTS + '/audit-02-opened-highlighted.png', fullPage: true });

  assert(!admin.url().includes('entry='), 'deep-link query params cleared from the URL after landing');
  const monthValue = await admin.locator('input[aria-label="Filter month"]').inputValue();
  assert(monthValue === '2026-08', 'Recent entries pre-filtered to the right month');
  const empValue = await admin.locator('select[aria-label="Filter employee"]').inputValue();
  const empLabel = await admin.locator('select[aria-label="Filter employee"] option:checked').textContent();
  assert(empLabel.trim() === 'Test Installer', 'Recent entries pre-filtered to the right employee');
  console.log('OK: "Open" landed on Recent entries pre-filtered and highlighted');

  await browser.close();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
