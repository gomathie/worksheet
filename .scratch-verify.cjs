// End-to-end smoke test for:
//   1. Device-type propose/approve/reject workflow
//   2. "Everyone" broadcast task + Accept flow
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8788';
const SHOTS = 'C:\\Users\\gomat\\AppData\\Local\\Temp\\claude\\c--Users-gomat-Downloads-worksheet\\255500bb-5ca5-4f80-a1d3-3399909063f9\\scratchpad';
let shotN = 0;
async function shot(page, name) {
  shotN += 1;
  await page.screenshot({ path: `${SHOTS}\\${String(shotN).padStart(2, '0')}-${name}.png`, fullPage: true });
}

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
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  admin.on('console', (m) => { if (m.type() === 'error') console.log('  [admin console error]', m.text()); });

  // ================================================================ admin
  await login(admin, 'localadmin', 'localtest123');
  console.log('admin logged in');

  // ---- create the test installer employee (idempotent-ish: ignore if exists) ----
  await admin.goto(BASE + '/employees');
  await admin.waitForSelector('h2:has-text("Employees")', { timeout: 10000 });
  const addBtn = admin.locator('button:has-text("+ Add employee")');
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click();
    await admin.fill('#name', 'Test Installer');
    await admin.fill('#username', 'testinstaller');
    await admin.fill('#password', 'test12345');
    // Assign the Telematics Installation work type.
    const wtCheckbox = admin.locator('label:has-text("Telematics Installation") input[type="checkbox"]');
    await wtCheckbox.check();
    await shot(admin, 'employee-form-filled');
    await admin.click('form button:has-text("Add")');
    await admin.waitForTimeout(1000);
  }
  await shot(admin, 'employees-after-create');

  // ================================================== device-type propose
  const installerCtx = await browser.newContext();
  const installer = await installerCtx.newPage();
  installer.on('console', (m) => { if (m.type() === 'error') console.log('  [installer console error]', m.text()); });
  await login(installer, 'testinstaller', 'test12345');
  console.log('installer logged in');

  await installer.goto(BASE + '/entries');
  await installer.waitForSelector('text=Telematics Installation cards', { timeout: 10000 });
  await shot(installer, 'entries-installer');

  const suggestLink = installer.locator('button:has-text("Can\'t find your device? Suggest a device type")');
  await suggestLink.click();
  const deviceName = 'PlaywrightDevice' + Date.now().toString().slice(-5);
  await installer.fill('#propose-device-name', deviceName);
  await shot(installer, 'propose-device-form');
  await installer.click('button:has-text("Send for approval")');
  await installer.waitForSelector('text=Sent for admin approval', { timeout: 10000 });
  await shot(installer, 'propose-device-sent');
  console.log('OK: device type proposal submitted:', deviceName);

  // Confirm it is NOT yet in the normal (approved) list.
  const listBefore = await installer.request.get(BASE + '/api/device-types').then((r) => r.json());
  assert(!listBefore.some((d) => d.name === deviceName), 'proposed device type is not selectable before approval');

  // ================================================== admin approves it
  await admin.goto(BASE + '/settings');
  await admin.waitForSelector('h2:has-text("Device types")', { timeout: 10000 });
  await admin.waitForSelector('text=Suggested by installers', { timeout: 10000 });
  await shot(admin, 'settings-pending-device-types');
  const pendingRow = admin.locator('tr', { hasText: deviceName });
  assert(await pendingRow.isVisible(), 'pending device type row visible in Settings');
  assert((await pendingRow.textContent()).includes('Test Installer'), 'pending row shows proposer name');
  await pendingRow.locator('button:has-text("Approve")').click();
  await admin.waitForTimeout(800);
  await shot(admin, 'settings-after-approve');

  const listAfter = await admin.request.get(BASE + '/api/device-types').then((r) => r.json());
  assert(listAfter.some((d) => d.name === deviceName), 'device type now selectable after approval');

  // ---- reject path: propose + reject ----
  await installer.goto(BASE + '/entries');
  await installer.waitForSelector('text=Telematics Installation cards', { timeout: 10000 });
  await installer.locator('button:has-text("Can\'t find your device? Suggest a device type")').click();
  const rejectName = 'RejectMe' + Date.now().toString().slice(-5);
  await installer.fill('#propose-device-name', rejectName);
  await installer.click('button:has-text("Send for approval")');
  await installer.waitForSelector('text=Sent for admin approval', { timeout: 10000 });

  await admin.goto(BASE + '/settings');
  await admin.waitForSelector('text=Suggested by installers', { timeout: 10000 });
  const rejectRow = admin.locator('tr', { hasText: rejectName });
  await rejectRow.locator('button:has-text("Reject")').click();
  await admin.waitForTimeout(400);
  // Rejecting without a note should show an error and NOT remove the row.
  assert(await rejectRow.isVisible(), 'reject without a note is refused, row still pending');
  await rejectRow.locator('input[placeholder="Required to reject"]').fill('Not a real device, testing rejection.');
  await rejectRow.locator('button:has-text("Reject")').click();
  await admin.waitForTimeout(800);
  await shot(admin, 'settings-after-reject');
  const listAfterReject = await admin.request.get(BASE + '/api/device-types').then((r) => r.json());
  assert(!listAfterReject.some((d) => d.name === rejectName), 'rejected device type never becomes selectable');
  console.log('OK: device-type propose/approve/reject workflow verified end to end');

  // ============================================== broadcast task + accept
  await admin.goto(BASE + '/tasks');
  await admin.waitForSelector('h2:has-text("Tasks")', { timeout: 10000 });
  const taskTitle = 'Playwright broadcast task ' + Date.now().toString().slice(-5);
  await admin.fill('#t-title', taskTitle);
  await admin.selectOption('#t-assignee', { label: 'Everyone — first to accept it' });
  await shot(admin, 'task-form-everyone');
  await admin.click('form button:has-text("Add task")');
  await admin.waitForTimeout(800);
  await shot(admin, 'tasks-after-broadcast-create');

  const taskRow = admin.locator('.panel', { hasText: taskTitle });
  assert(await taskRow.locator('text=Everyone').isVisible(), 'new task shows the Everyone badge');
  assert((await taskRow.textContent()).includes('first to accept it'), 'unclaimed broadcast task shows pool wording');

  // Installer should see it in their list (broadcast tasks are visible to all)
  // and be able to Accept it right there, no Edit detour.
  await installer.goto(BASE + '/tasks');
  await installer.waitForSelector('h2:has-text("Tasks")', { timeout: 10000 });
  const installerTaskRow = installer.locator('.panel', { hasText: taskTitle });
  assert(await installerTaskRow.isVisible(), 'broadcast task visible to an unrelated employee');
  await shot(installer, 'tasks-installer-sees-broadcast');
  assert(!(await installerTaskRow.locator('button:has-text("Edit")').isVisible().catch(() => false)), 'installer has no Edit on a task they do not own');
  await installerTaskRow.locator('button:has-text("Accept")').click();
  await installer.waitForTimeout(800);
  await shot(installer, 'tasks-installer-after-accept');
  assert((await installerTaskRow.textContent()).includes('Test Installer'), 'task now shows Test Installer as assignee after accepting');
  assert(!(await installerTaskRow.locator('button:has-text("Accept")').isVisible().catch(() => false)), 'Accept button gone once claimed');

  // Also verify Accept works right on the task detail (View) page for a
  // *second* broadcast task, with no trip through Edit.
  const taskTitle2 = 'Playwright detail-accept task ' + Date.now().toString().slice(-5);
  await admin.goto(BASE + '/tasks');
  await admin.fill('#t-title', taskTitle2);
  await admin.selectOption('#t-assignee', { label: 'Everyone — first to accept it' });
  await admin.click('form button:has-text("Add task")');
  await admin.waitForTimeout(800);

  await installer.goto(BASE + '/tasks');
  const row2 = installer.locator('.panel', { hasText: taskTitle2 });
  await row2.locator('a:has-text("View")').click();
  await installer.waitForURL(/\/tasks\/[\w-]+$/, { timeout: 10000 });
  await shot(installer, 'task-detail-before-accept');
  assert(await installer.locator('button:has-text("Accept this task")').isVisible(), 'Accept button present right on the detail/view page');
  assert(!(await installer.locator('a:has-text("Edit")').isVisible().catch(() => false)), 'no Edit link needed to accept from the view page');
  await installer.click('button:has-text("Accept this task")');
  await installer.waitForTimeout(800);
  await shot(installer, 'task-detail-after-accept');
  assert((await installer.textContent('body')).includes('Test Installer'), 'detail page shows Test Installer as assignee after accepting');

  console.log('OK: broadcast task + accept-from-view workflow verified end to end');

  await browser.close();
  console.log('ALL CHECKS PASSED');
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
