const test = require('node:test');
const assert = require('node:assert/strict');
const { createActivityStore } = require('../classes/silo-activity-store');

test('post-commit summary refresh failure does not invalidate saved history and retries', async () => {
  let reads = 0;
  let refreshes = 0;
  const store = createActivityStore({ connect: async () => ({
    query: async sql => ({ rows: sql.includes('FOR UPDATE') && reads++ === 0
      ? [{ Id: 'ended', ActivityId: 'history-ended', PlaybackDuration: 5, PlayState: { SiloSessionId: 'ended' } }] : [] }),
    release() {},
  }) }, { onCompleted: async () => { if (++refreshes === 1) throw new Error('refresh failed'); } });
  await store.applySnapshot([], Date.now());
  await store.applySnapshot([], Date.now());
  assert.equal(refreshes, 2);
});

test('database failure rolls back snapshot and releases the connection', async () => {
  const queries = [];
  let released = false;
  const store = createActivityStore({ connect: async () => ({
    query: async sql => {
      queries.push(sql);
      if (sql.startsWith('SELECT')) throw new Error('database unavailable');
      return { rows: [] };
    }, release: () => { released = true; },
  }) });
  await assert.rejects(store.applySnapshot([], Date.now()), /database unavailable/);
  assert.ok(queries.includes('ROLLBACK'));
  assert.ok(!queries.includes('COMMIT'));
  assert.equal(released, true);
});

test('PostgreSQL persists progress, profile and finalizes exactly once', {
  skip: !process.env.SILO_TEST_DATABASE_URL && 'Set SILO_TEST_DATABASE_URL to an isolated test database',
}, async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.SILO_TEST_DATABASE_URL });
  const schema = 'barracks_test_' + Date.now();
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const columns = '"Id" text PRIMARY KEY, "IsPaused" boolean, "UserId" text, "UserName" text, "Client" text, "DeviceName" text, "DeviceId" text, "ApplicationVersion" text, "NowPlayingItemId" text, "NowPlayingItemName" text, "EpisodeId" text, "SeasonId" text, "SeriesName" text, "PlaybackDuration" bigint, "PlayMethod" text, "ActivityDateInserted" timestamp, "MediaStreams" json, "TranscodingInfo" json, "PlayState" json, "OriginalContainer" text, "RemoteEndPoint" text, "ServerId" text';
    await client.query(`CREATE TABLE jf_activity_watchdog (${columns}, "ActivityId" text NOT NULL)`);
    await client.query(`CREATE TABLE jf_playback_activity (${columns})`);
    const store = createActivityStore({ connect: async () => ({ query: client.query.bind(client), release() {} }) });
    const session = { Id: 'session-a', ServerId: 'silo-server', UserId: '2', UserName: 'Alex',
      ProfileId: 'profile-kid', ProfileName: 'Kid', DeviceName: 'TV', DeviceId: 'session-a', Client: 'Silo TV',
      NowPlayingItem: { Id: 'film-1', Name: 'Film', Type: 'Movie', MediaStreams: [] },
      PlayState: { IsPaused: false, PositionTicks: 10000000, PlayMethod: 'DirectPlay' } };
    const now = Date.now();
    await store.applySnapshot([session], now);
    await store.applySnapshot([{ ...session, PlayState: { ...session.PlayState, PositionTicks: 60000000 } }], now + 5000);
    const { rows: active } = await client.query('SELECT * FROM jf_activity_watchdog');
    assert.equal(active[0].Id, 'session-a');
    assert.equal(active[0].PlayState.SiloProfileId, 'profile-kid');
    assert.equal(active[0].PlayState.PositionTicks, 60000000);
    assert.equal(Number(active[0].PlaybackDuration), 5);
    await client.query(`ALTER TABLE jf_activity_watchdog ADD CONSTRAINT fixture_failure CHECK ("UserName" <> 'reject-fixture')`);
    await assert.rejects(store.applySnapshot([{ ...session, Id: 'replacement', UserName: 'reject-fixture' }], now + 7000));
    assert.equal((await client.query('SELECT * FROM jf_playback_activity')).rows.length, 0, 'failed replacement rolls back prior finalization');
    assert.equal((await client.query('SELECT * FROM jf_activity_watchdog')).rows[0].Id, 'session-a');
    await store.applySnapshot([], now + 10000);
    await store.applySnapshot([], now + 15000);
    const { rows: history } = await client.query('SELECT * FROM jf_playback_activity');
    assert.equal(history.length, 1);
    assert.equal(Number(history[0].PlaybackDuration), 10);
    assert.equal(history[0].PlayState.SiloSessionId, 'session-a');
    assert.equal((await client.query('SELECT * FROM jf_activity_watchdog')).rows.length, 0);
  } finally {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
});
