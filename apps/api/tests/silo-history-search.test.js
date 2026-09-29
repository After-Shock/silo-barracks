const test = require('node:test');
const assert = require('node:assert/strict');
const { historySearchResult } = require('../classes/silo/mappers');
const SiloApi = require('../classes/silo-api');

test('search results keep only history-filterable movies and episodes', () => {
  assert.deepEqual(historySearchResult({ content_id: 'movie-1', type: 'movie', title: 'Heat', year: 1995 }),
    { id: 'movie-1', title: 'Heat', type: 'movie', seriesName: null, seasonNumber: null, episodeNumber: null, year: 1995 });
  assert.deepEqual(historySearchResult({ content_id: 'ep-1', type: 'episode', title: 'Pilot', series_title: 'Show',
    season_number: 1, episode_number: 2 }),
    { id: 'ep-1', title: 'Pilot', type: 'episode', seriesName: 'Show', seasonNumber: 1, episodeNumber: 2, year: null });
  assert.equal(historySearchResult({ content_id: 'series-1', type: 'series', title: 'Show' }), null);
  assert.equal(historySearchResult({ type: 'movie', title: 'No id' }), null);
});

test('invalid queries never reach Silo; valid ones are trimmed and capped', async () => {
  const api = Object.create(SiloApi.prototype);
  const calls = [];
  api._catalogPage = async (options) => { calls.push(options); return { items: Array.from({ length: 12 }, (_, i) => ({ content_id: `m${i}`, type: 'movie', title: `M${i}` })) }; };
  for (const q of [undefined, null, '', ' a ', 'x'.repeat(101), 42]) assert.deepEqual(await api.searchPlaybackHistoryItems(q), []);
  assert.equal(calls.length, 0);
  const results = await api.searchPlaybackHistoryItems('  deadliest catch & co ');
  assert.equal(calls[0].search, 'deadliest catch & co');
  assert.equal(results.length, 8);
});
