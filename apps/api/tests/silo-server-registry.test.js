const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistry, encryptKey, decryptKey, RegistryError } = require('../classes/silo-server-registry');

test('stored keys are authenticated ciphertext and cannot be decrypted with another secret', () => {
  const encrypted = encryptKey('sa_private', 'installation-secret');
  assert.ok(!encrypted.includes('sa_private'));
  assert.equal(decryptKey(encrypted, 'installation-secret'), 'sa_private');
  assert.throws(() => decryptKey(encrypted, 'wrong-secret'));
  assert.notEqual(encrypted, encryptKey('sa_private', 'installation-secret'));
});

function fixture() {
  const queries = [];
  let saved;
  const pool = { query: async (sql, values = []) => {
    queries.push({ sql, values });
    if (sql.startsWith('INSERT')) { saved = { id: values[0], name: values[1], url: values[2],
      api_key_encrypted: values[3], upstream_id: values[4], enabled: values[5] }; return { rows: [saved] }; }
    if (sql.startsWith('SELECT')) return { rows: saved ? [saved] : [] };
    if (sql.startsWith('UPDATE')) {
      saved = { ...saved, name: values[1], url: values[2], api_key_encrypted: values[3], upstream_id: values[4], enabled: values[5] };
      return { rows: [saved], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  } };
  return { queries, registry: createRegistry({ pool, secret: 'installation-secret',
    getConfig: async () => ({ state: 2, SILO_URL: 'https://primary.test', SILO_API_KEY: 'sa_primary' }),
    validate: async (url, key) => ({ id: url.includes('primary') ? 'upstream-primary' : 'upstream-extra', name: 'Silo' }),
  }), getSaved: () => saved };
}

test('management lists never return API keys; collection receives decrypted keys', async () => {
  const { registry, queries } = fixture();
  await registry.add({ name: 'Basement', url: 'https://extra.test/', apiKey: 'sa_private' });
  assert.ok(!JSON.stringify(await registry.listPublic()).includes('sa_private'));
  assert.ok(!JSON.stringify(await registry.listPublic()).includes('api_key_encrypted'));
  assert.equal((await registry.listInternal())[1].apiKey, 'sa_private');
  const insert = queries.find(query => query.sql.startsWith('INSERT'));
  assert.ok(!insert.sql.includes('sa_private'));
  assert.ok(!insert.values.includes('sa_private'));
});

test('rejects primary duplicates, invalid input, and primary deletion', async () => {
  const { registry } = fixture();
  await assert.rejects(registry.add({ name: 'Duplicate', url: 'https://primary.test/api/v1', apiKey: 'sa_test' }), /already/);
  await assert.rejects(registry.add({ name: '', url: 'https://extra.test', apiKey: 'sa_test' }), /name/i);
  await assert.rejects(registry.add({ name: 'Extra', url: 'file:///secret', apiKey: 'sa_test' }), /URL/);
  await assert.rejects(registry.remove('primary'), /primary/i);
});

test('duplicate upstream identity explains how to repair a separately cloned Silo', async () => {
  const { registry } = fixture();
  await registry.add({ name: 'Extra', url: 'https://extra.test', apiKey: 'sa_test' });
  await assert.rejects(registry.add({ name: 'Alias', url: 'https://alias.test', apiKey: 'sa_test' }),
    error => error.status === 409 && /same server identity/i.test(error.message)
      && /Compatibility Proxies/i.test(error.message) && /restart Silo/i.test(error.message));
});

test('primary identity collision gives the cloned-instance repair instead of calling it the primary URL', async () => {
  const { registry } = fixture();
  await assert.rejects(registry.add({ name: 'Primary clone', url: 'https://primary-clone.test', apiKey: 'sa_test' }),
    error => error.status === 409 && /same server identity as the primary/i.test(error.message)
      && /unique Server ID/i.test(error.message));
});

test('requires plain object input and a string server name', async () => {
  const { registry } = fixture();
  await assert.rejects(registry.add(null), error => error instanceof RegistryError);
  await assert.rejects(registry.add([]), error => error instanceof RegistryError);
  await assert.rejects(registry.add({ name: 123, url: 'https://extra.test', apiKey: 'sa_test' }), /name/i);
});

test('allows renaming and disabling an unreadable credential while preserving ciphertext', async () => {
  const { registry, getSaved } = fixture();
  await registry.add({ name: 'Offline', url: 'https://offline.test', apiKey: 'sa_private' });
  const unreadable = 'v1.corrupted-ciphertext';
  getSaved().api_key_encrypted = unreadable;

  const renamed = await registry.update(getSaved().id, { name: 'Renamed offline', enabled: false });
  assert.equal(renamed.name, 'Renamed offline');
  assert.equal(renamed.enabled, false);
  assert.equal(getSaved().api_key_encrypted, unreadable);
  await assert.rejects(registry.update(getSaved().id, { enabled: true }), /administrator API key/i);
});

test('enforces the twenty-server limit across concurrent registry instances', {
  skip: !process.env.SILO_TEST_DATABASE_URL && 'Set SILO_TEST_DATABASE_URL to an isolated test database',
}, async () => {
  const { Pool } = require('pg');
  const rawA = new Pool({ connectionString: process.env.SILO_TEST_DATABASE_URL, max: 12 });
  const rawB = new Pool({ connectionString: process.env.SILO_TEST_DATABASE_URL, max: 12 });
  const schema = `barracks_registry_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const scoped = raw => ({
    query: async (...args) => {
      const client = await raw.connect();
      try {
        await client.query(`SET search_path TO "${schema}"`);
        return await client.query(...args);
      } finally { client.release(); }
    },
    connect: async () => {
      const client = await raw.connect();
      await client.query(`SET search_path TO "${schema}"`);
      return client;
    },
  });
  const makeRegistry = pool => createRegistry({ pool: scoped(pool), secret: 'integration-secret',
    getConfig: async () => ({ state: 1 }),
    validate: async url => ({ id: url, name: 'Silo' }),
  });
  const setup = await rawA.connect();
  try {
    await setup.query(`CREATE SCHEMA "${schema}"`);
    await setup.query(`SET search_path TO "${schema}"`);
    await setup.query(`CREATE TABLE silo_servers (
      id text PRIMARY KEY,
      name varchar(80) NOT NULL,
      url text NOT NULL UNIQUE,
      api_key_encrypted text NOT NULL,
      upstream_id text NOT NULL UNIQUE,
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  } finally { setup.release(); }
  try {
    const first = makeRegistry(rawA);
    const second = makeRegistry(rawB);
    const attempts = Array.from({ length: 21 }, (_value, index) => (index % 2 ? second : first)
      .add({ name: `Server ${index}`, url: `https://server-${index}.test`, apiKey: `sa_${index}` }));
    const results = await Promise.allSettled(attempts);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 20);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    const count = await rawA.query(`SELECT count(*)::int AS count FROM "${schema}".silo_servers`);
    assert.equal(count.rows[0].count, 20);
  } finally {
    await rawA.query(`DROP SCHEMA "${schema}" CASCADE`);
    await Promise.all([rawA.end(), rawB.end()]);
  }
});

test('persists a blank-key offline edit without replacing an unreadable ciphertext', {
  skip: !process.env.SILO_TEST_DATABASE_URL && 'Set SILO_TEST_DATABASE_URL to an isolated test database',
}, async () => {
  const { Pool } = require('pg');
  const raw = new Pool({ connectionString: process.env.SILO_TEST_DATABASE_URL, max: 4 });
  const schema = `barracks_registry_edit_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const pool = {
    query: async (...args) => {
      const client = await raw.connect();
      try {
        await client.query(`SET search_path TO "${schema}"`);
        return await client.query(...args);
      } finally { client.release(); }
    },
    connect: async () => {
      const client = await raw.connect();
      await client.query(`SET search_path TO "${schema}"`);
      return client;
    },
  };
  const setup = await raw.connect();
  try {
    await setup.query(`CREATE SCHEMA "${schema}"`);
    await setup.query(`SET search_path TO "${schema}"`);
    await setup.query(`CREATE TABLE silo_servers (
      id text PRIMARY KEY,
      name varchar(80) NOT NULL,
      url text NOT NULL UNIQUE,
      api_key_encrypted text NOT NULL,
      upstream_id text NOT NULL UNIQUE,
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  } finally { setup.release(); }
  try {
    const registry = createRegistry({ pool, secret: 'integration-secret',
      getConfig: async () => ({ state: 1 }),
      validate: async url => ({ id: url, name: 'Silo' }),
    });
    const created = await registry.add({ name: 'Offline', url: 'https://offline.test', apiKey: 'sa_private' });
    await raw.query(`UPDATE "${schema}".silo_servers SET api_key_encrypted = 'v1.invalid' WHERE id = $1`, [created.id]);
    const renamed = await registry.update(created.id, { name: 'Renamed offline', enabled: false });
    assert.equal(renamed.enabled, false);
    const row = await raw.query(`SELECT name, enabled, api_key_encrypted FROM "${schema}".silo_servers WHERE id = $1`, [created.id]);
    assert.deepEqual(row.rows[0], { name: 'Renamed offline', enabled: false, api_key_encrypted: 'v1.invalid' });
    await assert.rejects(registry.update(created.id, { enabled: true }), /administrator API key/i);
  } finally {
    await raw.query(`DROP SCHEMA "${schema}" CASCADE`);
    await raw.end();
  }
});
