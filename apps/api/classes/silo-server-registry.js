const { createHash, randomBytes, randomUUID, createCipheriv, createDecipheriv } = require('node:crypto');
const { normalizeBase } = require('./silo/http');

class RegistryError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function installationKey(secret) {
  if (!secret) throw new Error('Installation secret is unavailable');
  return createHash('sha256').update(secret).digest();
}
function encryptKey(value, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', installationKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
function decryptKey(value, secret) {
  const [version, iv, tag, encrypted] = String(value).split('.');
  if (version !== 'v1') throw new Error('Unsupported stored credential');
  const decipher = createDecipheriv('aes-256-gcm', installationKey(secret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

async function validateConnection(url, key) {
  try {
    const SiloAPI = require('./silo-api');
    const api = new SiloAPI({ getConfig: async () => ({ state: 2, SILO_URL: url, SILO_API_KEY: key }), timeoutMs: 5000 });
    const { identity, sessions } = await api.probeConnection();
    if (!identity?.Id || !Array.isArray(sessions)) {
      throw new RegistryError('The server did not return valid Silo health and activity data.');
    }
    return { id: identity.Id, name: identity.ServerName };
  } catch (error) {
    if (error instanceof RegistryError) throw error;
    throw new RegistryError([401, 403].includes(error.status)
      ? 'Silo rejected the administrator API key.' : 'Could not connect to Silo. Check the URL, API key, and server availability.');
  }
}

function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function connectionInput(input, previous = {}, { allowMissingApiKey = false } = {}) {
  if (!isPlainObject(input)) throw new RegistryError('Server settings must be an object.');
  const rawName = input.name === undefined ? previous.name : input.name;
  if (typeof rawName !== 'string') throw new RegistryError('Server name must be a string.');
  const name = rawName.trim();
  if (!name || name.length > 80) throw new RegistryError('Server name must contain 1–80 characters.');
  const rawUrl = input.url ?? previous.url;
  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) throw new RegistryError('Invalid Silo URL.');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl.trim()) && !/^https?:\/\//i.test(rawUrl.trim())) {
    throw new RegistryError('Invalid Silo URL.');
  }
  let url;
  try { url = normalizeBase(rawUrl); } catch { throw new RegistryError('Invalid Silo URL.'); }
  if (input.apiKey !== undefined && typeof input.apiKey !== 'string') {
    throw new RegistryError('An administrator API key is required.');
  }
  const apiKey = typeof input.apiKey === 'string' && input.apiKey.trim() ? input.apiKey.trim() : previous.apiKey;
  if (!apiKey && !allowMissingApiKey) throw new RegistryError('An administrator API key is required.');
  if (apiKey && apiKey.length > 4096) throw new RegistryError('An administrator API key is required.');
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new RegistryError('Enabled must be true or false.');
  return { name, url, apiKey, enabled: input.enabled ?? previous.enabled ?? true };
}

function createRegistry({ pool, getConfig, secret = process.env.JWT_SECRET, validate = validateConnection }) {
  let mutation = Promise.resolve();
  const serial = operation => {
    const next = mutation.then(operation);
    mutation = next.catch(() => {});
    return next;
  };
  const rows = async (executor = pool) => (await executor.query('SELECT * FROM silo_servers ORDER BY created_at, id')).rows;
  async function primary() {
    const config = await getConfig();
    const url = config.SILO_URL || config.JF_HOST;
    const apiKey = config.SILO_API_KEY || config.JF_API_KEY;
    if (!url || !apiKey || config.state !== 2) return null;
    const normalized = normalizeBase(url);
    return { id: 'primary', name: new URL(normalized).hostname, url: normalized, apiKey,
      isPrimary: true, enabled: true };
  }
  function internal(row) {
    let apiKey = null;
    try { apiKey = decryptKey(row.api_key_encrypted, secret); } catch { /* This server alone will report unavailable. */ }
    return { id: row.id, name: row.name, url: row.url, apiKey, upstreamId: row.upstream_id,
      enabled: row.enabled, isPrimary: false };
  }
  async function listInternal() {
    const [first, extra] = await Promise.all([primary(), rows()]);
    return [...(first ? [first] : []), ...extra.map(internal)];
  }
  const publicServer = server => ({ id: server.id, name: server.name, url: server.url,
    enabled: server.enabled, isPrimary: server.isPrimary, hasApiKey: Boolean(server.apiKey) });
  async function assertUnique(candidate, exceptId) {
    const all = await listInternal();
    if (all.some(server => server.id !== exceptId && server.url === candidate.url)) {
      throw new RegistryError('This Silo server is already configured.', 409);
    }
    const info = await validate(candidate.url, candidate.apiKey);
    if (all.some(server => server.id !== exceptId && server.upstreamId === info.id)) {
      throw new RegistryError('This address reports the same server identity as an existing Silo connection. If this is a separate cloned instance, assign it a unique Server ID in Silo Admin Settings → Compatibility Proxies and restart Silo before adding it.', 409);
    }
    const first = all.find(server => server.isPrimary);
    if (first) {
      // Fail closed when the primary cannot be identified: aliases must not
      // inflate the combined stream count by adding the same physical server.
      const primaryInfo = await validate(first.url, first.apiKey);
      if (info.id === primaryInfo.id) throw new RegistryError('This address reports the same server identity as the primary Silo connection. If this is a separate cloned instance, assign it a unique Server ID in Silo Admin Settings → Compatibility Proxies and restart Silo before adding it.', 409);
    }
    return info;
  }
  const requireExtra = id => { if (id === 'primary') throw new RegistryError('Manage the primary connection in Media Server settings.'); };
  const persistenceError = error => {
    if (error.code === '23505') throw new RegistryError('This Silo server is already configured.', 409);
    throw error;
  };
  async function transaction(operation) {
    if (typeof pool.connect !== 'function') return operation(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('silo_servers:max_add'))");
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve the original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }
  return {
    listInternal,
    listPublic: async () => (await listInternal()).map(publicServer),
    add: input => serial(async () => {
      const candidate = connectionInput(input);
      const info = await assertUnique(candidate);
      const id = await transaction(async executor => {
        if ((await rows(executor)).length >= 20) throw new RegistryError('A maximum of 20 additional servers is supported.');
        const createdId = randomUUID();
        try {
          await executor.query('INSERT INTO silo_servers (id, name, url, api_key_encrypted, upstream_id, enabled) VALUES ($1,$2,$3,$4,$5,$6)',
            [createdId, candidate.name, candidate.url, encryptKey(candidate.apiKey, secret), info.id, candidate.enabled]);
        } catch (error) { persistenceError(error); }
        return createdId;
      });
      return publicServer({ ...candidate, id, isPrimary: false });
    }),
    update: (id, input) => serial(async () => {
      requireExtra(id);
      const old = (await rows()).find(row => String(row.id) === String(id));
      if (!old) throw new RegistryError('Server not found.', 404);
      // Permit disabling or renaming an offline connection without a new probe.
      const oldApiKey = internal(old).apiKey;
      const candidate = connectionInput(input, { ...old, apiKey: oldApiKey }, { allowMissingApiKey: true });
      const suppliedApiKey = typeof input.apiKey === 'string' && input.apiKey.trim() !== '';
      const changedConnection = candidate.url !== old.url || suppliedApiKey;
      const reenabled = old.enabled === false && candidate.enabled === true;
      if ((changedConnection || reenabled) && !candidate.apiKey) {
        throw new RegistryError('An administrator API key is required.');
      }
      const info = changedConnection ? await assertUnique(candidate, id) : { id: old.upstream_id };
      const encryptedKey = changedConnection ? encryptKey(candidate.apiKey, secret) : old.api_key_encrypted;
      try {
        await pool.query('UPDATE silo_servers SET name=$2, url=$3, api_key_encrypted=$4, upstream_id=$5, enabled=$6 WHERE id=$1',
          [id, candidate.name, candidate.url, encryptedKey, info.id, candidate.enabled]);
      } catch (error) { persistenceError(error); }
      return publicServer({ ...candidate, id, isPrimary: false });
    }),
    remove: id => serial(async () => {
      requireExtra(id);
      const result = await pool.query('DELETE FROM silo_servers WHERE id=$1', [id]);
      if (!result.rowCount) throw new RegistryError('Server not found.', 404);
    }),
  };
}

module.exports = { createRegistry, RegistryError, encryptKey, decryptKey, validateConnection };
