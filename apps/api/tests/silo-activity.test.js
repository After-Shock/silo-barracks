const test = require('node:test');
const assert = require('node:assert/strict');
const { planSnapshot, createPoller } = require('../tasks/silo-activity');

const start = Date.parse('2026-09-06T12:00:00Z');
function session(id = 'session-1', paused = false, profile = 'profile-a') {
  return { Id: id, ServerId: 'server-1', UserId: '12', UserName: 'alex',
    DeviceId: id, DeviceName: 'Living room', Client: 'Silo TV',
    ProfileId: profile, ProfileName: profile, PlayState: { IsPaused: paused, PositionTicks: 120000000, PlayMethod: 'DirectPlay' },
    NowPlayingItem: { Id: 'movie-1', Name: 'Movie', Type: 'Movie', MediaStreams: [] } };
}
function snapshot(existing, sessions, seconds) {
  return planSnapshot(existing, sessions, { now: start + seconds * 1000, maxGapSeconds: 15 });
}

test('records only observed playing time through pause, resume and completion', () => {
  let result = snapshot([], [session()], 0);
  assert.equal(result.started.length, 1);
  assert.equal(result.active[0].PlaybackDuration, 0);
  result = snapshot(result.active, [session('session-1', true)], 5);
  assert.equal(result.active[0].PlaybackDuration, 5);
  result = snapshot(result.active, [session('session-1', true)], 10);
  assert.equal(result.active[0].PlaybackDuration, 5);
  result = snapshot(result.active, [session()], 15);
  result = snapshot(result.active, [], 20);
  assert.equal(result.active.length, 0);
  assert.equal(result.ended[0].PlaybackDuration, 10);
});

test('distinct playback sessions and profiles never merge on the same account', () => {
  let result = snapshot([], [session('a', false, 'p1'), session('b', false, 'p2')], 0);
  assert.equal(result.active.length, 2);
  assert.equal(result.active[0].PlayState.SiloProfileId, 'p1');
  assert.equal(result.active[1].PlayState.SiloProfileId, 'p2');
  result = snapshot(result.active, [session('c', false, 'p1')], 5);
  assert.equal(result.ended.length, 2);
  assert.equal(result.started.length, 1);
  assert.notEqual(result.started[0].ActivityId, result.ended[0].ActivityId);
});

test('unknown downtime is not counted as watched time, including process restart', () => {
  const initial = snapshot([], [session()], 0);
  const resumed = snapshot(initial.active, [session()], 120);
  assert.equal(resumed.active[0].PlaybackDuration, 0);
  const ended = snapshot(resumed.active, [], 125);
  assert.equal(ended.ended[0].PlaybackDuration, 5);
});

test('session failure publishes unavailable status without persisting an empty snapshot', async () => {
  let calls = 0;
  const events = [];
  const poll = createPoller({ api: { getSessions: async () => { throw new Error('secret URL and key'); } },
    getConfig: async () => ({ state: 2 }), store: { applySnapshot: async () => { calls++; } },
    publish: (tag, value) => events.push([tag, value]), now: () => start });
  await poll();
  assert.equal(calls, 0);
  assert.equal(events[0][0], 'session-status');
  assert.equal(events[0][1].state, 'unavailable');
  assert.ok(!JSON.stringify(events).includes('secret'));
});

test('overlapping polls are skipped and recovery persists the next valid empty list', async () => {
  let resolve;
  let calls = 0;
  const snapshots = [];
  const poll = createPoller({ api: { getSessions: () => { calls++; return new Promise(r => { resolve = r; }); } },
    getConfig: async () => ({ state: 2 }), store: { applySnapshot: async rows => snapshots.push(rows) },
    publish: () => {}, now: () => start });
  const first = poll();
  await new Promise(r => setImmediate(r));
  await poll();
  assert.equal(calls, 1);
  resolve([]);
  await first;
  assert.deepEqual(snapshots, [[]]);
});

test('unconfigured server does not request or modify activity', async () => {
  const poll = createPoller({ api: { getSessions: async () => assert.fail('must not poll') },
    getConfig: async () => ({ state: 1 }), store: { applySnapshot: async () => assert.fail('must not write') },
    publish: () => {}, now: () => start });
  await poll();
});

test('even a short failed poll marks the next snapshot discontinuous', async () => {
  let fail = false;
  const gaps = [];
  const poll = createPoller({ api: { getSessions: async () => { if (fail) throw new Error('offline'); return []; } },
    getConfig: async () => ({ state: 2 }),
    store: { applySnapshot: async (_rows, _now, options) => gaps.push(options.discontinuous) },
    publish: () => {}, now: () => start });
  await poll();
  await poll();
  fail = true;
  await poll();
  fail = false;
  await poll();
  assert.deepEqual(gaps, [true, false, true]);
});

test('database failure preserves fresh live activity and reports history failure separately', async () => {
  const events = [];
  const current = [session()];
  const poll = createPoller({ api: { getSessions: async () => current },
    getConfig: async () => ({ state: 2 }), store: { applySnapshot: async () => { throw new Error('db password'); } },
    publish: (tag, payload) => events.push([tag, payload]), now: () => start });
  await poll();
  assert.deepEqual(events.find(([tag]) => tag === 'sessions')[1], current);
  assert.equal(events.at(-1)[1].state, 'storage-unavailable');
  assert.ok(!JSON.stringify(events).includes('db password'));
});
