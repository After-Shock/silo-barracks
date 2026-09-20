let instance;

function getFleetService() {
  if (instance) return instance;
  const db = require('../db');
  const Config = require('./config');
  const SiloAPI = require('./silo-api');
  const primaryAPI = require('./api-loader');
  const { createRegistry } = require('./silo-server-registry');
  const { createFleet } = require('./silo-fleet');
  const { createIdentityGuard } = require('./fleet-identity');
  const { requestJSON } = require('./silo/http');
  const identity = createIdentityGuard({ identify: async server => {
    const { data } = await requestJSON({ path: 'health', base: server.url, key: server.apiKey,
      timeoutMs: 3000, fetchImpl: globalThis.fetch, userAgent: 'Silo-Barracks' });
    if (data?.status !== 'ok' || !data.server_id) throw new Error('Silo identity unavailable');
    return { id: String(data.server_id) };
  } });
  const registry = createRegistry({ pool: db.pool, getConfig: () => new Config().getConfig(),
    savePrimaryName: async name => {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query('SELECT settings FROM app_config WHERE "ID"=1 FOR UPDATE');
        const settings = { ...(result.rows[0]?.settings || {}), SiloPrimaryServerName: name };
        await client.query('UPDATE app_config SET settings=$1 WHERE "ID"=1', [settings]);
        await client.query('COMMIT');
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
      } finally { client.release(); }
    },
  });
  const fleet = createFleet({
    listServers: async () => identity.resolve(await registry.listInternal()),
    createClient: server => {
      if (!server.apiKey) throw new Error('Silo credential or identity unavailable');
      return server.isPrimary ? primaryAPI : new SiloAPI({
      getConfig: async () => ({ state: 2, SILO_URL: server.url, SILO_API_KEY: server.apiKey }),
      });
    },
    // Fleet activity is served only by the permission-checked REST route.
    // The legacy broadcast channel does not enforce dashboard permissions.
  });
  instance = { registry, fleet };
  return instance;
}

function startFleet() {
  const { fleet } = getFleetService();
  const refresh = () => { void fleet.refresh().catch(() => {}); };
  refresh();
  const timer = setInterval(refresh, 5000);
  return () => clearInterval(timer);
}
module.exports = { getFleetService, startFleet };
