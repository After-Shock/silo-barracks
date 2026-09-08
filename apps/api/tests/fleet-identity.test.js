const test = require('node:test');
const assert = require('node:assert/strict');
const { createIdentityGuard } = require('../classes/fleet-identity');
const primary = { id: 'primary', isPrimary: true, url: 'https://one', apiKey: 'private' };
const extra = { id: 'extra', upstreamId: 'two', url: 'https://two', apiKey: 'private2' };
test('identity failure keeps extras available; recovery and changed primary exclude physical duplicates', async () => {
  let failed = true;
  let calls = 0;
  const guard = createIdentityGuard({ identify: async server => {
    calls++;
    if (failed) throw new Error('private');
    return { id: server.url.includes('alias') ? 'two' : 'one' };
  } });
  const initial = await guard.resolve([primary, extra]);
  assert.equal(initial[0].apiKey, null);
  assert.equal(initial[1], extra);
  assert.equal(primary.apiKey, 'private');
  failed = false;
  assert.equal((await guard.resolve([primary, extra]))[0].apiKey, 'private');
  await guard.resolve([primary, extra]);
  assert.equal(calls, 2);
  assert.equal((await guard.resolve([{ ...primary, url: 'https://alias' }, extra])).length, 1);
});
test('concurrent identity lookups are shared and exact URL duplicates are excluded during failure', async () => {
  let calls = 0;
  let release;
  const guard = createIdentityGuard({ identify: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const first = guard.resolve([primary, extra]);
  const second = guard.resolve([primary, extra]);
  await Promise.resolve();
  release('one');
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  const broken = createIdentityGuard({ identify: async () => { throw new Error('offline'); } });
  assert.equal((await broken.resolve([primary, { ...extra, url: primary.url }])).length, 1);
});
