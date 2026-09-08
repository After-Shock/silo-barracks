// Browser fixture checks: no test server or credential is written to the live DB.
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const BASE_URL = process.env.BARRACKS_BASE_URL || 'http://127.0.0.1:3000';
async function main() {
  const { chromium } = require(process.env.BARRACKS_PLAYWRIGHT || 'playwright');
  const token = execFileSync('docker', ['compose', 'exec', '-T', 'silo-barracks', 'node', '-e',
    "process.stdout.write(require('jsonwebtoken').sign({user:{id:1,authMode:'local'}},process.env.JWT_SECRET,{expiresIn:'5m'}))"], { encoding: 'utf8' }).trim();
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BARRACKS_CHROMIUM });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ token, version }) => {
      localStorage.setItem('token', token);
      // This suite exercises fleet interactions, not the asynchronous release-notes modal.
      localStorage.setItem('jellyglance_app_version', version);
      localStorage.setItem('jellyglance_whats_new_seen_version', version);
    }, { token, version: require('../apps/api/package.json').version });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.log('Browser error:', error.message); });
    // Check the deployed, authenticated fleet before installing UI fixtures.
    const real = await context.request.get(`${BASE_URL}/fleet`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(real.status(), 200);
    const live = await real.json();
    assert.ok(live.servers.some(server => server.id === 'primary' && server.state === 'connected'));
    assert.ok(!JSON.stringify(live).includes('apiKey'));
    let failed = false;
    let transportFailed = false;
    let extras = [{ id: 'extra', name: 'Remote Silo', url: 'https://fixture.invalid/api/v1', enabled: true, hasApiKey: true, isPrimary: false,
      connection: { apiMajor: 2, diagnosticsAvailable: true } }];
    const main = { id: 'primary', name: 'Primary Silo', url: 'https://primary.invalid/api/v1', enabled: true, isPrimary: true, hasApiKey: true };
    const session = (name, paused = false) => ({ Id: 'same-id', UserId: 'same-user', UserName: name,
      MediaServerProvider: 'silo', Client: 'Silo Web', DeviceName: 'Browser',
      SiloDiagnostics: { hardwareAcceleration: 'qsv', toneMapMode: 'hable', executionNode: 'GPU worker', egressNode: 'Edge worker', clientBuild: '42', sourceAudioCodec: 'truehd', targetAudioCodec: 'aac', targetAudioChannels: 2 },
      NowPlayingItem: { Id: '', SiloUnattributed: true, Name: 'Fixture movie', Type: 'Movie', RunTimeTicks: 36000000000 },
      PlayState: { IsPaused: paused, PositionTicks: 10000000, PlayMethod: 'DirectPlay' } });
    const snapshot = () => {
      const servers = [main, ...extras].map(server => {
        const bad = failed && !server.isPrimary;
        const active = server.enabled && !bad;
        return { id: server.id, name: server.name, enabled: server.enabled, isPrimary: server.isPrimary,
          state: !server.enabled ? 'disabled' : bad ? 'unavailable' : 'connected', lastSuccessAt: new Date().toISOString(),
          activeStreams: active ? 1 : server.enabled ? null : 0, pausedStreams: active && !server.isPrimary ? 1 : 0,
          sessions: server.enabled ? [{ ...session(server.isPrimary ? 'Local viewer' : 'Remote viewer', !server.isPrimary),
            FleetServerId: server.id, FleetServerName: server.name, stale: bad }] : [] };
      });
      return { updatedAt: new Date().toISOString(), servers, totalActiveStreams: servers.reduce((sum, s) => sum + (s.activeStreams || 0), 0),
        pausedStreams: servers.reduce((sum, s) => sum + s.pausedStreams, 0), partial: servers.some(s => s.enabled && s.state !== 'connected') };
    };
    await page.route(/\/fleet(?:\/|$|\?)/, async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (path === '/fleet') {
        if (transportFailed) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
        return route.fulfill({ json: snapshot() });
      }
      if (req.method() === 'GET') return route.fulfill({ json: [main, ...extras] });
      const body = req.method() === 'DELETE' ? null : req.postDataJSON();
      if (req.method() === 'POST') {
        assert.equal(body.apiKey, 'fixture-key');
        const added = { id: 'added', name: body.name, url: body.url, enabled: true, isPrimary: false, hasApiKey: true };
        extras.push(added);
        return route.fulfill({ status: 201, json: added });
      }
      const id = path.split('/').pop();
      if (req.method() === 'DELETE') { extras = extras.filter(s => s.id !== id); return route.fulfill({ status: 204 }); }
      const server = extras.find(s => s.id === id);
      Object.assign(server, body);
      delete server.apiKey;
      return route.fulfill({ json: server });
    });
    await page.goto(`${BASE_URL}/`);
    await page.getByTestId('fleet-total').filter({ hasText: '2' }).waitFor().catch(async error => {
      console.log((await page.locator('body').innerText()).slice(0, 2200));
      await page.screenshot({ path: `${process.env.BARRACKS_QA_DIR}/fleet-failure.png` });
      throw error;
    });
    await page.locator('.nav-live-count[aria-label="2 active streams"]').waitFor();
    const gotIt = page.getByRole('button', { name: 'Got it', exact: true });
    if (await gotIt.isVisible()) await gotIt.click();
    assert.equal(await page.locator('.fleet-stream').count(), 2);
    assert.equal(await page.locator('.fleet-stream .card-device-image[alt="Silo"]').count(), 2);
    assert.ok(!(await page.locator('.fleet-streams').innerText()).includes('undefined'));
    assert.equal(await page.locator('.fleet-stream').filter({ hasText: 'Remote viewer' }).locator('a[href*="/users/"],a[href*="/item/"]').count(), 0);
    assert.equal(await page.locator('.fleet-stream a[href*="/item/"]').count(), 0, 'unattributed content has no catalog link');
    await page.locator('[aria-label^="Open session details"]').first().press('Enter');
    await page.locator('.session-popout-grid').getByText('GPU worker', { exact: true }).waitFor();
    await page.locator('.session-popout-grid').getByText('hable', { exact: true }).waitFor();
    await page.locator('.session-popout-grid').getByText('Primary Silo', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close session details' }).click();
    await page.getByLabel('Show activity').selectOption('extra');
    assert.equal(await page.locator('.fleet-stream').count(), 1);
    await page.getByLabel('Show activity').selectOption('all');
    failed = true;
    await page.getByTestId('fleet-total').filter({ hasText: /^1$/ }).waitFor();
    await page.getByText('Stale · last known activity', { exact: true }).waitFor();
    await page.screenshot({ path: `${process.env.BARRACKS_QA_DIR}/fleet-partial.png` });
    failed = false;
    await page.getByTestId('fleet-total').filter({ hasText: /^2$/ }).waitFor();
    transportFailed = true;
    await page.getByText('Current total unavailable', { exact: true }).waitFor();
    assert.equal(await page.getByTestId('fleet-total').textContent(), '—');
    transportFailed = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByTestId('fleet-total').filter({ hasText: /^2$/ }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const box = await page.locator('.fleet-overview').boundingBox();
    assert.ok(box.x + box.width <= 391, 'fleet fits mobile');
    await page.screenshot({ path: `${process.env.BARRACKS_QA_DIR}/fleet-mobile.png` });
    await page.locator('[aria-label^="Open session details"]').first().press('Enter');
    await page.locator('.session-popout-grid').getByText('Edge worker', { exact: true }).waitFor();
    await page.screenshot({ path: `${process.env.BARRACKS_QA_DIR}/fleet-v2-diagnostics-mobile.png`, animations: 'disabled' });
    await page.getByRole('button', { name: 'Close session details' }).click();
    await page.goto(`${BASE_URL}/settings/servers`);
    await page.getByRole('heading', { name: 'Silo Servers', exact: true }).waitFor();
    await page.getByText('API v2 · Extended diagnostics available', { exact: true }).waitFor();
    await page.getByLabel('Server name', { exact: true }).fill('Added fixture');
    await page.getByLabel('Silo URL', { exact: true }).fill('https://added.invalid');
    await page.getByLabel('Administrator API key', { exact: true }).fill('fixture-key');
    await page.getByRole('button', { name: 'Test & add server', exact: true }).click();
    const added = page.locator('.server-settings-row').filter({ hasText: 'Added fixture' });
    await added.waitFor();
    await added.getByRole('button', { name: 'Edit', exact: true }).click();
    assert.equal(await page.getByLabel('Administrator API key', { exact: true }).inputValue(), '');
    await page.getByLabel('Server name', { exact: true }).fill('Renamed fixture');
    await page.getByRole('button', { name: 'Save server', exact: true }).click();
    const renamed = page.locator('.server-settings-row').filter({ hasText: 'Renamed fixture' });
    await renamed.waitFor();
    await renamed.getByRole('button', { name: 'Disable', exact: true }).click();
    await renamed.getByText('Monitoring disabled', { exact: true }).waitFor();
    await renamed.getByRole('button', { name: 'Enable', exact: true }).click();
    await renamed.getByRole('button', { name: 'Disable', exact: true }).waitFor();
    await renamed.getByRole('button', { name: 'Remove', exact: true }).click();
    await renamed.getByRole('button', { name: 'Confirm remove', exact: true }).click();
    await renamed.waitFor({ state: 'hidden' });
    await page.screenshot({ path: `${process.env.BARRACKS_QA_DIR}/fleet-settings-mobile.png` });
    assert.deepEqual(errors, []);
    console.log('PASS: live primary, combined totals, colliding IDs, filtering, partial/stale, transport failure, recovery, mobile and server CRUD UI. Fixture writes only.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
