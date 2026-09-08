const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createFleetRouter } = require('../routes/fleet');

async function appFor(t, registry) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.permissions = { dashboard: req.headers['x-test-dashboard'] !== 'no', settings: req.headers['x-test-admin'] === 'yes' }; next(); });
  app.use('/fleet', createFleetRouter({ registry, fleet: { snapshot: () => ({ totalActiveStreams: 3 }), invalidate() {}, refresh: async () => {} } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/fleet`;
}

test('dashboard access can read totals but cannot list connection URLs or change servers', async t => {
  let calls = 0;
  const base = await appFor(t, { listPublic: async () => { calls++; return []; },
    add: async () => calls++, update: async () => calls++, remove: async () => calls++ });
  assert.deepEqual(await (await fetch(base)).json(), { totalActiveStreams: 3 });
  for (const [path, method] of [['/servers', 'GET'], ['/servers', 'POST'], ['/servers/x', 'PUT'], ['/servers/x', 'DELETE']]) {
    assert.equal((await fetch(base + path, { method })).status, 403);
  }
  assert.equal(calls, 0);
});

test('management errors do not leak database details, keys, or upstream addresses', async t => {
  const base = await appFor(t, { listPublic: async () => { throw new Error('secret sa_123 https://private.test'); } });
  const result = await fetch(base + '/servers', { headers: { 'x-test-admin': 'yes' } });
  assert.equal(result.status, 503);
  assert.ok(!(await result.text()).includes('secret'));
});

test('settings-only permission can manage connections but cannot view activity', async t => {
  const base = await appFor(t, { listPublic: async () => [] });
  const headers = { 'x-test-admin': 'yes', 'x-test-dashboard': 'no' };
  assert.equal((await fetch(base, { headers })).status, 403);
  assert.equal((await fetch(base + '/servers', { headers })).status, 200);
});
