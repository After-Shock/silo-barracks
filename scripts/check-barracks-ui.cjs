// Local smoke check. Uses an ephemeral token, never prints or stores credentials.
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');

async function main() {
  const { chromium } = require(process.env.BARRACKS_PLAYWRIGHT || 'playwright');
  const token = execFileSync('docker', ['compose', 'exec', '-T', 'silo-barracks', 'node', '-e',
    "process.stdout.write(require('jsonwebtoken').sign({user:{id:1,authMode:'local'}},process.env.JWT_SECRET,{expiresIn:'5m'}))"],
    { encoding: 'utf8' }).trim();
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BARRACKS_CHROMIUM });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.log('Browser error:', error.stack); });
    await page.goto(process.env.BARRACKS_BASE_URL || 'http://127.0.0.1:3000');
    await page.getByRole('button', { name: 'Login', exact: true }).waitFor();
    await page.screenshot({ path: `${process.env.BARRACKS_QA_DIR}/login.png` });
    await page.evaluate(token => localStorage.setItem('token', token), token);
    await page.reload();
    await page.getByText('Active Sessions', { exact: true }).first().waitFor();
    const gotIt = page.getByRole('button', { name: 'Got it', exact: true });
    if (await gotIt.isVisible()) {
      await gotIt.click();
      await gotIt.waitFor({ state: 'hidden' });
    }
    await page.screenshot({ path: `${process.env.BARRACKS_QA_DIR}/dashboard.png` });
    const failures = [];
    const timings = [];
    const polls = Number(process.env.BARRACKS_SMOKE_POLLS) || 16;
    for (let i = 0; i < polls; i++) {
      const started = Date.now();
      const response = await context.request.get(`${process.env.BARRACKS_BASE_URL || 'http://127.0.0.1:3000'}/proxy/getSessions`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      timings.push(Date.now() - started);
      if (response.status() !== 200) failures.push(response.status());
      else assert.ok(Array.isArray(await response.json()));
      if ((i + 1) % 4 === 0) console.log(`Live activity checks: ${i + 1}/${polls}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    console.log(JSON.stringify({ polls: timings.length, failures, maxMs: Math.max(...timings),
      pageErrors: errors, activityNotice: await page.locator('.session-connection-status').allTextContents() }));
    await page.screenshot({ path: `${process.env.BARRACKS_QA_DIR}/dashboard.png` });
    await page.goto(`${process.env.BARRACKS_BASE_URL || 'http://127.0.0.1:3000'}/activity`);
    await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
    await page.screenshot({ path: `${process.env.BARRACKS_QA_DIR}/activity.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    const controls = await page.locator('.activity-controls').boundingBox();
    if (controls.x + controls.width > 391) console.log(await page.evaluate(() =>
      [...document.querySelectorAll('body,.App,.app-shell-main,.Activity,.activity-page-header,.activity-controls')]
        .map(el => ({ element: el.className || el.tagName, width: el.getBoundingClientRect().width,
          cssWidth: getComputedStyle(el).width, minWidth: getComputedStyle(el).minWidth,
          grid: getComputedStyle(el).gridTemplateColumns, display: getComputedStyle(el).display }))));
    assert.ok(controls.x + controls.width <= 391, 'activity controls must fit the mobile viewport');
    await page.screenshot({ path: `${process.env.BARRACKS_QA_DIR}/mobile.png` });
    assert.deepEqual(failures, []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
