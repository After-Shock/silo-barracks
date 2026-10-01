'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeLibraryPlays, storageNeedsRefresh, measureLibraryStorage } = require('../classes/silo/library-stats');

test('library plays, watch time and last played come from Silo history rows', () => {
  const now = Date.parse('2026-10-01T03:00:00Z');
  const rows = [
    { media_item_id: 'episode-a-1-1', media_title: 'Pilot', watched_seconds: 1500.4, started_at: '2026-09-30T01:00:00Z', ended_at: '2026-09-30T01:25:00Z' },
    { media_item_id: 'episode-a-1-2', media_title: 'Second', watched_seconds: 1200, started_at: '2026-10-01T00:00:00Z', ended_at: '2026-10-01T01:30:00Z' },
    { media_item_id: 'movie-b', media_title: 'Moana', watched_seconds: 6000, started_at: '2026-09-20T00:00:00Z', ended_at: '2026-09-20T02:00:00Z' },
    { media_item_id: 'gone', media_title: 'Deleted', watched_seconds: 99, started_at: '2026-10-01T02:00:00Z' },
    { media_item_id: 'movie-c', media_file_id: '4k', media_title: 'Dune', watched_seconds: 10, started_at: '2026-09-01T00:00:00Z' },
  ];
  const series = [{ id: 'e1', library_id: '2' }, { id: 'e2', library_id: '2' }];
  const files = new Map([['episode-a-1-1', series], ['episode-a-1-2', series], ['movie-b', [{ id: 'b', library_id: '1' }]], ['gone', []],
    ['movie-c', [{ id: 'hd', library_id: '1' }, { id: '4k', library_id: '11' }]]]);
  const stats = summarizeLibraryPlays(rows, files, now);
  assert.deepEqual(Object.keys(stats).sort(), ['1', '11', '2']);
  // A title held in two libraries counts only toward the library of the file that was played.
  assert.equal(stats['11'].Plays, 1);
  assert.equal(stats['2'].Plays, 2);
  assert.equal(stats['2'].total_playback_duration, 2700);
  assert.equal(stats['2'].ItemName, 'Second');
  assert.deepEqual(stats['2'].LastActivity, { days: 0, hours: 1, minutes: 30, seconds: 0 });
  assert.equal(stats['1'].Plays, 1);
  assert.deepEqual(stats['1'].LastActivity, { days: 11, hours: 1, minutes: 0, seconds: 0 });
});

test('stored storage is re-measured when missing, legacy, or older than the latest Silo scan', () => {
  const library = { Id: '1', LastScannedAt: '2026-09-30T06:00:42.013Z' };
  assert.equal(storageNeedsRefresh(undefined, library), true);
  assert.equal(storageNeedsRefresh({ Size: 1, files: 80, updatedAt: '2026-09-15T00:00:00Z' }, library), true);
  assert.equal(storageNeedsRefresh({ files: 80, updatedAt: '2026-09-15T00:00:00Z', scannedAt: '2026-09-15T00:00:00Z' }, library), true);
  assert.equal(storageNeedsRefresh({ files: 80, updatedAt: '2026-09-30T07:00:00Z', scannedAt: library.LastScannedAt }, library), false);
  assert.equal(storageNeedsRefresh({ files: 80, updatedAt: '2026-09-30T07:00:00Z' }, { Id: '1' }), false);
});

function catalogOf(items, pageSize = 2) {
  return async ({ startIndex }) => ({ items: items.slice(startIndex, startIndex + pageSize), has_more: startIndex + pageSize < items.length });
}

test('storage counts every file in the library, including all episodes of a series in one lookup', async () => {
  const files = {
    'series-a': [{ library_id: '2' }, { library_id: '2' }, { library_id: '2' }, { library_id: '9' }],
    'series-b': [{ library_id: '2' }],
    'series-c': [],
  };
  const result = await measureLibraryStorage({
    libraryId: '2', measureSize: false,
    catalogPage: catalogOf([{ content_id: 'series-a' }, { content_id: 'series-b' }, { content_id: 'series-c' }]),
    itemFiles: async id => files[id],
    itemVersions: async () => { throw new Error('size is not measured for series libraries'); },
    deadlineAt: Date.now() + 10000,
  });
  assert.deepEqual(result, { files: 4, size: null, complete: true });
});

