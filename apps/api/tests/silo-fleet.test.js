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

test('controls only a current session on the explicitly selected server', async () => {
  const commands = [];
  const fleet = createFleet({
    listServers: async () => [server('one'), server('two')],
    createClient: current => ({
      getSessions: async () => [session(`${current.id}-session`)],
      getSessionCommandCapabilities: async () => ({ available: true, allowed: true, actions: ['pause'] }),
      controlSession: async (id, action, payload) => { commands.push({ server: current.id, id, action, payload }); return { status: 202 }; },
    }),
  });
  await fleet.refresh();
  assert.deepEqual((await fleet.sessionCommandCapabilities('one')).actions, ['pause']);
  assert.equal((await fleet.controlSession('two', 'two-session', 'pause', { reason: 'test' })).status, 202);
  assert.deepEqual(commands, [{ server: 'two', id: 'two-session', action: 'pause', payload: { reason: 'test' } }]);
  await assert.rejects(fleet.controlSession('one', 'two-session', 'pause', {}), error => error.status === 409);
});

test('reads retention-managed history from one explicitly selected server', async () => {
  const fleet = createFleet({
    listServers: async () => [server('one'), server('two')],
    createClient: current => ({
      getSessions: async () => [],
      getPlaybackHistoryPage: async options => ({ results: [{ Id: `${current.id}-history` }], currentPage: options.page, hasMore: true, nextCursor: 'next' }),
      getPlaybackHistoryUsers: async () => [{ Id: `${current.id}-user` }],
      getPlaybackHistoryProfiles: async userId => [{ id: `${current.id}-${userId}-profile` }],
      getItemsByID: async ({ ids }) => [{ Id: ids[0], Name: `${current.id} item` }],
      getUserById: async userId => ({ Id: userId, Name: `${current.id} user` }),
      getLibraries: async () => [{ Id: 'library', Name: `${current.id} library` }],
      getLibraryCatalogSummary: async () => ({ total: 3, totalExact: true }),
      getLibraryStorageMetadata: async () => [{ Id: 'library', Size: 100, files: 2 }],
      getLibraryItemsPage: async () => [{ Id: 'item-1' }, { Id: 'item-2' }],
      getLibraryPlaybackHistoryPage: async () => ({ results: [{ Id: 'library-history' }], hasMore: false }),
    }),
  });
  await fleet.refresh();
  const history = await fleet.playbackHistoryPage('two', { page: 1, limit: 10 });
  assert.equal(history.serverId, 'two');
  assert.equal(history.results[0].Id, 'two-history');
  assert.equal(history.results[0].FleetServerId, 'two');
  assert.equal((await fleet.playbackHistoryUsers('two')).users[0].Id, 'two-user');
  assert.equal((await fleet.playbackHistoryProfiles('two', 'user')).profiles[0].id, 'two-user-profile');
  assert.equal((await fleet.catalogItem('two', 'item')).item.FleetServerId, 'two');
  assert.equal((await fleet.historyUser('two', 'user')).user.Name, 'two user');
  assert.equal((await fleet.libraryList('two')).libraries[0].FleetServerId, 'two');
  assert.equal((await fleet.libraryDetail('two', 'library')).library.Library_Count, 3);
  assert.equal((await fleet.libraryItems('two', 'library', { limit: 1 })).results[0].FleetServerId, 'two');
  assert.equal((await fleet.libraryHistoryPage('two', 'library')).results[0].FleetServerId, 'two');
  await assert.rejects(fleet.playbackHistoryPage('missing', {}), error => error.status === 503);
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

test('registry failure invalidates late polls so unavailable servers cannot re-enter totals', async () => {
  let failList = false;
  let calls = 0;
  const late = deferred();
  const fleet = createFleet({
    listServers: async () => {
      if (failList) throw new Error('registry unavailable');
      return [server('one')];
    },
    createClient: () => ({ getSessions: async () => {
      calls += 1;
      return calls === 1 ? [session('initial')] : late.promise;
    } }),
    publish: async () => {},
  });

  await fleet.refresh();
  const polling = fleet.refresh();
  await waitFor(() => calls === 2);
  failList = true;
  await fleet.refresh();
  late.resolve([session('late')]);
  await polling;

  const snapshot = fleet.snapshot();
  assert.equal(snapshot.partial, true);
  assert.equal(snapshot.totalActiveStreams, 0);
  assert.equal(snapshot.servers[0].state, 'unavailable');
  assert.equal(snapshot.servers[0].sessions[0].Id, 'initial');
});
