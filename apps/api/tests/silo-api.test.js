const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const SiloAPI = require('../classes/silo-api');
const { sessionToJellyfin } = require('../classes/silo/mappers');

const sessionWire = {
  session_id: 'sess-01', user_id: 42, username: 'alex', profile_id: 'profile-kids',
  profile_name: 'Kids', media_file_id: 91, requested_media_file_id: 91,
  content_id: 'episode-real-id', media_title: 'The Series', media_type: 'series',
  series_name: 'The Series', episode_name: 'The Arrival', season_number: 2,
  episode_number: 4, poster_url: 'https://objects.invalid/signed-poster',
  play_method: 'transcode', effective_play_method: 'audio', position_seconds: 12.5,
  file_duration: 1800, is_paused: false, client_ip: '192.0.2.4',
  client_name: 'Silo TV', client_version: '2.1', client_label: 'Silo TV 2.1',
  stream_bitrate_kbps: 4500, source_bitrate_kbps: 8000, source_container: 'mkv',
  source_video_codec: 'hevc', source_video_resolution: '2160p',
  source_audio_codec: 'truehd', source_audio_channels: 8, target_audio_codec: 'aac',
  target_bitrate_kbps: 4500, video_decision: 'remux', audio_decision: 'transcode',
  reporting_node: 'local', node_display_name: 'Local server'
};

function json(res, status, value, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(value));
}

