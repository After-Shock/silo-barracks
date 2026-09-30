const test = require('node:test');
const assert = require('node:assert/strict');
const { createFleet } = require('../classes/silo-fleet');

test('hall of fame merges every connected server, labelled and ranked', async () => {
  const top = { a: [{ user_id: 'u1', profile_id: 'p1', profile_name: 'Kasper', plays: 7 }],
    b: [{ user_id: 'u1', profile_id: 'p1', profile_name: 'jess@example.com', username: 'Jess', plays: 9 }, { user_id: 'u2', profile_name: 'bo@example.com', username: 'bo@example.com', plays: 1 }], c: null };
  const titles = { a: [{ media_item_id: '1', title: 'Dune', media_type: 'movie', plays: 3, total_seconds: 60 }],
    b: [{ media_item_id: '9', title: 'dune ', media_type: 'movie', plays: 2, total_seconds: 40 },
      { media_item_id: '8', title: 'Alien', media_type: 'movie', plays: 4, total_seconds: 10 }] };
  const fleet = createFleet({
    listServers: async () => [{ id: 'a', name: 'Primary', isPrimary: true }, { id: 'b', name: 'Stream' }, { id: 'c', name: 'Broken' }],
    createClient: server => ({ getSessions: async () => [],
      getTopActivity: async () => { if (!top[server.id]) throw new Error('down'); return { profiles: top[server.id], titles: titles[server.id] || [] }; } }),
  });
  await fleet.refresh();
  const { profiles: ranked, titles: items } = await fleet.topActivity();
  assert.deepEqual(ranked.map(p => [p.userName, p.plays, p.serverId, p.serverName]),
    [['Jess', 9, 'b', 'Stream'], ['Kasper', 7, 'a', 'Primary'], ['bo', 1, 'b', 'Stream']]);
  assert.deepEqual(items.map(t => [t.name, t.plays, t.watchSeconds, t.servers.map(x => x.serverName)]),
    [['Dune', 5, 100, ['Primary', 'Stream']], ['Alien', 4, 10, ['Stream']]]);
});
