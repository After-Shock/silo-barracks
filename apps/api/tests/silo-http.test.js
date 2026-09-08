const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBase, requestJSON } = require('../classes/silo/http');

test('API prefix construction preserves deployment subpaths and replaces existing versions', () => {
  for (const suffix of ['', '/', '/api/v1/', '/api/v2']) {
    assert.equal(normalizeBase(`https://silo.invalid/proxy${suffix}`, 2), 'https://silo.invalid/proxy/api/v2');
    assert.equal(normalizeBase(`https://silo.invalid/proxy${suffix}`, 1), 'https://silo.invalid/proxy/api/v1');
  }
  assert.throws(() => normalizeBase('https://name:secret@silo.invalid', 2));
  assert.throws(() => normalizeBase('https://silo.invalid', 3));
});

test('non-JSON missing endpoints and redirects preserve HTTP status without exposing upstream text', async () => {
  for (const status of [404, 401, 503, 302]) {
    await assert.rejects(requestJSON({ base: 'https://silo.invalid', path: 'system/info', apiMajor: 2,
      key: 'fixture', timeoutMs: 100, fetchImpl: async () => new Response('private upstream detail', { status }),
    }), error => error.status === status && !error.message.includes('private'));
  }
});

test('rate limit errors preserve bounded retry delay and safe category', async () => {
  await assert.rejects(requestJSON({ base: 'https://silo.invalid', path: 'admin/sessions', key: 'fixture', timeoutMs: 100,
    fetchImpl: async () => new Response(JSON.stringify({ type: 'https://silo.invalid/problems/rate-limited', detail: 'private' }),
      { status: 429, headers: { 'retry-after': '999', 'content-type': 'application/problem+json' } }),
  }), error => error.status === 429 && error.retryAfterMs === 60000 && !error.message.includes('private'));
});

test('explicit API major selects v2 without duplicating prefixes', async () => {
  let requested;
  await requestJSON({ base: 'https://silo.invalid/proxy/api/v1', apiMajor: 2, path: 'admin/sessions', key: 'fixture', timeoutMs: 100,
    fetchImpl: async url => { requested = url; return new Response('{"items":[]}'); } });
  assert.equal(requested, 'https://silo.invalid/proxy/api/v2/admin/sessions');
});

test('Problem Details map only known matching types and never retain private fields', async () => {
  for (const native of [true, false]) {
    const body = { type: 'https://siloserver.org/docs/api/v2/problems/invalid_cursor', status: 400,
      detail: 'secret upstream URL and token', title: 'private', instance: 'private' };
    await assert.rejects(requestJSON({ base: 'https://silo.invalid', path: 'catalog', key: 'fixture', timeoutMs: 100,
      ...(native ? { fetchImpl: async () => new Response(JSON.stringify(body), { status: 400, headers: { 'content-type': 'application/problem+json' } }) }
        : { httpClient: async () => ({ status: 400, data: body }) }) }),
    error => error.category === 'invalid_cursor' && !JSON.stringify(error).includes('private') && !error.message.includes('secret'));
  }
});
