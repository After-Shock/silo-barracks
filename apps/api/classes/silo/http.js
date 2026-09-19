'use strict';

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

class SiloRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'SiloRequestError';
    if (status !== undefined) this.status = status;
  }
}

function normalizeBase(input, apiMajor = 1) {
  if (![1, 2].includes(apiMajor)) throw new SiloRequestError('Unsupported Silo API version', 400);
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
  let pathname = parsed.pathname.replace(/\/+$/, '').replace(/\/api\/v[12]$/, '');
  pathname += `/api/v${apiMajor}`;
  parsed.pathname = pathname.replace(/\/{2,}/g, '/');
  return parsed.toString().replace(/\/$/, '');
}

const PROBLEM_STATUS = { malformed_request: 400, invalid_cursor: 400, authentication_required: 401,
  invalid_token: 401, session_expired: 401, permission_denied: 403, not_found: 404, request_timeout: 408,
  capability_disabled: 409, capability_not_configured: 409, rate_limited: 429, internal_error: 500,
  capability_unsupported: 501, dependency_unavailable: 503 };

function statusError(status, headers, body) {
  if (status >= 300 && status < 400) return new SiloRequestError('Silo request refused redirect', status);
  if (status >= 200 && status < 300) return null;
  const error = new SiloRequestError(`Silo request failed (${status})`, status);
  error.category = ({ 401: 'authentication_required', 403: 'permission_denied', 404: 'not_found',
    429: 'rate_limited', 503: 'dependency_unavailable' })[status] || 'upstream_error';
  if (body?.status === status && typeof body.type === 'string') {
    const prefix = 'https://siloserver.org/docs/api/v2/problems/';
    const type = body.type.startsWith(prefix) ? body.type.slice(prefix.length) : '';
    if (Object.hasOwn(PROBLEM_STATUS, type) && PROBLEM_STATUS[type] === status) error.category = type;
  }
  if ([429, 503].includes(status)) {
    const value = typeof headers?.get === 'function' ? headers.get('retry-after') : headers?.['retry-after'];
    if (value != null) {
      const delay = /^\d+(\.\d+)?$/.test(String(value)) ? Number(value) * 1000 : Date.parse(value) - Date.now();
      if (Number.isFinite(delay)) error.retryAfterMs = Math.min(60000, Math.max(0, delay));
    }
  }
  return error;
}

async function boundedText(response, maxBytes) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) { await response.body?.cancel(); throw new SiloRequestError('Silo response too large'); }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new SiloRequestError('Silo response too large');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new SiloRequestError('Silo response too large'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { reader.releaseLock(); }
}

async function requestJSON({ path, base, key, timeoutMs = 8000, apiMajor = 1, profileId, fetchImpl, httpClient, userAgent,
  method = 'GET', body }) {
  const url = `${normalizeBase(base, apiMajor)}/${String(path).replace(/^\/+/, '')}`;
  const requestMethod = String(method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(requestMethod)) throw new SiloRequestError('Invalid Silo request method', 400);
  const requestHeaders = { Authorization: `Bearer ${key}`, Accept: 'application/json', 'User-Agent': userAgent };
  let requestBody;
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    try { requestBody = JSON.stringify(body); } catch { throw new SiloRequestError('Invalid Silo request body', 400); }
  }
  if (profileId !== undefined) {
    if (apiMajor !== 2 || typeof profileId !== 'string' || !profileId || profileId.length > 256 || /[\x00-\x20\x7f]/.test(profileId)) {
      throw new SiloRequestError('Invalid Silo profile identity');
    }
    requestHeaders['X-Profile-Id'] = profileId;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let status;
    let headers;
    let body;
    if (httpClient) {
      const config = { method: requestMethod, url, headers: requestHeaders, data: body,
        signal: controller.signal, maxRedirects: 0, timeout: timeoutMs, maxContentLength: MAX_RESPONSE_BYTES, validateStatus: () => true };
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
      const response = await fetchImpl(url, { method: requestMethod, body: requestBody, redirect: 'manual', signal: controller.signal,
        headers: requestHeaders });
      status = response.status;
      headers = response.headers;
      const failure = statusError(status, headers);
      if (failure) {
        if (status >= 400 && String(headers.get('content-type')).includes('application/problem+json')) {
          try { body = JSON.parse(await boundedText(response, 64 * 1024)); } catch { /* Preserve status even for malformed problems. */ }
        } else await response.body?.cancel();
        throw statusError(status, headers, body);
      }
      const text = await boundedText(response, MAX_RESPONSE_BYTES);
      try { body = text ? JSON.parse(text) : null; } catch { throw new SiloRequestError('Invalid Silo response'); }
    }
    const failure = statusError(status, headers, body);
    if (failure) throw failure;
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
