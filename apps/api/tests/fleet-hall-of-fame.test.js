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

test('home playback starts, viewers and peak hours add up every connected server', async () => {
  const hours = counts => Array.from({ length: 24 }, (_, hour) => ({ hour, count: counts[hour] || 0 }));
  const dashboards = {
    a: { source: 'silo-native', history: { timeZone: 'America/New_York' }, catalog: { movies: 3 },
      totals: { totalPlaybacks: 8, finalizedPlaybacks: 8, completedPlaybacks: 6, completionRate: 0.75, totalWatchSeconds: null, uniqueViewers: 1 },
      peakHours: hours({ 21: 5 }) },
    b: { source: 'silo-native', history: { timeZone: 'America/New_York' },
      totals: { totalPlaybacks: 52, finalizedPlaybacks: 50, completedPlaybacks: 44, completionRate: 0.88, totalWatchSeconds: null, uniqueViewers: 3 },
      peakHours: hours({ 21: 10, 9: 2 }) },
  };
  const asked = {};
  const fleet = createFleet({
    listServers: async () => [{ id: 'a', name: 'Primary', isPrimary: true }, { id: 'b', name: 'Stream' }, { id: 'c', name: 'Broken' }],
    createClient: server => ({ getSessions: async () => [],
      getHomeDashboard: async options => { asked[server.id] = options; if (!dashboards[server.id]) throw new Error('down'); return dashboards[server.id]; } }),
  });
  await fleet.refresh();
  const home = await fleet.homeActivity({ timeZone: 'America/New_York', excludedUsers: ['7'] });
  assert.equal(home.servers, 2);
  assert.equal(home.primary.catalog.movies, 3);
  assert.deepEqual(home.totals, { totalPlaybacks: 60, finalizedPlaybacks: 58, completedPlaybacks: 50,
    completionRate: 50 / 58, totalWatchSeconds: null, uniqueViewers: 4 });
  assert.equal(home.peakHours[21].count, 15);
  assert.equal(home.peakHours[9].count, 2);
  // Excluded users are primary-server user IDs; another server's IDs are unrelated people.
  assert.deepEqual(asked.a, { timeZone: 'America/New_York', excludedUsers: ['7'] });
  assert.deepEqual(asked.b, { timeZone: 'America/New_York', excludedUsers: [] });
});
