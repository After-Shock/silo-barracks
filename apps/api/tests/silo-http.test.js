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

test('JSON mutations use the requested method and body without exposing credentials', async () => {
  let captured;
  const result = await requestJSON({ base: 'https://silo.invalid', apiMajor: 2, path: 'admin/sessions/session/pause',
    key: 'fixture-secret', method: 'POST', body: { command_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', sequence: 1 },
    timeoutMs: 100, fetchImpl: async (_url, options) => {
      captured = options;
      return new Response('{"accepted":true}', { status: 202, headers: { 'content-type': 'application/json' } });
    } });
  assert.equal(result.status, 202);
  assert.equal(captured.method, 'POST');
  assert.equal(captured.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(captured.body), { command_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', sequence: 1 });
  assert.equal(captured.body.includes('fixture-secret'), false);
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

test('transient Silo errors cover restarts but not Silo-reported failures', async () => {
  const { SiloRequestError, isTransientSiloError } = require('../classes/silo/http');
  const fail = (status, contentType) => requestJSON({ base: 'https://silo.invalid', path: 'catalog', apiMajor: 1,
    key: 'fixture', timeoutMs: 100, fetchImpl: async () => new Response(contentType ? '{"error":"not_found"}' : '404 page not found',
      { status, headers: contentType ? { 'content-type': contentType } : {} }) }).catch(error => error);
  assert.equal(isTransientSiloError(await fail(502)), true);
  assert.equal(isTransientSiloError(await fail(404)), true, 'gateway 404 while Silo is recreated');
  assert.equal(isTransientSiloError(await fail(404, 'application/json')), false, 'Silo says the item is gone');
  assert.equal(isTransientSiloError(await fail(401, 'application/json')), false);
  assert.equal(isTransientSiloError(new SiloRequestError('Unable to connect to Silo')), true);
  assert.equal(isTransientSiloError(new SiloRequestError('Silo request failed (429)', 429)), true);
});

test('retryTransient rides out transient failures and rethrows everything else at once', async () => {
  const { SiloRequestError, retryTransient } = require('../classes/silo/http');
  const sleeps = [];
  const sleep = async ms => { sleeps.push(ms); };
  let calls = 0;
  const value = await retryTransient(async () => {
    if (++calls < 3) throw new SiloRequestError('Silo request failed (502)', 502);
    return 'ok';
  }, { attempts: 5, delayMs: 10, sleep });
  assert.equal(value, 'ok');
  assert.deepEqual(sleeps, [10, 10]);

  calls = 0;
  await assert.rejects(retryTransient(async () => { calls++; throw new SiloRequestError('Invalid Silo URL', 400); },
    { attempts: 5, delayMs: 10, sleep }), /Invalid Silo URL/);
  assert.equal(calls, 1);

  calls = 0;
  await assert.rejects(retryTransient(async () => { calls++; throw new SiloRequestError('Silo request failed (503)', 503); },
    { attempts: 3, delayMs: 10, sleep }), /503/);
  assert.equal(calls, 3);
});
