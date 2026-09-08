'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFleet } = require('../classes/silo-fleet');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function server(id, overrides = {}) {
  return { id, name: `Silo ${id}`, isPrimary: id === 'primary', enabled: true,
    url: `https://${id}.internal`, apiKey: `${id}-secret`, upstreamId: `up-${id}`, ...overrides };
}

function session(id, { paused = false, serverId = 'upstream', item = { Id: 'item-1', Name: 'Film' } } = {}) {
  return { Id: id, ServerId: serverId, PlayState: { IsPaused: paused }, NowPlayingItem: item };
}

async function tick() {
  await new Promise(resolve => setImmediate(resolve));
}

async function waitFor(predicate, message = 'condition was not met') {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(message);
}

test('combines healthy servers and scopes colliding session IDs', async () => {
  const fleet = createFleet({
    listServers: async () => [server('one'), server('two')],
    createClient: current => ({ getSessions: async () => [session('same', { serverId: current.upstreamId })] }),
    publish: async () => {},
    now: () => 1_000,
  });

  await fleet.refresh();
  const snapshot = fleet.snapshot();
  assert.equal(snapshot.totalActiveStreams, 2);
  assert.equal(snapshot.playingStreams, 2);
  assert.equal(snapshot.pausedStreams, 0);
  assert.equal(snapshot.partial, false);
  assert.deepEqual(snapshot.servers.map(row => row.state), ['connected', 'connected']);
  assert.deepEqual(snapshot.servers.map(row => row.sessions[0].FleetSessionId), ['one:same', 'two:same']);
  assert.equal(snapshot.servers[0].sessions[0].Id, 'same');
  assert.equal(snapshot.servers[0].sessions[0].ServerId, 'up-one');
  assert.equal(snapshot.servers[0].sessions[0].FleetServerId, 'one');
  assert.equal(snapshot.servers[1].sessions[0].FleetServerName, 'Silo two');
  assert.ok(!JSON.stringify(snapshot).includes('secret'));
});

test('publishes a fast server while another server is still pending', async () => {
  const slow = deferred();
  const events = [];
  const fleet = createFleet({
    listServers: async () => [server('fast'), server('slow')],
    createClient: current => ({
      getSessions: current.id === 'slow' ? () => slow.promise : async () => [session('fast-session')],
    }),
    publish: async snapshot => { events.push(snapshot); },
    now: () => 2_000,
  });

  const refreshing = fleet.refresh();
  await waitFor(() => events.some(event => event.servers.some(row => row.id === 'fast' && row.state === 'connected')));
  assert.equal(fleet.snapshot().servers.find(row => row.id === 'fast').state, 'connected');
  assert.equal(fleet.snapshot().servers.find(row => row.id === 'slow').state, 'connecting');
  slow.resolve([session('slow-session')]);
  await refreshing;
  assert.equal(fleet.snapshot().servers.find(row => row.id === 'slow').state, 'connected');
});

test('shares the four-slot limit across overlapping refreshes', async () => {
  const rows = Array.from({ length: 7 }, (_value, index) => server(`s${index}`));
  const waits = new Map();
  let active = 0;
  let maximum = 0;
  const calls = new Map();
  const fleet = createFleet({
    listServers: async () => rows,
    createClient: current => ({ getSessions: () => {
      calls.set(current.id, (calls.get(current.id) || 0) + 1);
      active += 1;
      maximum = Math.max(maximum, active);
      const wait = deferred();
      waits.set(current.id, wait);
      return wait.promise.finally(() => { active -= 1; });
    } }),
    publish: async () => {},
  });

  const first = fleet.refresh();
  const second = fleet.refresh();
  await waitFor(() => active === 4);
  assert.equal(maximum, 4);
  assert.ok([...calls.values()].every(count => count === 1));
  const released = new Set();
  while (calls.size < rows.length) {
    for (const [id, wait] of waits) {
      if (released.has(id)) continue;
      released.add(id);
      wait.resolve([]);
    }
    await tick();
  }
  for (const [id, wait] of waits) {
    if (!released.has(id)) wait.resolve([]);
  }
  await Promise.all([first, second]);
  assert.equal(Math.max(...calls.values()), 1);
});

