const { planSnapshot } = require('../tasks/silo-activity');
const { columnsPlayback } = require('../models/jf_playback_activity');

const historyColumns = columnsPlayback.map(column => typeof column === 'string' ? column : column.name);
const jsonColumns = new Set(['MediaStreams', 'TranscodingInfo', 'PlayState']);

async function upsert(client, table, columns, row) {
  // Table/column identifiers are internal constants, never request input.
  const quoted = columns.map(column => `"${column}"`);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const updates = columns.filter(column => column !== 'Id').map(column => `"${column}" = EXCLUDED."${column}"`);
  const values = columns.map(column => jsonColumns.has(column)
    ? JSON.stringify(row[column] ?? null) : row[column] ?? null);
  await client.query(`INSERT INTO ${table} (${quoted.join(',')}) VALUES (${placeholders.join(',')})
    ON CONFLICT ("Id") DO UPDATE SET ${updates.join(',')}`, values);
}

function createActivityStore(pool, { maxGapSeconds = 15, minimumSeconds = 1, onCompleted = async () => {} } = {}) {
  let refreshPending = false;
  return {
    async applySnapshot(sessions, now, { discontinuous = false } = {}) {
      const client = await pool.connect();
      let snapshot;
      try {
        await client.query('BEGIN');
        // Serialize the snapshot transaction even when two app processes overlap.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('silo-barracks-activity'))");
        const { rows } = await client.query(`SELECT * FROM jf_activity_watchdog
          WHERE "PlayState"->>'SiloSessionId' IS NOT NULL FOR UPDATE`);
        snapshot = planSnapshot(rows, sessions, { now, maxGapSeconds: discontinuous ? 0 : maxGapSeconds });
        for (const row of snapshot.ended) {
          if (row.PlaybackDuration >= minimumSeconds) {
            await upsert(client, 'jf_playback_activity', historyColumns, { ...row, Id: row.ActivityId });
          }
          await client.query('DELETE FROM jf_activity_watchdog WHERE "Id"=$1 AND "ActivityId"=$2', [row.Id, row.ActivityId]);
        }
        for (const row of snapshot.active) {
          await upsert(client, 'jf_activity_watchdog', [...historyColumns, 'ActivityId'], row);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      refreshPending ||= snapshot.ended.length > 0;
      if (refreshPending) {
        try {
          await onCompleted();
          refreshPending = false;
        } catch {
          // History is committed. Retry derived summaries without claiming the
          // transaction failed or excluding the next observed playback interval.
          console.warn('[Silo Barracks] History saved; summary refresh will retry.');
        }
      }
      return snapshot;
    },
  };
}

module.exports = { createActivityStore };
