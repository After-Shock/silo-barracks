const test = require('node:test');
const assert = require('node:assert/strict');
const { createPeakTracker } = require('../classes/stream-peaks');

test('peak tracker keeps stream and transcode high-water marks per scope', async () => {
  const writes = [];
  const pool = { query: async (sql, params) => {
    if (sql.startsWith('SELECT')) return { rows: [{ scope: 'all', streams: 2, streams_transcodes: 1, streams_at: 't0', transcodes: 1, transcodes_at: 't0' }] };
    writes.push(params);
    return { rows: [] };
  } };
  const peaks = createPeakTracker(pool);
  const snap = (at, a, at_, b, bt) => ({ updatedAt: at, totalActiveStreams: a + b, totalTranscodeStreams: at_ + bt, servers: [
    { id: 'primary', name: 'Main', state: 'connected', activeStreams: a, transcodeStreams: at_ },
    { id: 'x', state: 'unavailable', activeStreams: b, transcodeStreams: bt }] });
  await peaks.record(snap('t1', 1, 0, 0, 0));
  assert.deepEqual(writes.map(w => w[0]), ['primary']); // total 1 < stored 2; unavailable server skipped
  await peaks.record(snap('t2', 3, 1, 0, 0));
  await peaks.record(snap('t3', 2, 2, 0, 0));
  await peaks.record(snap('t4', 2, 2, 0, 0)); // no change → no write
  assert.equal(writes.length, 5);
  assert.deepEqual(peaks.current().all, { streams: 3, streamsTranscodes: 1, streamsAt: 't2',
    streamsBreakdown: [{ serverId: 'primary', serverName: 'Main', count: 3 }], transcodes: 2, transcodesAt: 't3',
    transcodesBreakdown: [{ serverId: 'primary', serverName: 'Main', count: 2 }] });
  assert.deepEqual(peaks.current().primary, { streams: 3, streamsTranscodes: 1, streamsAt: 't2', streamsBreakdown: [],
    transcodes: 2, transcodesAt: 't3', transcodesBreakdown: [] });
});
