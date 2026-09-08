const test = require('node:test');
const assert = require('node:assert/strict');
const { discoverSilo } = require('../classes/silo/discovery');
const { SiloRequestError } = require('../classes/silo/http');

const info = { api_major: 2, server_version: 'fixture-v2', contract_digest: 'a'.repeat(64),
  links: { openapi: '/api/v2/openapi.json', capabilities: '/api/v2/capabilities' } };
const health = { status: 'ok', server_id: 'physical-installation', server_name: 'Fixture' };
function requester(routes) {
  const calls = [];
  const request = async (path, options) => {
    const route = `${options.apiMajor}:${path}`; calls.push(route);
    const result = routes[route];
    if (result instanceof Error) throw result;
    if (result === undefined) throw new SiloRequestError('Silo request failed (404)', 404);
    return result;
  };
  return { request, calls };
}
test('discovery obtains physical identity from retained health, not build or contract digest', async () => {
  const r = requester({ '2:system/info': info, '1:health': health });
  const result = await discoverSilo({ request: r.request });
  assert.equal(result.apiMajor, 2); assert.equal(result.serverId, health.server_id);
  assert.equal(result.contractDigest, info.contract_digest);
});
test('legacy discovery requires missing v2 route and valid health plus protected sessions', async () => {
  const r = requester({ '1:health': health, '1:admin/sessions': [] });
  const result = await discoverSilo({ request: r.request });
  assert.equal(result.apiMajor, 1);
  assert.deepEqual(r.calls, ['2:system/info', '1:health', '1:admin/sessions']);
});
test('discovery refuses downgrade on denied access, unavailable service, malformed info, or missing identity', async () => {
  for (const bad of [new SiloRequestError('denied', 401), new SiloRequestError('denied', 403),
    new SiloRequestError('down', 503), {}, [], { ...info, api_major: 3 }]) {
    const r = requester({ '2:system/info': bad, '1:health': health, '1:admin/sessions': [] });
    await assert.rejects(discoverSilo({ request: r.request }));
    assert.ok(!r.calls.includes('1:admin/sessions'));
  }
  const r = requester({ '2:system/info': info, '1:health': { status: 'ok' } });
  await assert.rejects(discoverSilo({ request: r.request }), /identity/i);
});
