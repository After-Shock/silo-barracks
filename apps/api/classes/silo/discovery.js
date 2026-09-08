'use strict';

const { SiloRequestError } = require('./http');

function validInfo(info) {
  return info && info.api_major === 2 && typeof info.server_version === 'string'
    && /^[a-f0-9]{64}$/i.test(info.contract_digest) && typeof info.links?.openapi === 'string'
    && typeof info.links?.capabilities === 'string';
}

// Discovery proves the version independently of the retained operational probe.
// Do not follow server-supplied links or turn authentication failures into v1.
async function discoverSilo({ request }) {
  let info;
  try { info = await request('system/info', { apiMajor: 2 }); }
  catch (error) { if (error.status !== 404) throw error; }
  if (info !== undefined && !validInfo(info)) throw new SiloRequestError('Invalid Silo discovery response');
  const health = await request('health', { apiMajor: 1 });
  if (health?.status !== 'ok' || typeof health.server_id !== 'string' || !health.server_id) {
    throw new SiloRequestError('Silo server identity is unavailable');
  }
  if (info === undefined) {
    const sessions = await request('admin/sessions', { apiMajor: 1 });
    if (!Array.isArray(sessions)) throw new SiloRequestError('Invalid Silo session response');
  }
  return { apiMajor: info ? 2 : 1, serverId: health.server_id, serverName: health.server_name || 'Silo',
    serverVersion: info?.server_version || 'Silo', contractDigest: info?.contract_digest || null,
    capabilities: {}, checkedAt: Date.now() };
}

module.exports = { discoverSilo, validInfo };
