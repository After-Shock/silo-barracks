// Local contract fixture for manual end-to-end verification. Never use in production.
// Run: node apps/api/tests/fixtures/silo-server.cjs (127.0.0.1:4100 only).
const http = require('node:http');
let state = 'playing';
const started = Date.now();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4100');
  const json = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (url.pathname === '/__test/state' && req.method === 'POST') {
    state = url.searchParams.get('value');
    return json(200, { state });
  }
  if (url.pathname === '/api/v1/health') return json(200, { status: 'ok', server_name: 'Silo contract fixture', server_id: 'fixture-server' });
  if (req.headers.authorization !== 'Bearer sa_fixture_only') return json(401, { error: 'Unauthorized' });
  if (url.pathname === '/api/v1/admin/sessions') {
    if (state === 'unavailable') return json(503, { error: 'Fixture outage' });
    return json(200, state === 'empty' ? [] : [{
      session_id: 'fixture-session', user_id: 42, username: 'Alex', profile_id: 'profile-family', profile_name: 'Family',
      media_file_id: 91, content_id: 'fixture-film', media_title: 'Silo activity verification', media_type: 'movie',
      play_method: 'direct', effective_play_method: 'direct', file_duration: 5400,
      position_seconds: 600 + (Date.now() - started) / 1000, is_paused: state === 'paused',
      client_name: 'Silo TV', client_version: '1.0', client_label: 'Living room TV', client_ip: '192.0.2.42',
      source_container: 'mkv', source_video_codec: 'hevc', source_video_resolution: '2160p',
      source_audio_codec: 'aac', source_audio_channels: 6, source_bitrate_kbps: 8000,
      started_at: new Date(started).toISOString(), updated_at: new Date().toISOString(),
    }]);
  }
  if (url.pathname === '/api/v1/admin/users') return json(200, [{ id: 42, username: 'Alex', role: 'admin', enabled: true }]);
  if (url.pathname === '/api/v1/libraries') return json(200, []);
  if (url.pathname === '/api/v1/catalog') return json(200, { items: [], total: 0 });
  if (url.pathname === '/api/v1/admin/stats') return json(200, { total_users: 1, active_streams: state === 'empty' ? 0 : 1 });
  return json(404, { error: 'Fixture endpoint not implemented' });
});
server.listen(4100, '127.0.0.1', () => console.log('Silo contract fixture: http://127.0.0.1:4100'));
