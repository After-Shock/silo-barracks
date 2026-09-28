const test = require('node:test');
const assert = require('node:assert/strict');
const { historyToTimeline, buildSiloTimeline } = require('../classes/silo/timeline');

const ep = (id, at, secs) => ({ NowPlayingItemId: id, SiloMediaType: 'episode', NowPlayingItemName: `Ep ${id}`,
  UserName: 'sam', ActivityDateInserted: at, PlaybackDuration: secs });

test('episodes group by series+season; movies stay single; newest first', () => {
  const rows = [ep('e2', '2026-09-02T00:00:00Z', 60), ep('e1', '2026-09-01T00:00:00Z', 40),
    { NowPlayingItemId: 'm', SiloMediaType: 'movie', NowPlayingItemName: 'Heat', UserName: 'sam',
      ActivityDateInserted: '2026-09-03T00:00:00Z', PlaybackDuration: 100 }];
  const series = new Map([['e1', { seriesTitle: 'Show', seasonName: 'Season 1', seriesId: 's' }],
    ['e2', { seriesTitle: 'Show', seasonName: 'Season 1', seriesId: 's' }]]);
  const out = historyToTimeline(rows, series);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map(r => r.Title), ['Heat', 'Show']);
  assert.equal(out[1].EpisodeCount, 2);
  assert.equal(out[1].TotalPlaybackDuration, 100);
  assert.equal(out[1].FirstActivityDate, '2026-09-01T00:00:00Z');
  assert.equal(out[1].MediaType, 'tvshows');
  assert.equal(out[1].NowPlayingItemId, 's');
});

test('episode without resolvable series falls back to its own title', () => {
  const out = historyToTimeline([ep('x', '2026-09-01T00:00:00Z', 5)], new Map());
  assert.equal(out[0].Title, 'Ep x');
  assert.equal(out[0].SeasonName, null);
});

test('history scan is bounded even when upstream always reports more pages', async () => {
  let calls = 0;
  const api = {
    async getPlaybackHistoryPage({ userId, cursor }) {
      assert.equal(userId, 'u1');
      calls += 1;
      return { results: Array.from({ length: 100 }, (_, i) => ep(`e${calls}-${i}`, '2026-09-01T00:00:00Z', 1)),
        hasMore: true, nextCursor: `c${calls}` };
    },
    async _detail() { throw Object.assign(new Error('not found'), { status: 404 }); },
  };
  const out = await buildSiloTimeline(api, 'u1');
  assert.equal(calls, 5);
  assert.equal(out.length, 500);
});

test('failed episode detail lookups keep the timeline and resolve the rest', async () => {
  const api = {
    async getPlaybackHistoryPage() {
      return { results: [ep('ok', '2026-09-02T00:00:00Z', 10), ep('gone', '2026-09-01T00:00:00Z', 10)], hasMore: false };
    },
    async _detail(id) {
      if (id === 'gone') throw Object.assign(new Error('not found'), { status: 404 });
      return { series_id: 99, series_title: 'Show', season_number: 2 };
    },
  };
  const out = await buildSiloTimeline(api, 'u1');
  assert.deepEqual(out.map(r => [r.Title, r.SeasonName]), [['Show', 'Season 2'], ['Ep gone', null]]);
});

test('a title rewatched after more than a month, or interrupted by another title, starts a new entry', () => {
  const show = { seriesTitle: 'Show', seasonName: 'Season 1', seriesId: 's' };
  const rows = [ep('e3', '2026-09-20T00:00:00Z', 5), ep('e2', '2026-01-10T00:00:00Z', 5),
    { NowPlayingItemId: 'm', SiloMediaType: 'movie', NowPlayingItemName: 'Heat', UserName: 'sam',
      ActivityDateInserted: '2026-01-05T00:00:00Z', PlaybackDuration: 5 },
    ep('e1', '2026-01-01T00:00:00Z', 5)];
  const out = historyToTimeline(rows, new Map([['e1', show], ['e2', show], ['e3', show]]));
  assert.deepEqual(out.map(r => [r.Title, r.FirstActivityDate.slice(0, 10), r.EpisodeCount]),
    [['Show', '2026-09-20', 1], ['Show', '2026-01-10', 1], ['Heat', '2026-01-05', 0], ['Show', '2026-01-01', 1]]);
});

test('a missing or blank user id is rejected instead of returning every user\'s history', async () => {
  let called = false;
  const api = { async getPlaybackHistoryPage() { called = true; return { results: [], hasMore: false }; } };
  for (const userId of [null, '', '   ', undefined, 42]) {
    await assert.rejects(buildSiloTimeline(api, userId), error => error.status === 400);
  }
  assert.equal(called, false);
});
