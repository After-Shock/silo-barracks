const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const SiloAPI = require('../classes/silo-api');
const { createFleet } = require('../classes/silo-fleet');
const { validateConnection } = require('../classes/silo-server-registry');

test('two native HTTP servers retain separate credentials, count paused streams, fail independently and recover', async t => {
  let failed = false;
  const rows = [];
  for (const id of ['alpha', 'beta']) {
    const server = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.headers.authorization !== `Bearer fixture-${id}`) { res.statusCode = 403; return res.end('{}'); }
      if (req.url.endsWith('/health')) return res.end(JSON.stringify({ status: 'ok', server_id: id }));
      if (id === 'beta' && failed) { res.statusCode = 503; return res.end('{}'); }
      res.end(JSON.stringify([{ session_id: 'same-session', user_id: 1, username: id,
        content_id: 'same-item', media_title: 'Fixture', media_type: 'movie', file_duration: 100,
        position_seconds: 5, is_paused: id === 'beta', play_method: 'direct', client_name: 'Silo Web' }]));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    rows.push({ id, name: id, enabled: true, url: `http://127.0.0.1:${server.address().port}`, apiKey: `fixture-${id}` });
  }
  for (const row of rows) assert.equal((await validateConnection(row.url, row.apiKey)).id, row.id);
  const fleet = createFleet({ listServers: async () => rows, createClient: row => new SiloAPI({
    getConfig: async () => ({ state: 2, SILO_URL: row.url, SILO_API_KEY: row.apiKey }), timeoutMs: 500,
  }) });
  let snapshot = await fleet.refresh();
  assert.equal(snapshot.totalActiveStreams, 2);
  assert.equal(snapshot.pausedStreams, 1);
  assert.notEqual(snapshot.servers[0].sessions[0].FleetSessionId, snapshot.servers[1].sessions[0].FleetSessionId);
  failed = true;
  snapshot = await fleet.refresh();
  assert.equal(snapshot.totalActiveStreams, 1);
  assert.equal(snapshot.partial, true);
  assert.equal(snapshot.servers[1].sessions[0].stale, true);
  failed = false;
  snapshot = await fleet.refresh();
  assert.equal(snapshot.totalActiveStreams, 2);
  assert.equal(snapshot.partial, false);
  assert.ok(!JSON.stringify(snapshot).includes('fixture-beta'));
});
