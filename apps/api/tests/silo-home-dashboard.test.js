const test = require('node:test');
const assert = require('node:assert/strict');
const { loadHomeHistory, buildHomeDashboard, buildNativeHomeDashboard } = require('../classes/silo/home-dashboard');

const now = Date.parse('2026-09-18T12:00:00Z');
const row = (overrides = {}) => ({ session_id: 'a', user_id: 'u1', username: 'Alice',
  media_item_id: 'm1', media_title: 'Movie', watched_seconds: 120,
  ended_at: '2026-09-18T11:00:00Z', ...overrides });

test('native home preserves Silo windows, profile identity and aggregate semantics', () => {
  const dashboard = buildNativeHomeDashboard({
    stats: { total_items: 20, total_files: 25, total_movies: 3, total_movie_files: 4,
      total_shows: 2, total_show_files: 15, total_storage_bytes: 1024 },
    playback: { hours: 168, from: '2026-09-11T00:00:00Z', to: '2026-09-18T00:00:00Z',
      buckets: [{ hour: '2026-09-17T21:00:00Z', direct: 2, remux: 3, transcode: 4 }],
      reliability: { sessions_started: 12, finalized_sessions: 10, completed_sessions: 8,
        completion_rate: 0.8, unique_profiles: 2 } },
    top: { days: 7, titles: [{ media_item_id: 'm', title: 'Movie', media_type: 'movie', plays: 4, total_seconds: 500 }],
      profiles: [{ user_id: 'u', username: 'Account', profile_id: 'p', profile_name: 'Profile', plays: 5, total_seconds: 600 }] },
  });
  assert.equal(dashboard.source, 'silo-native');
  assert.equal(dashboard.totals.totalPlaybacks, 12);
  assert.equal(dashboard.totals.totalWatchSeconds, null);
  assert.equal(dashboard.peakHours[21].count, 9);
  assert.equal(dashboard.hallOfFame[0].userName, 'Profile');
  assert.equal(dashboard.hallOfFame[0].accountName, 'Account');
  assert.equal(dashboard.catalog.showFiles, 15);
  assert.ok(!dashboard.unavailableSections.includes('catalog'));
});

test('home uses retained playback, deduplicates sessions and consistently excludes users', () => {
  const dashboard = buildHomeDashboard({ rows: [row(), row(), row({ session_id: 'b', watched_seconds: 60 }),
    row({ session_id: 'c', user_id: 'excluded' }),
    row({ session_id: 'd', user_id: 'u2', username: 'Bob', ended_at: '2026-08-01T02:00:00Z' })], truncated: false },
  { now, excludedUsers: ['excluded'] });
  assert.deepEqual(dashboard.totals, { totalPlaybacks: 3, totalWatchSeconds: 300, uniqueViewers: 2 });
  assert.equal(dashboard.hallOfFame[0].userName, 'Alice');
  assert.equal(dashboard.weekPulse.topItem.plays, 2);
  assert.equal(dashboard.weekPulse.mostActiveViewer.watchSeconds, 180);
  assert.equal(dashboard.peakHours[11].count, 2);
  assert.equal(dashboard.peakHours[2].count, 1);
  assert.equal(dashboard.history.oldest, '2026-08-01T02:00:00.000Z');
  assert.ok(dashboard.unavailableSections.includes('trends'));
  assert.equal(dashboard.catalog, undefined);
});

test('empty history is a real zero, not an error', () => {
  const dashboard = buildHomeDashboard({ rows: [], truncated: false }, { now });
  assert.equal(dashboard.totals.totalPlaybacks, 0);
  assert.deepEqual(dashboard.hallOfFame, []);
  assert.equal(dashboard.weekPulse.topItem, null);
  assert.equal(dashboard.history.oldest, null);
});

test('invalid timestamps and negative durations do not corrupt aggregates', () => {
  const dashboard = buildHomeDashboard({ rows: [row({ ended_at: 'invalid', watched_seconds: -1 })], truncated: true }, { now });
  assert.equal(dashboard.totals.totalWatchSeconds, 0);
  assert.equal(dashboard.peakHours.reduce((sum, hour) => sum + hour.count, 0), 0);
  assert.equal(dashboard.weekPulse.topItem, null);
  assert.equal(dashboard.history.truncated, true);
});

test('history cursor traversal is linear and uses opaque encoded cursors', async () => {
  const paths = [];
  const result = await loadHomeHistory(async path => {
    paths.push(path);
    return paths.length === 1
      ? { items: [row()], page: { has_more: true, next_cursor: 'a+b/c=' } }
      : { items: [row({ session_id: 'b' })], page: { has_more: false } };
  });
  assert.equal(paths.length, 2);
  assert.equal(new URLSearchParams(paths[1].split('?')[1]).get('cursor'), 'a+b/c=');
  assert.equal(result.rows.length, 2);
  assert.equal(result.truncated, false);
});

test('bounded history explicitly marks partial results', async () => {
  let count = 0;
  const result = await loadHomeHistory(async () => ({ items: [row({ session_id: String(++count) })],
    page: { has_more: true, next_cursor: String(count) } }), { maxPages: 2 });
  assert.equal(count, 2);
  assert.equal(result.truncated, true);
});

test('malformed pages, cursor cycles and upstream failures never become empty success', async () => {
  await assert.rejects(loadHomeHistory(async () => ({ items: [] })), /Invalid/);
  await assert.rejects(loadHomeHistory(async () => ({ items: [], page: { has_more: true } })), /cursor/);
  await assert.rejects(loadHomeHistory(async () => ({ items: [], page: { has_more: true, next_cursor: 'repeat' } })), /cursor/);
  await assert.rejects(loadHomeHistory(async () => { throw new Error('Permission denied'); }), /Permission denied/);
});
