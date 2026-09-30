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
    const connected = snapshot.servers.filter(server => server.state === 'connected');
    const breakdown = key => connected.filter(server => server[key] > 0)
      .map(server => ({ serverId: server.id, serverName: server.name, count: server[key] }));
    const samples = [['all', snapshot.totalActiveStreams, snapshot.totalTranscodeStreams, true],
      ...connected.map(server => [server.id, server.activeStreams, server.transcodeStreams, false])];
    for (const [scope, streams, transcodes, total] of samples) {
      const old = peaks[scope] || { scope, streams: 0, streams_transcodes: 0, streams_at: null, transcodes: 0, transcodes_at: null,
        streams_breakdown: null, transcodes_breakdown: null };
      const next = { ...old };
      if (streams > old.streams) Object.assign(next, { streams, streams_transcodes: transcodes, streams_at: at,
        streams_breakdown: total ? breakdown('activeStreams') : null });
      if (transcodes > old.transcodes) Object.assign(next, { transcodes, transcodes_at: at,
        transcodes_breakdown: total ? breakdown('transcodeStreams') : null });
      if (next.streams_at === old.streams_at && next.transcodes_at === old.transcodes_at) continue;
      await pool.query(`INSERT INTO silo_stream_peaks (scope, streams, streams_transcodes, streams_at, transcodes, transcodes_at,
        streams_breakdown, transcodes_breakdown) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (scope) DO UPDATE SET
        streams=$2, streams_transcodes=$3, streams_at=$4, transcodes=$5, transcodes_at=$6, streams_breakdown=$7, transcodes_breakdown=$8`,
      [scope, next.streams, next.streams_transcodes, next.streams_at, next.transcodes, next.transcodes_at,
        JSON.stringify(next.streams_breakdown), JSON.stringify(next.transcodes_breakdown)]);
      peaks[scope] = next;
    }
  }
  const current = () => Object.fromEntries(Object.entries(peaks || {}).map(([scope, row]) => [scope, {
    streams: row.streams, streamsTranscodes: row.streams_transcodes, streamsAt: row.streams_at,
    streamsBreakdown: row.streams_breakdown || [], transcodes: row.transcodes, transcodesAt: row.transcodes_at,
    transcodesBreakdown: row.transcodes_breakdown || [] }]));
  return { record, current };
}
module.exports = { createPeakTracker };