test('movie storage sums only the versions whose file is in this library', async () => {
  const movies = [{ content_id: 'm1' }, { content_id: 'm2' }, { content_id: 'm3' }];
  // m2 has a 4K copy in library 11 that must not count toward library 1.
  const files = { m1: [{ id: 'f1', library_id: '1' }], m2: [{ id: 'f2', library_id: '1' }, { id: 'f2k', library_id: '11' }], m3: [{ id: 'f3', library_id: '1' }] };
  const versions = { m1: [{ file_id: 'f1', file_size: 100 }], m2: [{ file_id: 'f2', size: 15 }, { file_id: 'f2k', file_size: 9000 }], m3: [{ file_id: 'f3', file_size: 100 }] };
  const base = {
    libraryId: '1', measureSize: true, catalogPage: catalogOf(movies),
    itemFiles: async id => files[id],
    itemVersions: async id => versions[id],
  };
  assert.deepEqual(await measureLibraryStorage({ ...base, deadlineAt: Date.now() + 10000 }), { files: 3, size: 215, complete: true });
  const timedOut = await measureLibraryStorage({ ...base, deadlineAt: Date.now() - 1 });
  assert.equal(timedOut.complete, false);
});

test('an episode belongs to the libraries holding its series files', async () => {
  const SiloAPI = require('../classes/silo-api');
  const api = new SiloAPI({ getConfig: async () => ({ state: 2, SILO_URL: 'http://silo.invalid', SILO_API_KEY: 'k' }) });
  // Silo's files endpoint 404s for episode IDs (returned as no files); the series lookup has them.
  api._itemFiles = async id => (id === 'series-a' ? [{ id: '1', library_id: '2' }, { id: '2', library_id: '10' }] : []);
  const calls = [];
  const filesFor = api._itemFiles;
  api._itemFiles = async id => { calls.push(id); return filesFor(id); };
  api._detail = async id => (id === 'odd-episode' ? { content_id: id, series_id: 'series-a' } : Promise.reject(new Error('gone')));
  // Conventional episode IDs map straight to their series; many episodes of one series share one lookup.
  const [first, second] = await Promise.all([api._itemLibraryIds('episode-a-1-1'), api._itemLibraryIds('episode-a-1-2')]);
  assert.deepEqual([...first].sort(), ['10', '2']);
  assert.deepEqual([...second].sort(), ['10', '2']);
  assert.deepEqual(calls, ['series-a']);
  // Anything else falls back to the item's detail.
  assert.deepEqual([...await api._itemLibraryIds('odd-episode')].sort(), ['10', '2']);
  assert.deepEqual([...await api._itemLibraryIds('movie-deleted')], []);
});

test('stale libraries are measured smallest first', async () => {
  const SiloAPI = require('../classes/silo-api');
  const api = new SiloAPI({ getConfig: async () => ({ state: 2, SILO_URL: 'http://silo.invalid', SILO_API_KEY: 'k' }) });
  const counts = { big: 12000, small: 80, mid: 900 };
  api.getLibraries = async () => Object.keys(counts).map(Id => ({ Id, CollectionType: 'movies', LastScannedAt: 'now' }));
  api._readLibraryStorageStore = () => ({});
  api._writeLibraryStorageStore = () => {};
  api.getLibraryCatalogSummary = async ({ id }) => ({ total: counts[id] });
  const order = [];
  api._calculateLibraryStorage = async library => { order.push(library.Id); return { measurement_available: false }; };
  await api.getLibraryStorageMetadata();
  await api.libraryStorageOrdering;
  await api.libraryStorageQueue;
  assert.deepEqual(order, ['small', 'mid', 'big']);
});
