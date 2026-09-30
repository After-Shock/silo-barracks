const test = require('node:test');
const assert = require('node:assert/strict');
const { createFleet } = require('../classes/silo-fleet');

test('hall of fame merges every connected server, labelled and ranked', async () => {
  const top = { a: [{ user_id: 'u1', profile_id: 'p1', profile_name: 'Kasper', plays: 7 }],
    b: [{ user_id: 'u1', profile_id: 'p1', profile_name: 'Jess', plays: 9 }], c: null };
  const fleet = createFleet({
    listServers: async () => [{ id: 'a', name: 'Primary', isPrimary: true }, { id: 'b', name: 'Stream' }, { id: 'c', name: 'Broken' }],
    createClient: server => ({ getSessions: async () => [],
      getTopActivity: async () => { if (!top[server.id]) throw new Error('down'); return { profiles: top[server.id] }; } }),
  });
  await fleet.refresh();
  const ranked = await fleet.hallOfFame();
  assert.deepEqual(ranked.map(p => [p.userName, p.plays, p.serverId, p.serverName]),
    [['Jess', 9, 'b', 'Stream'], ['Kasper', 7, 'a', 'Primary']]);
});
