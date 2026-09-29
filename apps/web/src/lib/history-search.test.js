import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHistorySearchResult, createLatestRequest } from './history-search.js';

test('results read as clean titles without null fragments', () => {
  assert.equal(formatHistorySearchResult({ type: 'movie', title: 'Heat', year: 1995 }), 'Heat (1995)');
  assert.equal(formatHistorySearchResult({ type: 'movie', title: 'Heat', year: null }), 'Heat');
  assert.equal(formatHistorySearchResult({ type: 'episode', title: 'Pilot', seriesName: 'Show', seasonNumber: 1, episodeNumber: 2 }), 'Show · S01E02 · Pilot');
  assert.equal(formatHistorySearchResult({ type: 'episode', title: 'Pilot', seriesName: null, seasonNumber: null, episodeNumber: null }), 'Pilot');
});

test('only the newest request is applied', () => {
  const latest = createLatestRequest();
  const a = latest.next(); const b = latest.next();
  assert.equal(latest.isLatest(a), false);
  assert.equal(latest.isLatest(b), true);
});