async function fixtureServer(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization });
    handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}/proxy`, requests,
    close: () => new Promise(resolve => server.close(resolve)) };
}

function apiFor(url, key = 'sa_test_secret', extra = {}) {
  return new SiloAPI({
    apiMajor: 1, // Legacy adapter contract; automatic negotiation is covered separately.
    getConfig: async () => ({ state: 2, JF_HOST: url, JF_API_KEY: key }),
    timeoutMs: 1000,
    ...extra,
  });
}

test('simultaneous activity consumers share the same upstream poll', async t => {
  let polls = 0;
  const fixture = await fixtureServer((req, res) => {
    if (req.url.endsWith('/health')) return json(res, 200, { status: 'ok', server_id: 's' });
    polls++;
    setTimeout(() => json(res, 200, []), 30);
  });
  t.after(fixture.close);
  const api = apiFor(fixture.url);
  await Promise.all([api.getSessions(), api.getSessions(), api.getSessions()]);
  assert.equal(polls, 1);
});

test('activity retries a transient upstream failure once but never retries denied credentials', async t => {
  let polls = 0;
  let denied = false;
  const fixture = await fixtureServer((req, res) => {
    if (req.url.endsWith('/health')) return json(res, 200, { status: 'ok', server_id: 's' });
    polls++;
    if (denied) return json(res, 401, {});
    return json(res, polls === 1 ? 503 : 200, []);
  });
  t.after(fixture.close);
  const api = apiFor(fixture.url);
  assert.deepEqual(await api.getSessions(), []);
  assert.equal(polls, 2);
  denied = true;
  await assert.rejects(api.getSessions());
  assert.equal(polls, 3);
});

test('optional health and episode lookups do not stack full request timeouts', async t => {
  const fixture = await fixtureServer((req, res) => {
    if (req.url.endsWith('/admin/sessions')) return json(res, 200, [sessionWire]);
    // Both optional endpoints hang until their request is aborted.
  });
  t.after(fixture.close);
  const api = apiFor(fixture.url, 'test', { timeoutMs: 300, enrichmentTimeoutMs: 40 });
  const start = Date.now();
  const rows = await api.getSessions();
  assert.equal(rows.length, 1);
  assert.ok(Date.now() - start < 200, 'optional enrichment must have a short, parallel budget');
});

test('minimal direct sessions keep frontend-accessed string fields safe', () => {
  const session = sessionToJellyfin({ session_id: 'minimal', user_id: 1, content_id: 'movie',
    media_type: 'movie', media_title: 'Movie', effective_play_method: 'direct' }, null, 'server');
  assert.equal(session.NowPlayingItem.Container, '');
  assert.equal(session.TranscodingInfo, null);
  assert.equal(session.PlayState.AudioStreamIndex, -1);
});

test('detects episode identity from nullable episode fields when media_type is blank', () => {
  const session = sessionToJellyfin({ session_id: 'episode', user_id: 2, content_id: 'episode-id',
    media_type: '', media_title: '', episode_name: 'Pilot', season_number: 0, episode_number: 1,
    effective_play_method: 'direct' }, { content_id: 'episode-id', series_id: 'series-id', series_title: 'Show' }, 'server');
  assert.equal(session.NowPlayingItem.Type, 'Episode');
  assert.equal(session.NowPlayingItem.Name, 'Pilot');
  assert.equal(session.NowPlayingItem.SeriesId, 'series-id');
  assert.equal(session.NowPlayingItem.ParentIndexNumber, 0);
});

test('maps audiobook session media types to the existing Audio contract', () => {
  const session = sessionToJellyfin({ session_id: 'audio', user_id: 3, content_id: 'book-id',
    media_type: 'audiobook', media_title: 'Book', effective_play_method: 'direct' }, null, 'server');
  assert.equal(session.NowPlayingItem.Type, 'Audio');
});

test('normalizes native sessions without fabricating episode or device identity', async t => {
  let detailCalls = 0;
  const fixture = await fixtureServer((req, res) => {
    if (req.url === '/proxy/api/v1/health') return json(res, 200, { status: 'ok', server_id: 'server-1' });
    if (req.url === '/proxy/api/v1/catalog/items/episode-real-id') { detailCalls++; return json(res, 404, {}); }
    assert.equal(req.url, '/proxy/api/v1/admin/sessions');
    assert.equal(req.headers.authorization, 'Bearer sa_test_secret');
    json(res, 200, [sessionWire]);
  });
  t.after(fixture.close);

  const api = apiFor(fixture.url);
  const [session] = await api.getSessions();
  assert.equal(api.isSilo, true);
  assert.equal(session.MediaServerProvider, 'silo');
  assert.equal(session.Id, 'sess-01');
  assert.equal(session.UserId, '42');
  assert.equal(session.ProfileId, 'profile-kids');
  assert.equal(session.ProfileName, 'Kids');
  assert.equal(session.DeviceId, 'silo-session:sess-01');
  assert.equal(session.NowPlayingItem.Id, 'episode-real-id');
  assert.equal(session.NowPlayingItem.SeriesId, undefined);
  assert.equal(session.NowPlayingItem.Name, 'The Arrival');
  assert.equal(session.NowPlayingItem.Type, 'Episode');
  assert.equal(session.NowPlayingItem.RunTimeTicks, 18_000_000_000);
  assert.equal(session.PlayState.PositionTicks, 125_000_000);
  assert.equal(session.PlayState.PlayMethod, 'Audio');
  assert.equal(session.TranscodingInfo.Bitrate, 4_500_000);
  const video = session.NowPlayingItem.MediaStreams.find(stream => stream.Type === 'Video');
  assert.equal(video.Codec, 'hevc');
  assert.equal(video.Height, 2160);
  assert.equal(session.NowPlayingItem.MediaStreams[session.PlayState.AudioStreamIndex].Type, 'Audio');
  for (const field of ['Container', 'VideoCodec', 'AudioCodec']) assert.equal(typeof session.TranscodingInfo[field], 'string');
  assert.equal(session.TranscodingInfo.Height, 2160);
  assert.equal(session.SiloPosterUrl, sessionWire.poster_url);
  assert.equal(session.NowPlayingItem.SiloPosterUrl, sessionWire.poster_url);
  await api.getSessions();
  assert.equal(detailCalls, 1, 'failed optional enrichment is negatively cached between polls');
});

test('getSessions rejects upstream failures and malformed list shapes with sanitized errors', async t => {
  const fixture = await fixtureServer((req, res) => {
    if (req.url.includes('bad-shape')) json(res, 200, { sessions: [] });
    else json(res, 401, { error: 'token sa_test_secret rejected at internal host' });
  });
  t.after(fixture.close);
  const api = apiFor(fixture.url);
  await assert.rejects(api.getSessions(), error => {
    assert.equal(error.message, 'Silo request failed (401)');
    assert.ok(!error.message.includes('secret'));
    assert.ok(!error.message.includes(fixture.url));
    return true;
  });
  const bad = apiFor(`${fixture.url}/bad-shape`);
  await assert.rejects(bad.getSessions(), /Invalid Silo session response/);
});

test('validateSettings checks health and the protected session list for root and api base URLs', async t => {
  const fixture = await fixtureServer((req, res) => {
    if (req.url === '/proxy/api/v1/health') return json(res, 200, { status: 'ok', server_name: 'Silo', server_id: 'srv' });
    if (req.url === '/proxy/api/v1/admin/sessions') return json(res, 200, []);
    json(res, 404, {});
  });
  t.after(fixture.close);

  const first = await apiFor(fixture.url).validateSettings(fixture.url, 'sa_valid');
  assert.deepEqual(first, { isValid: true, status: 200, errorMessage: '', url: fixture.url,
    cleanedUrl: `${fixture.url}/api/v1` });
  const second = await apiFor(fixture.url).validateSettings(`${fixture.url}/api/v1/`, 'sa_valid');
  assert.equal(second.isValid, true);
  assert.equal(second.cleanedUrl, `${fixture.url}/api/v1`);
});

test('rejects cross-origin redirects before forwarding the bearer credential', async t => {
  let targetHits = 0;
  const target = await fixtureServer((_req, res) => { targetHits++; json(res, 200, []); });
  t.after(target.close);
  const source = await fixtureServer((_req, res) => json(res, 302, {}, { location: `${target.url}/api/v1/admin/sessions` }));
  t.after(source.close);

  await assert.rejects(apiFor(source.url).getSessions(), /redirect/i);
  assert.equal(targetHits, 0);
});

test('maps users, admins, libraries, health identity, and explicit unsupported methods', async t => {
  const fixture = await fixtureServer((req, res) => {
    if (req.url === '/proxy/api/v1/admin/users') return json(res, 200, [
      { id: 7, username: 'root', role: 'admin', permissions: ['admin'], enabled: true },
      { id: 8, username: 'viewer', role: 'user', permissions: [], enabled: true },
    ]);
    if (req.url === '/proxy/api/v1/libraries') return json(res, 200, [
      { id: 3, name: 'Movies', type: 'movies', enabled: true, poster_url: 'https://objects.invalid/lib' },
    ]);
    if (req.url === '/proxy/api/v1/health') return json(res, 200, { status: 'ok', server_name: 'My Silo', server_id: 'srv-2' });
    json(res, 404, {});
  });
  t.after(fixture.close);
  const api = apiFor(fixture.url);
  assert.deepEqual((await api.getUsers()).map(x => [x.Id, x.Name]), [['7', 'root'], ['8', 'viewer']]);
  assert.deepEqual((await api.getAdmins()).map(x => x.Id), ['7']);
  assert.equal((await api.getUserById('8')).Name, 'viewer');
  assert.equal((await api.getLibraries())[0].CollectionType, 'movies');
  assert.deepEqual(await api.systemInfo(), { Id: 'srv-2', ServerName: 'My Silo', Version: 'Silo' });
  assert.deepEqual(await api.getInstalledPlugins(), []);
  await assert.rejects(api.StatsSubmitCustomQuery('select 1'), /not supported/i);
});

test('maps native series libraries to Jellyfin tvshows collection type', async t => {
  const fixture = await fixtureServer((req, res) => {
    if (req.url.endsWith('/libraries')) return json(res, 200, [{ id: 4, name: 'TV', type: 'series', enabled: true }]);
    if (req.url.endsWith('/health')) return json(res, 200, { status: 'ok' });
    json(res, 404, {});
  });
  t.after(fixture.close);
  assert.equal((await apiFor(fixture.url).getLibraries())[0].CollectionType, 'tvshows');
});

test('systemInfo can probe health while setup config is at state one', async t => {
  const fixture = await fixtureServer((req, res) => {
    assert.equal(req.url, '/proxy/api/v1/health');
    json(res, 200, { status: 'ok', server_name: 'Setup Silo', server_id: 'setup-id' });
  });
  t.after(fixture.close);
  const api = new SiloAPI({ apiMajor: 1, getConfig: async () => ({ state: 1, JF_HOST: fixture.url, JF_API_KEY: 'sa_setup' }) });
  assert.equal((await api.systemInfo()).Id, 'setup-id');
});

test('state-one setup can load native admins after the server key is saved', async t => {
  const fixture = await fixtureServer((req, res) => {
    if (req.url === '/proxy/api/v1/admin/users') return json(res, 200, [
      { id: 9, username: 'admin', role: 'admin', permissions: ['admin'], enabled: true },
    ]);
    if (req.url === '/proxy/api/v1/health') return json(res, 200, { status: 'ok' });
    json(res, 404, {});
  });
  t.after(fixture.close);
  const api = new SiloAPI({ apiMajor: 1, getConfig: async () => ({ state: 1, JF_HOST: fixture.url, JF_API_KEY: 'sa_setup' }) });
  assert.deepEqual((await api.getAdmins(true)).map(row => row.Id), ['9']);
});

test('refreshes connection settings between top-level operations and resets server identity', async t => {
  const first = await fixtureServer((req, res) => {
    if (req.url.endsWith('/admin/sessions')) return json(res, 200, [{ ...sessionWire, session_id: 'first' }]);
    if (req.url.endsWith('/health')) return json(res, 200, { status: 'ok', server_id: 'first-server' });
    json(res, 404, {});
  });
  const second = await fixtureServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer sa_second');
    if (req.url.endsWith('/admin/sessions')) return json(res, 200, [{ ...sessionWire, session_id: 'second' }]);
    if (req.url.endsWith('/health')) return json(res, 200, { status: 'ok', server_id: 'second-server' });
    if (req.url.includes('/catalog/items/')) return json(res, 404, {});
    json(res, 404, {});
  });
  t.after(first.close); t.after(second.close);
  let config = { state: 2, JF_HOST: first.url, JF_API_KEY: 'sa_first' };
  const api = new SiloAPI({ apiMajor: 1, getConfig: async () => config });
  assert.equal((await api.getSessions())[0].ServerId, 'first-server');
  config = { state: 2, JF_HOST: second.url, JF_API_KEY: 'sa_second' };
  const changed = await api.getSessions();
  assert.equal(changed[0].Id, 'second');
  assert.equal(changed[0].ServerId, 'second-server');
});

test('server identity never oscillates when optional health later fails', async t => {
  let healthCalls = 0;
  const fixture = await fixtureServer((req, res) => {
    if (req.url.endsWith('/admin/sessions')) return json(res, 200, [sessionWire]);
    if (req.url.endsWith('/catalog/items/')) return json(res, 404, {});
    if (req.url.endsWith('/health')) {
      healthCalls++;
      return healthCalls === 1 ? json(res, 200, { status: 'ok', server_id: 'stable-server' }) : json(res, 503, {});
    }
    json(res, 404, {});
  });
  t.after(fixture.close);
  const api = apiFor(fixture.url);
  assert.equal((await api.getSessions())[0].ServerId, 'stable-server');
  api.serverInfoCache.expiresAt = 0;
  assert.equal((await api.getSessions())[0].ServerId, 'stable-server');
  assert.equal(healthCalls, 1, 'chosen identity is retained instead of being replaced during a later health outage');
});

test('covers a requested parent slice using Silo native pages of at most 100', async t => {
  const offsets = [];
  const limits = [];
  const fixture = await fixtureServer((req, res) => {
    const url = new URL(req.url, 'http://fixture');
    if (url.pathname.endsWith('/health')) return json(res, 200, { status: 'ok', server_id: 'server' });
    if (url.pathname.endsWith('/catalog')) {
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      offsets.push(offset);
      limits.push(limit);
      assert.ok(limit <= 100);
      const count = Math.max(0, Math.min(limit, 250 - offset));
      return json(res, 200, { total: 250, has_more: offset + count < 250,
        items: Array.from({ length: count }, (_, i) => ({ content_id: `series-${offset + i}`, type: 'series', title: 'Series' })) });
    }
    if (url.pathname.includes('/seasons')) return json(res, 200, { seasons: [] });
    json(res, 404, {});
  });
  t.after(fixture.close);
  const rows = await apiFor(fixture.url).getItemsFromParentId({ id: 3, params: { startIndex: 0, increment: 250 } });
  assert.equal(rows.length, 250);
  assert.deepEqual(offsets, [0, 100, 200]);
  assert.deepEqual(limits, [100, 100, 50]);
});

test('required sync collection methods throw on upstream failures and malformed shapes', async t => {
  const fixture = await fixtureServer((req, res) => {
    if (req.url.endsWith('/health')) return json(res, 200, { status: 'ok' });
    if (req.url.includes('/admin/users')) return json(res, 503, { secret: 'sa_test_secret' });
    if (req.url.endsWith('/libraries')) return json(res, 200, { libraries: [] });
    if (req.url.endsWith('/catalog?offset=0&limit=1&library_id=3')) return json(res, 500, {});
    if (req.url.includes('/seasons/1/episodes')) return json(res, 200, { wrong: [] });
    if (req.url.endsWith('/seasons')) return json(res, 200, { seasons: [{ content_id: 's1', season_number: 1, title: 'One' }] });
    json(res, 404, {});
  });
  t.after(fixture.close);
  const api = apiFor(fixture.url);
  await assert.rejects(api.getUsers(), /Silo request failed \(503\)/);
  await assert.rejects(api.getLibraries(), /Invalid Silo library response/);
  await assert.rejects(api.getItemsFromParentId({ id: 3, params: { increment: 1 } }), /Silo request failed \(500\)/);
  await assert.rejects(api.getEpisodes({ SeriesId: 'series', SeasonId: 's1' }), /Invalid Silo episode response/);
});

test('uses the Silo Barracks package identity as its user agent', async t => {
  const fixture = await fixtureServer((req, res) => {
    assert.equal(req.headers['user-agent'], 'Silo-Barracks/1.2.3-beta.3');
    json(res, 200, []);
  });
  t.after(fixture.close);
  await apiFor(fixture.url).getSessions();
});

test('maps native catalog pagination and traverses native season and episode identities', async t => {
  const fixture = await fixtureServer((req, res) => {
    const url = new URL(req.url, 'http://fixture');
    if (url.pathname === '/proxy/api/v1/catalog') {
      assert.equal(url.searchParams.get('library_id'), '3');
      assert.equal(url.searchParams.get('offset'), '0');
      assert.equal(url.searchParams.get('limit'), '2');
      return json(res, 200, { total: 2, has_more: false, items: [
        { content_id: 'movie-1', type: 'movie', title: 'Movie', runtime: 120, year: 2025,
          added_at: '2026-01-01T00:00:00Z', poster_url: 'https://objects.invalid/movie' },
        { content_id: 'series-1', type: 'series', title: 'Series', runtime: 0,
          added_at: '2026-01-02T00:00:00Z' },
      ] });
    }
    if (url.pathname === '/proxy/api/v1/catalog/series/series-1/seasons') return json(res, 200, { seasons: [
      { content_id: 'season-native-1', season_number: 1, title: 'Season 1', episode_count: 1 },
    ] });
    if (url.pathname === '/proxy/api/v1/catalog/series/series-1/seasons/1/episodes') return json(res, 200, { episodes: [
      { content_id: 'episode-native-1', season_number: 1, episode_number: 2,
        title: 'Episode', runtime: 44, air_date: '2026-01-03' },
    ] });
    if (url.pathname === '/proxy/api/v1/catalog/items/movie-1') return json(res, 200, {
      content_id: 'movie-1', type: 'movie', title: 'Movie', versions: [{ file_id: 11, duration: 7200, bitrate: 5000 }],
    });
    if (url.pathname === '/proxy/api/v1/catalog/items/episode-native-1') return json(res, 200, {
      content_id: 'episode-native-1', type: 'episode', title: 'Episode', series_id: 'series-1',
      versions: [{ file_id: 12, duration: 2640, bitrate: 3000 }],
    });
    json(res, 404, {});
  });
  t.after(fixture.close);

  const rows = await apiFor(fixture.url).getItemsFromParentId({ id: 3, params: { startIndex: 0, increment: 2 } });
  assert.deepEqual(rows.map(x => [x.Id, x.Type]), [
    ['movie-1', 'Movie'], ['series-1', 'Series'], ['season-native-1', 'Season'], ['episode-native-1', 'Episode'],
  ]);
  assert.equal(rows[2].SeriesId, 'series-1');
  assert.equal(rows[2].SeriesName, 'Series');
  assert.equal(rows[3].SeriesId, 'series-1');
  assert.equal(rows[3].SeasonId, 'season-native-1');
  assert.equal(rows[3].SeriesName, 'Series');
  assert.equal(rows[3].RunTimeTicks, 26_400_000_000);
  assert.equal(rows[0].MediaSources[0].Id, '11');
  assert.equal(rows[3].MediaSources[0].ItemId, 'episode-native-1');
});

test('maps direct native episode details with series metadata and episode indexes', async t => {
  const fixture = await fixtureServer((req, res) => {
    if (req.url === '/proxy/api/v1/health') return json(res, 200, { status: 'ok', server_id: 'server' });
    if (req.url === '/proxy/api/v1/catalog/items/episode-detail-1') return json(res, 200, {
      content_id: 'episode-detail-1', type: 'episode', title: 'Pilot', runtime: 42,
      series_id: 'series-detail-1', series_title: 'Detail Series',
      season_number: 1, episode_number: 3,
      versions: [{ file_id: 33, duration: 2520, bitrate: 2800 }],
    });
    json(res, 404, {});
  });
  t.after(fixture.close);

  const [item] = await apiFor(fixture.url).getItemsByID({ ids: ['episode-detail-1'] });
  assert.equal(item.Type, 'Episode');
  assert.equal(item.SeriesId, 'series-detail-1');
  assert.equal(item.SeriesName, 'Detail Series');
  assert.equal(item.ParentIndexNumber, 1);
  assert.equal(item.IndexNumber, 3);
  assert.equal(item.MediaSources[0].ItemId, 'episode-detail-1');
});

test('maps detail versions for item info and resolves only catalog-owned image URLs', async t => {
  let detailCalls = 0;
  const fixture = await fixtureServer((req, res) => {
    if (req.url === '/proxy/api/v1/catalog/items/movie-1') {
      detailCalls++;
      return json(res, 200, { content_id: 'movie-1', type: 'movie', title: 'Movie',
        poster_url: 'https://objects.invalid/poster', backdrop_url: 'https://objects.invalid/backdrop',
        versions: [{ file_id: 12, file_name: 'movie.mkv', file_path: '/media/movie.mkv',
          file_size: 123, bitrate: 9000, duration: 7200, container: 'mkv', codec_video: 'hevc',
          codec_audio: 'aac', resolution: '2160p', audio_tracks: [{ index: 0, codec: 'aac', channels: 6 }] }] });
    }
    json(res, 404, {});
  });
  t.after(fixture.close);
  const api = apiFor(fixture.url);
  const [source] = await api.getItemInfo({ itemID: 'movie-1' });
  assert.equal(source.ItemId, 'movie-1');
  assert.equal(source.Id, '12');
  assert.equal(source.RunTimeTicks, 72_000_000_000);
  assert.equal(source.Bitrate, 9_000_000);
  assert.equal(source.MediaStreams[0].Codec, 'hevc');
  assert.equal(await api.getImageUrl('movie-1', 'Primary'), 'https://objects.invalid/poster');
  assert.equal(await api.getImageUrl('movie-1', 'Backdrop'), 'https://objects.invalid/backdrop');
  assert.equal(await api.getImageUrl('https://evil.invalid/a', 'Primary'), null);
  assert.equal(detailCalls, 1, 'detail is reused from the bounded cache');
});
