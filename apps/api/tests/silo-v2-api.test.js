const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const SiloAPI = require('../classes/silo-api');
const { validateConnection } = require('../classes/silo-server-registry');

const info = { api_major: 2, server_version: 'v2-fixture', contract_digest: 'a'.repeat(64),
  links: { openapi: '/api/v2/openapi.json', capabilities: '/api/v2/capabilities' } };
const row = id => ({ session_id: id, user_id: '1', content_id: 'movie', media_title: 'Film', media_type: 'movie', is_paused: false });
async function fixture(t, handler, options = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture'); calls.push(url);
    const send = (data, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (url.pathname === '/proxy/api/v2/system/info') return send(info);
    if (url.pathname === '/proxy/api/v1/health') return send({ status: 'ok', server_id: 'installation', server_name: 'Fixture' });
    if (url.pathname === '/proxy/api/v2/profiles') return send({ items: [{ id: 'primary-profile', is_primary: true }] });
    if (url.pathname.startsWith('/proxy/api/v2/catalog') && req.headers['x-profile-id'] !== 'primary-profile') return send({}, 400);
    handler(url, send, req);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/proxy`;
  return { base, calls, api: new SiloAPI({ getConfig: async () => ({ state: 2, SILO_URL: base, SILO_API_KEY: 'fixture' }), timeoutMs: 1000, ...options }) };
}

test('home dashboard uses native stats, playback and leaderboard endpoints', async t => {
  const f = await fixture(t, (url, send) => {
    const path = url.pathname.replace('/proxy/api/v2/', '');
    if (path === 'admin/stats') return send({ total_items: 12, total_movies: 2, total_shows: 1, total_files: 15, total_storage_bytes: 99 });
    if (path === 'admin/stats/playback-activity') return send({ hours: 168, from: '2026-09-11T00:00:00Z', to: '2026-09-18T00:00:00Z',
      profiles_active_24h: 2, reliability: { sessions_started: 8, finalized_sessions: 7, completed_sessions: 6,
        completion_rate: 0.75, unique_profiles: 3 }, buckets: [{ hour: '2026-09-17T20:00:00Z', direct: 2, remux: 1, transcode: 1 }] });
    if (path === 'admin/stats/top-activity') return send({ days: 7, titles: [{ media_item_id: 'm', title: 'Film', media_type: 'movie', plays: 4, total_seconds: 300 }],
      profiles: [{ user_id: '1', username: 'Account', profile_id: 'p', profile_name: 'Viewer', plays: 5, total_seconds: 400 }] });
    return send({}, 403);
  });
  const dashboard = await f.api.getHomeDashboard();
  assert.equal(dashboard.source, 'silo-native');
  assert.equal(dashboard.totals.totalPlaybacks, 8);
  assert.equal(dashboard.totals.completedPlaybacks, 6);
  assert.equal(dashboard.catalog.movies, 2);
  assert.equal(dashboard.peakHours[20].count, 4);
  assert.equal(dashboard.weekPulse.topItem.name, 'Film');
  assert.equal(dashboard.hallOfFame[0].userName, 'Viewer');
  assert.ok(!f.calls.some(url => /playback-history|profiles|catalog/.test(url.pathname)));
});

test('history uses one opaque cursor request and preserves Silo-native attempt fields', async t => {
  const f = await fixture(t, (url, send) => {
    if (!url.pathname.endsWith('/admin/playback-history')) return send({}, 404);
    assert.equal(url.searchParams.get('cursor'), 'opaque cursor/+');
    assert.equal(url.searchParams.get('user_id'), '7');
    assert.equal(url.searchParams.get('profile_id'), 'profile-a');
    assert.equal(url.searchParams.get('completed'), 'false');
    send({ items: [{ session_id: 'attempt', user_id: '7', username: 'Viewer', profile_id: 'profile-a',
      profile_name: 'Kids', media_item_id: 'episode', media_file_id: 'file', media_title: 'Pilot',
      media_type: 'episode', play_method: 'remux', started_at: '2026-09-18T10:00:00Z',
      ended_at: '2026-09-18T10:20:00Z', watched_seconds: 1200, duration_seconds: 1800, completed: false }],
      page: { has_more: true, next_cursor: 'next' } });
  });
  const history = await f.api.getPlaybackHistoryPage({ page: 9, limit: 25, cursor: 'opaque cursor/+',
    userId: '7', profileId: 'profile-a', completed: false });
  assert.equal(f.calls.filter(url => url.pathname.endsWith('/admin/playback-history')).length, 1);
  assert.equal(history.currentPage, 9);
  assert.equal(history.nextCursor, 'next');
  assert.equal(history.results[0].SiloMediaType, 'episode');
  assert.equal(history.results[0].ProfileName, 'Kids');
  assert.equal(history.results[0].PlayMethod, 'DirectStream');
  assert.equal(history.results[0].Completed, false);
  assert.equal(history.results[0].results, undefined);
});

test('history rejects repeated or terminal cursors', async t => {
  let terminal = false;
  const f = await fixture(t, (url, send) => {
    if (!url.pathname.endsWith('/admin/playback-history')) return send({}, 404);
    send({ items: [{ session_id: 'attempt' }], page: terminal
      ? { has_more: false, next_cursor: 'invalid' }
      : { has_more: true, next_cursor: url.searchParams.get('cursor') } });
  });
  await assert.rejects(f.api.getPlaybackHistoryPage({ cursor: 'same' }), /cursor/i);
  terminal = true;
  await assert.rejects(f.api.getPlaybackHistoryPage(), /terminal|cursor/i);
});

test('item library attribution comes from paginated admin file ownership', async t => {
  const f = await fixture(t, (url, send) => {
    if (!url.pathname.endsWith('/admin/items/episode%2Fone/files')) return send({}, 404);
    if (!url.searchParams.has('cursor')) return send({ items: [{ id: 'f1', library_id: 'lib-a' }],
      page: { has_more: true, next_cursor: 'files-next' } });
    assert.equal(url.searchParams.get('cursor'), 'files-next');
    return send({ items: [{ id: 'f2', library_id: 'lib-b' }], page: { has_more: false } });
  });
  const ids = await f.api._itemLibraryIds('episode/one', Date.now() + 1000);
  assert.deepEqual([...ids].sort(), ['lib-a', 'lib-b']);
  assert.equal(f.calls.filter(url => url.pathname.includes('/admin/items/')).length, 2);
  await f.api._itemLibraryIds('episode/one', Date.now() + 1000);
  assert.equal(f.calls.filter(url => url.pathname.includes('/admin/items/')).length, 2, 'membership should be cached');
});

test('library history uses exact catalog membership and resumable filtered cursors', async () => {
  const api = new SiloAPI({ timeoutMs: 1000, maxPages: 5 });
  api._configured = async () => {};
  api._wire = async () => { api.connectionInfo = { apiMajor: 2 }; };
  api.connectionInfo = { apiMajor: 2 };
  api.getLibraries = async () => [{ Id: 'library', CollectionType: 'tvshows' }];
  const membershipChecks = [];
  api._itemLibraryIds = async itemId => {
    membershipChecks.push(itemId);
    return new Set(itemId === 'episode' ? ['library'] : ['other-library']);
  };
  let historyCalls = 0;
  api.getPlaybackHistoryPage = async ({ cursor }) => {
    historyCalls += 1;
    if (!cursor) return { results: [
      { Id: 'one', NowPlayingItemId: 'episode' }, { Id: 'other', NowPlayingItemId: 'elsewhere' },
      { Id: 'two', NowPlayingItemId: 'episode' }, { Id: 'three', NowPlayingItemId: 'episode' },
    ], hasMore: true, nextCursor: 'upstream' };
    assert.equal(cursor, 'upstream');
    return { results: [{ Id: 'four', NowPlayingItemId: 'episode' }], hasMore: false, nextCursor: null };
  };
  const first = await api.getLibraryPlaybackHistoryPage({ libraryId: 'library', limit: 2 });
  assert.deepEqual(first.results.map(row => row.Id), ['one', 'two']);
  assert.deepEqual(membershipChecks.sort(), ['elsewhere', 'episode']);
  assert.ok(first.nextCursor);
  assert.equal(historyCalls, 1);
  const second = await api.getLibraryPlaybackHistoryPage({ libraryId: 'library', limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.results.map(row => row.Id), ['three', 'four']);
  assert.equal(second.hasMore, false);
  assert.equal(historyCalls, 2);
  const replay = await api.getLibraryPlaybackHistoryPage({ libraryId: 'library', limit: 2, cursor: first.nextCursor });
  assert.deepEqual(replay.results.map(row => row.Id), ['three', 'four'], 'back navigation cursors must remain replayable');
});

test('native dashboard insights use the v2 aggregate endpoints', async t => {
  const seen = new Set();
  const f = await fixture(t, (url, send) => {
    const path = url.pathname.replace('/proxy/api/v2/', ''); seen.add(path);
    if (path === 'admin/stats') return send({ total_items: 5 });
    if (path === 'admin/stats/playback-activity') return send({ buckets: [], reliability: {}, hours: 24 });
    if (path === 'admin/stats/top-activity') return send({ titles: [], profiles: [], days: 7 });
    return send({}, 404);
  });
  const result = await f.api.getAdminDashboardInsights({ hours: 24, days: 7, refresh: true });
  assert.equal(result.stats.total_items, 5);
  assert.deepEqual([...seen].sort(), ['admin/stats', 'admin/stats/playback-activity', 'admin/stats/top-activity']);
  assert.ok(f.calls.filter(url => url.pathname.includes('/admin/stats')).every(url => url.searchParams.get('refresh') === 'true'));
});

test('auto v2 counts every session page and rejects an incomplete snapshot', async t => {
  let fail = false;
  const f = await fixture(t, (url, send) => {
    if (url.pathname.endsWith('/capabilities')) return send({ available: true, node_routing: true });
    if (!url.pathname.endsWith('/admin/sessions')) return send({}, 404);
    if (Number(url.searchParams.get('limit')) > 100) return send({}, 400);
    if (url.searchParams.has('cursor') && fail) return send({}, 503);
    if (url.searchParams.get('cursor') === 'last') return send({ items: [row('201'), row('1')], page: { has_more: false } });
    const second = url.searchParams.get('cursor') === 'opaque';
    send({ items: Array.from({ length: 100 }, (_, i) => row(String(i + 1 + (second ? 100 : 0)))),
      page: { has_more: true, next_cursor: second ? 'last' : 'opaque' } });
  });
  assert.equal((await f.api.getSessions()).length, 201);
  assert.equal((await f.api.systemInfo()).Version, 'v2-fixture');
  fail = true;
  await assert.rejects(f.api.getSessions(), /503/);
  assert.ok(!f.calls.some(url => url.pathname === '/proxy/api/v1/admin/sessions'));
});

test('v2 rejects missing/repeated cursors and page-ceiling truncation', async t => {
  let cursor;
  const f = await fixture(t, (url, send) => send({ items: [row('1')], page: { has_more: true, next_cursor: cursor } }), { maxPages: 2 });
  await assert.rejects(f.api.getSessions(), /cursor/i);
  cursor = 'again';
  await assert.rejects(f.api.getSessions(), /cursor|page/i);
});

test('v2 retains all provider read shapes and translates catalog offsets and descending sort', async t => {
  const movie = { content_id: 'movie', type: 'movie', title: 'Film', runtime: 90, versions: [
    { file_id: 'file', duration: 5400, bitrate: 8000, codec_video: 'hevc', codec_audio: 'aac' }] };
  const f = await fixture(t, (url, send) => {
    const p = url.pathname.replace('/proxy/api/v2/', '');
    if (p === 'admin/sessions') return send({ items: [] });
    if (p === 'admin/users') return send({ items: [{ id: '1', username: 'admin', role: 'admin' }] });
    if (p === 'libraries') return send({ items: [{ id: 'lib', name: 'Films', type: 'movies' }] });
    if (p === 'catalog') {
      assert.ok(!url.searchParams.has('offset')); assert.ok(!url.searchParams.has('order'));
      return send({ items: [movie], page: { has_more: false }, window_cursor: 'window', total: 1, total_exact: true });
    }
    if (p === 'catalog/items/movie') return send(movie);
    if (p === 'catalog/series/series/seasons') return send({ items: [{ content_id: 'season', season_number: 1, title: 'Season 1' }] });
    if (p === 'catalog/series/series/seasons/1/episodes') return send({ items: [{ content_id: 'episode', title: 'Pilot', season_number: 1, episode_number: 1, runtime: 42 }] });
    return send({}, 404);
  });
  assert.equal((await f.api.getAdmins())[0].Id, '1');
  assert.equal((await f.api.getLibraries())[0].Name, 'Films');
  assert.equal((await f.api.getItemsFromParentId({ id: 'lib', params: { startIndex: 20, limit: 1 } }))[0].Name, 'Film');
  assert.ok(f.calls.some(url => url.searchParams.get('seek') === '20' && url.searchParams.get('cursor') === 'window'));
  assert.equal((await f.api.getRecentlyAdded({ limit: 1 }))[0].MediaSources[0].RunTimeTicks, 54000000000);
  assert.ok(f.calls.some(url => url.searchParams.get('sort') === '-added_at'));
  await f.api._catalogPage({ libraryId: 'lib', mediaType: 'episode', search: 'pilot', sort: 'title', desc: true, limit: 1 });
  assert.ok(f.calls.some(url => url.pathname.endsWith('/catalog') && url.searchParams.get('type') === 'episode'
    && url.searchParams.get('q') === 'pilot' && url.searchParams.get('sort') === '-title'));
  assert.equal((await f.api.getEpisodes({ SeriesId: 'series', SeasonId: 'season' }))[0].Name, 'Pilot');
  assert.equal((await f.api.getItemsByID({ ids: ['movie'] }))[0].Id, 'movie');
  assert.equal((await f.api.validateSettings(f.base, 'fixture')).isValid, true);
  assert.equal((await validateConnection(f.base, 'fixture')).id, 'installation');
});

test('a changed connection cannot reuse or publish an older in-flight session response', async t => {
  let release, reached;
  const ready = new Promise(resolve => { reached = resolve; });
  const old = await fixture(t, (url, send) => {
    if (!url.pathname.endsWith('/admin/sessions')) return send({}, 404);
    release = () => send({ items: [row('old')] }); reached();
  });
  const next = await fixture(t, (url, send) => url.pathname.endsWith('/admin/sessions') ? send({ items: [row('new')] }) : send({}, 404));
  let config = { state: 2, SILO_URL: old.base, SILO_API_KEY: 'old-key' };
  const api = new SiloAPI({ getConfig: async () => config, timeoutMs: 1000 });
  const earlier = api.getSessions();
  const rejected = assert.rejects(earlier, /connection changed/i);
  await ready;
  config = { ...config, SILO_URL: next.base, SILO_API_KEY: 'new-key' };
  const current = api.getSessions();
  release();
  await rejected;
  assert.equal((await current)[0].Id, 'new');
});

test('optional diagnostics denied or rate limited do not disable live activity', async t => {
  const f = await fixture(t, (url, send) => {
    if (url.pathname.endsWith('/capabilities')) return send({}, 429);
    if (url.pathname.endsWith('/admin/sessions')) return send({ items: [row('live')] });
    send({}, 404);
  });
  assert.equal((await f.api.getSessions()).length, 1);
  assert.equal(f.api.getConnectionInfo().diagnosticsAvailable, false);
  assert.equal((await f.api.getSessions()).length, 1);
  assert.equal(f.calls.filter(url => url.pathname.endsWith('/sessions/capabilities')).length, 1);
});

test('first-poll discovery and session attempts share one bounded deadline', async () => {
  const api = new SiloAPI({ getConfig: async () => ({ state: 2, SILO_URL: 'http://fixture.invalid', SILO_API_KEY: 'fixture' }),
    sessionBudgetMs: 60, timeoutMs: 1000,
    fetch: async (url, options) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 40);
        options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal.reason); }, { once: true });
      });
      return new Response(JSON.stringify(url.endsWith('/system/info') ? info : { status: 'ok', server_id: 'test' }));
    } });
  const started = Date.now();
  await assert.rejects(api.getSessions(), /timed out/);
  assert.ok(Date.now() - started < 250, 'discovery/retries must not multiply the poll budget');
});

test('catalog slice rejects page-ceiling truncation and retains page count exactness', async t => {
  const f = await fixture(t, (url, send) => send({ items: [{ content_id: 'm', type: 'movie', title: 'Movie' }],
    page: { has_more: true }, window_cursor: 'window', total: 1000, total_exact: false }), { maxPages: 2 });
  const page = await f.api._catalogPage({ startIndex: 0, limit: 1 });
  assert.equal(page.total, 1000);
  assert.equal(page.total_exact, false);
  await assert.rejects(f.api._catalogSlice({ startIndex: 0, limit: 1000 }), /page limit/i);
});

test('explicit legacy adapter leaves unavailable physical identity unresolved', async () => {
  const api = new SiloAPI({ apiMajor: 1, getConfig: async () => ({ state: 2, SILO_URL: 'http://fixture.invalid', SILO_API_KEY: 'fixture' }),
    fetch: async url => new Response(JSON.stringify(url.endsWith('/health') ? { status: 'ok' } : [row('live')])) });
  assert.equal((await api.getSessions())[0].ServerId, '');
});

test('schema-validated pinned session/user/library fixtures pass through the real v2 facade', async t => {
  const contracts = require('./fixtures/silo-v2/responses.json');
  const operations = { '/admin/sessions': 'listAdminPlaybackSessions', '/admin/users': 'listAdminUsers',
    '/libraries': 'listLibraries', '/admin/sessions/capabilities': 'getAdminPlaybackSessionCapabilities' };
  const f = await fixture(t, (url, send) => {
    const operation = operations[url.pathname.replace('/proxy/api/v2', '')];
    if (!operation) return send({}, 404);
    const response = contracts[operation].responses[url.searchParams.has('cursor') ? 1 : 0];
    return send(response.body, response.status);
  });
  const expectedIds = new Set(contracts.listAdminPlaybackSessions.responses.flatMap(response => response.body.items.map(item => item.session_id)));
  assert.deepEqual(new Set((await f.api.getSessions()).map(session => session.Id)), expectedIds);
  assert.equal((await f.api.getUsers()).length, new Set(contracts.listAdminUsers.responses.flatMap(response => response.body.items.map(item => item.id))).size);
  assert.equal((await f.api.getLibraries()).length, contracts.listLibraries.responses[0].body.items.length);
});

test('late system identity cannot be published after a connection change', async () => {
  let config = { state: 2, SILO_URL: 'http://old.invalid', SILO_API_KEY: 'fixture' };
  let release, reached;
  const ready = new Promise(resolve => { reached = resolve; });
  const api = new SiloAPI({ apiMajor: 1, getConfig: async () => config,
    fetch: async () => { reached(); await new Promise(resolve => { release = resolve; });
      return new Response(JSON.stringify({ status: 'ok', server_id: 'old' })); } });
  const previous = api.systemInfo();
  await ready;
  config = { ...config, SILO_URL: 'http://new.invalid' };
  await api._configured(true);
  release();
  assert.deepEqual(await previous, {});
});

test('catalog uses only the account primary profile; missing profile does not disable activity', async () => {
  const createV2 = require('../classes/silo/v2');
  const wire = createV2(async path => {
    if (path === 'profiles') return { items: [{ id: 'child', is_primary: false }] };
    if (path.startsWith('admin/sessions?')) return { items: [row('live')] };
    assert.fail('catalog must not run with a guessed profile');
  });
  await assert.rejects(wire.read('catalog?limit=1'), /primary profile/);
  assert.equal((await wire.read('admin/sessions')).length, 1);
});

test('shared profile discovery respects each catalog caller deadline', async () => {
  const createV2 = require('../classes/silo/v2');
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const wire = createV2(async path => path === 'profiles' ? pending : { items: [] });
  const first = wire.read('catalog?limit=1', { timeoutMs: 500 });
  const started = Date.now();
  const shorter = assert.rejects(wire.read('catalog?limit=2', { timeoutMs: 20 }), /timed out/);
  const timer = setTimeout(() => release({ items: [{ id: 'primary', is_primary: true }] }), 80);
  await shorter;
  assert.ok(Date.now() - started < 70, 'shared discovery cannot extend the shorter caller budget');
  await first;
  clearTimeout(timer);
});
