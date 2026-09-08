import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Load the browser module with only its transport dependencies substituted.
async function loadCache(get) {
  const source = (await readFile(new URL('./session-cache.js', import.meta.url), 'utf8'))
    .replace('import axios from "./axios_instance";', 'const axios = globalThis.__sessionTestAxios;')
    .replace('import baseUrl from "./baseurl";', 'const baseUrl = "";');
  globalThis.__sessionTestAxios = { get };
  return import(`data:text/javascript;base64,${Buffer.from(source + `\n// ${Math.random()}`).toString('base64')}`);
}

test('partial stream metadata cannot break an otherwise valid activity snapshot', async () => {
  const cache = await loadCache();
  const rows = cache.normalizeSessions([{ Id: 's', MediaServerProvider: 'silo',
    NowPlayingItem: { Type: 'Movie', Container: null, MediaStreams: [{ Type: 'Video' }] },
    PlayState: { SubtitleStreamIndex: 4 }, TranscodingInfo: {} }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].NowPlayingItem.SubtitleStream, '');
});

test('concurrent activity consumers share one request and publish before optional status completes', async () => {
  let calls = 0;
  let resolveSessions;
  const cache = await loadCache(url => {
    if (url === '/proxy/sessionStatus') return new Promise(() => {});
    calls++;
    return new Promise(resolve => { resolveSessions = resolve; });
  });
  const first = cache.fetchActiveSessions('test');
  const second = cache.fetchActiveSessions('test');
  assert.equal(calls, 1);
  resolveSessions({ data: [] });
  const result = await Promise.race([first, new Promise(resolve => setTimeout(() => resolve('blocked'), 100))]);
  assert.deepEqual(result, []);
  await second;
});

test('a failed older REST request cannot overwrite a newer successful socket update', async () => {
  let rejectRequest;
  const cache = await loadCache(() => new Promise((resolve, reject) => { rejectRequest = reject; }));
  const request = cache.fetchActiveSessions('test');
  cache.cacheSessionStatus({ state: 'connected', lastSuccessAt: '2026-09-06T15:00:00Z' });
  rejectRequest(new Error('timeout'));
  await assert.rejects(request);
  assert.equal(cache.getSessionStatus().state, 'connected');
});
