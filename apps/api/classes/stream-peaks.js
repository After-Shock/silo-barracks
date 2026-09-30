// All-time concurrent stream and transcode high-water marks, total ('all') and per server.
function createPeakTracker(pool) {
  let peaks = null;
  const load = async () => {
    if (peaks) return;
    const { rows } = await pool.query('SELECT * FROM silo_stream_peaks');
    peaks = Object.fromEntries(rows.map(row => [row.scope, row]));
  };
  async function record(snapshot) {
    await load();
    const at = snapshot.updatedAt;
    const samples = [['all', snapshot.totalActiveStreams, snapshot.totalTranscodeStreams],
      ...snapshot.servers.filter(server => server.state === 'connected')
        .map(server => [server.id, server.activeStreams, server.transcodeStreams])];
    for (const [scope, streams, transcodes] of samples) {
      const old = peaks[scope] || { scope, streams: 0, streams_transcodes: 0, streams_at: null, transcodes: 0, transcodes_at: null };
      const next = { ...old };
      if (streams > old.streams) Object.assign(next, { streams, streams_transcodes: transcodes, streams_at: at });
      if (transcodes > old.transcodes) Object.assign(next, { transcodes, transcodes_at: at });
      if (next.streams_at === old.streams_at && next.transcodes_at === old.transcodes_at) continue;
      await pool.query(`INSERT INTO silo_stream_peaks (scope, streams, streams_transcodes, streams_at, transcodes, transcodes_at)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (scope) DO UPDATE SET streams=$2, streams_transcodes=$3, streams_at=$4,
        transcodes=$5, transcodes_at=$6`, [scope, next.streams, next.streams_transcodes, next.streams_at, next.transcodes, next.transcodes_at]);
      peaks[scope] = next;
    }
  }
  const current = () => Object.fromEntries(Object.entries(peaks || {}).map(([scope, row]) => [scope, {
    streams: row.streams, streamsTranscodes: row.streams_transcodes, streamsAt: row.streams_at,
    transcodes: row.transcodes, transcodesAt: row.transcodes_at }]));
  return { record, current };
}
module.exports = { createPeakTracker };
