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