test('retains stale sessions on failure, expires their counts, and recovers', async () => {
  let clock = 3_000;
  let fail = false;
  const fleet = createFleet({
    listServers: async () => [server('one')],
    createClient: () => ({ getSessions: async () => {
      if (fail) throw new Error('https://secret.invalid?api_key=hidden');
      return [session('one-session', { paused: true })];
    } }),
    publish: async () => {},
    now: () => clock,
    staleAfterMs: 20_000,
  });

  await fleet.refresh();
  fail = true;
  clock += 1_000;
  await fleet.refresh();
  let snapshot = fleet.snapshot();
  assert.equal(snapshot.servers[0].state, 'unavailable');
  assert.equal(snapshot.servers[0].activeStreams, null);
  assert.equal(snapshot.servers[0].sessions[0].stale, true);
  assert.equal(snapshot.servers[0].sessions[0].FleetSessionId, 'one:one-session');
  assert.equal(snapshot.partial, true);
  assert.ok(!JSON.stringify(snapshot).includes('secret'));

  clock += 20_001;
  snapshot = fleet.snapshot();
  assert.equal(snapshot.servers[0].state, 'unavailable');
  assert.equal(snapshot.servers[0].activeStreams, null);
  fail = false;
  await fleet.refresh();
  snapshot = fleet.snapshot();
  assert.equal(snapshot.servers[0].state, 'connected');
  assert.equal(snapshot.servers[0].activeStreams, 1);
  assert.equal(snapshot.servers[0].pausedStreams, 1);
});

test('disabled and removed servers contribute neither sessions nor partial state', async () => {
  let registry = [server('one')];
  const fleet = createFleet({
    listServers: async () => registry,
    createClient: () => ({ getSessions: async () => [session('one-session')] }),
    publish: async () => {},
  });
  await fleet.refresh();
  registry = [server('one', { enabled: false })];
  await fleet.refresh();
  let snapshot = fleet.snapshot();
  assert.deepEqual(snapshot.servers[0].sessions, []);
  assert.equal(snapshot.servers[0].state, 'disabled');
  assert.equal(snapshot.servers[0].activeStreams, 0);
  assert.equal(snapshot.partial, false);
  registry = [];
  await fleet.refresh();
  snapshot = fleet.snapshot();
  assert.deepEqual(snapshot.servers, []);
  assert.equal(snapshot.partial, false);
});

test('ignores late responses after invalidation and polls the replacement configuration', async () => {
  let registry = [server('one', { url: 'https://old.internal', apiKey: 'old-secret' })];
  const oldResponse = deferred();
  const newResponse = deferred();
  let calls = 0;
  const fleet = createFleet({
    listServers: async () => registry,
    createClient: current => ({ getSessions: () => {
      calls += 1;
      return calls === 1 ? oldResponse.promise : newResponse.promise;
    } }),
    publish: async () => {},
  });
  const first = fleet.refresh();
  await waitFor(() => calls === 1);
  registry = [server('one', { url: 'https://new.internal', apiKey: 'new-secret' })];
  fleet.invalidate('one');
  const second = fleet.refresh();
  await tick();
  assert.equal(calls, 1, 'the old request must keep the per-ID slot');
  oldResponse.resolve([session('old-session')]);
  await waitFor(() => calls === 2);
  newResponse.resolve([session('new-session')]);
  await Promise.all([first, second]);
  const snapshot = fleet.snapshot();
  assert.equal(snapshot.servers[0].sessions[0].Id, 'new-session');
});

test('list failures preserve sessions and publication failures do not cause an outage', async () => {
  let failList = false;
  let publishes = 0;
  const fleet = createFleet({
    listServers: async () => {
      if (failList) throw new Error('postgres https://private.invalid?key=secret');
      return [server('one')];
    },
    createClient: () => ({ getSessions: async () => [session('one-session')] }),
    publish: async () => { publishes += 1; throw new Error('socket token secret'); },
  });
  await fleet.refresh();
  assert.equal(fleet.snapshot().servers[0].state, 'connected');
  failList = true;
  await fleet.refresh();
  const snapshot = fleet.snapshot();
  assert.equal(snapshot.servers[0].state, 'unavailable');
  assert.equal(snapshot.servers[0].sessions[0].Id, 'one-session');
  assert.equal(snapshot.servers[0].activeStreams, null);
  assert.ok(publishes > 0);
  assert.ok(!JSON.stringify(snapshot).includes('secret'));
});

test('a registry failure is partial even when no prior server list exists', async () => {
  const fleet = createFleet({
    listServers: async () => { throw new Error('database URL and password'); },
    createClient: () => ({ getSessions: async () => [] }),
    publish: async () => {},
  });
  await fleet.refresh();
  assert.deepEqual(fleet.snapshot().servers, []);
  assert.equal(fleet.snapshot().partial, true);
});
