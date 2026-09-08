'use strict';

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

class SiloRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'SiloRequestError';
    if (status !== undefined) this.status = status;
  }
}

function normalizeBase(input) {
  let raw = String(input || '').trim();
  if (raw && !/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new SiloRequestError('Invalid Silo URL', 400);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new SiloRequestError('Invalid Silo URL', 400);
  }
  parsed.search = '';
  parsed.hash = '';
  let pathname = parsed.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/api/v1')) pathname += '/api/v1';
  parsed.pathname = pathname.replace(/\/{2,}/g, '/');
  return parsed.toString().replace(/\/$/, '');
}

async function requestJSON({ path, base, key, timeoutMs, fetchImpl, httpClient, userAgent }) {
  const url = `${normalizeBase(base)}/${String(path).replace(/^\/+/, '')}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let status;
    let headers;
    let body;
    if (httpClient) {
      const config = { method: 'GET', url, headers: { Authorization: `Bearer ${key}`, 'User-Agent': userAgent },
        signal: controller.signal, maxRedirects: 0, timeout: timeoutMs, validateStatus: () => true };
      let response;
      if (typeof httpClient === 'function') response = await httpClient(config);
      else if (typeof httpClient.request === 'function') response = await httpClient.request(config);
      else if (typeof httpClient.get === 'function') response = await httpClient.get(url, config);
      else throw new SiloRequestError('Silo HTTP client unavailable');
      status = response.status;
      headers = response.headers || {};
      body = response.data;
    } else {
      if (typeof fetchImpl !== 'function') throw new SiloRequestError('Silo HTTP client unavailable');
      const response = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'User-Agent': userAgent } });
      status = response.status;
      headers = response.headers;
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new SiloRequestError('Silo response too large');
      const text = await response.text();
      if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new SiloRequestError('Silo response too large');
      try { body = text ? JSON.parse(text) : null; } catch { throw new SiloRequestError('Invalid Silo response'); }
    }
    if (status >= 300 && status < 400) throw new SiloRequestError('Silo request refused redirect', status);
    if (status < 200 || status >= 300) throw new SiloRequestError(`Silo request failed (${status})`, status);
    return { status, headers, data: body };
  } catch (error) {
    if (error instanceof SiloRequestError) throw error;
    if (error?.name === 'AbortError' || error?.code === 'ECONNABORTED') throw new SiloRequestError('Silo request timed out');
    throw new SiloRequestError('Unable to connect to Silo');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { SiloRequestError, normalizeBase, requestJSON };
