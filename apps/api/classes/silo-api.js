'use strict';

const {
  isEpisodeSession, sessionToJellyfin, userToJellyfin, libraryToJellyfin, itemToJellyfin,
  seasonToJellyfin, episodeToJellyfin, versionToMediaSource, forEachLimited,
} = require('./silo/mappers');
const { SiloRequestError, normalizeBase, requestJSON } = require('./silo/http');
const { discoverSilo } = require('./silo/discovery');
const createV1 = require('./silo/v1');
const createV2 = require('./silo/v2');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { sessionCapabilities, supportedSession } = require('./silo/capabilities');

const DEFAULT_TIMEOUT_MS = 8000;
const DETAIL_CACHE_TTL_MS = 60 * 1000;
const DETAIL_CACHE_MAX = 256;
const SESSION_ENRICH_LIMIT = 8;

class SiloAPI {
  constructor(options = {}) {
    this.isSilo = true;
    this.version = 'Silo';
    this.userAgent = `Silo-Barracks/${require('../package.json').version}`;
    this.timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    this.sessionBudgetMs = Number.isFinite(options.sessionBudgetMs) && options.sessionBudgetMs > 0
      ? Math.min(options.sessionBudgetMs, 11500) : 11500;
    this.enrichmentTimeoutMs = Math.min(this.timeoutMs, options.enrichmentTimeoutMs || 1500);
    this.fetch = options.fetch || globalThis.fetch;
    this.httpClient = options.httpClient;
    this.apiMajor = options.apiMajor;
    this.maxPages = options.maxPages || 100;
    this.minRequestIntervalMs = Number.isFinite(options.minRequestIntervalMs) ? Math.max(0, options.minRequestIntervalMs)
      : Math.max(0, Number.parseInt(process.env.SILO_MIN_REQUEST_INTERVAL_MS || '0', 10) || 0);
    this.maxRetryAfterMs = Number.isFinite(options.maxRetryAfterMs) ? Math.max(0, options.maxRetryAfterMs)
      : Math.max(0, Number.parseInt(process.env.SILO_MAX_RETRY_AFTER_MS || '60000', 10) || 60000);
    this.defaultRateLimitRetryMs = Number.isFinite(options.defaultRateLimitRetryMs) ? Math.max(0, options.defaultRateLimitRetryMs)
      : Math.max(0, Number.parseInt(process.env.SILO_DEFAULT_RATE_LIMIT_RETRY_MS || '5000', 10) || 5000);
    this.maxRateLimitRetries = Number.isFinite(options.maxRateLimitRetries) ? Math.max(0, options.maxRateLimitRetries)
      : Math.max(0, Number.parseInt(process.env.SILO_MAX_RATE_LIMIT_RETRIES || '3', 10) || 3);
    this.nextRequestAt = 0;
    this.requestQueue = Promise.resolve();
    this.getConfig = options.getConfig || (async () => {
      const Config = require('./config');
      return new Config().getConfig();
    });
    this.detailCache = new Map();
    this.detailFailureCache = new Map();
    this.seasonCache = new Map();
    this.userImageCache = new Map();
    this.libraryMetadataCache = null;
    this.libraryPosterCache = new Map();
    this.libraryPosterStore = null;
    this.libraryPosterRefreshes = new Map();
    this.libraryStorageStore = null;
    this.libraryStorageRefreshes = new Map();
    this.libraryStorageQueue = Promise.resolve();
    this.serverInfoCache = null;
    this.wirePromise = null;
    this.connectionInfo = null;
    this.backoffUntil = 0;
    this.capabilityCache = null;
    this.commandSequences = new Map();
    this.itemLibraryCache = new Map();
    this.libraryHistoryContinuations = new Map();
  }

  _clearUpstreamCaches() {
    this.detailCache.clear();
    this.detailFailureCache.clear();
    this.seasonCache.clear();
    this.userImageCache.clear();
    this.libraryMetadataCache = null;
    this.libraryPosterCache.clear();
    this.libraryPosterStore = null;
    this.libraryPosterRefreshes.clear();
    this.libraryStorageStore = null;
    this.libraryStorageRefreshes.clear();
    this.libraryStorageQueue = Promise.resolve();
    this.serverInfoCache = null;
    this.wirePromise = null;
    this.connectionInfo = null;
    this.backoffUntil = 0;
    this.capabilityCache = null;
    this.itemLibraryCache.clear();
    this.libraryHistoryContinuations.clear();
  }

  async _configured(refresh = false) {
    if (!refresh && this.config) return this.config;
    const config = await this.getConfig();
    if (!config || config.error || ![1, 2].includes(config.state)) {
      throw new SiloRequestError('Silo is not configured');
    }
    const host = config.SILO_URL || config.JF_HOST;
    const key = config.SILO_API_KEY || config.JF_API_KEY;
    if (!host || !key) throw new SiloRequestError('Silo is not configured');
    const next = { base: normalizeBase(host), key: String(key), state: config.state };
    if (!this.config || this.config.base !== next.base || this.config.key !== next.key) {
      this._clearUpstreamCaches();
      this.config = next;
    }
    return this.config;
  }

  async _sleep(ms) {
    if (ms > 0) await new Promise(resolve => setTimeout(resolve, ms));
  }

  async _rawRequest(path, { base, key, timeoutMs = this.timeoutMs, apiMajor = 1, profileId, noRateLimitRetry = false,
    method = 'GET', body } = {}) {
    const settings = base ? { base: normalizeBase(base), key: String(key || '') } : await this._configured();
    const run = async () => {
      const now = Date.now();
      const waitMs = Math.max(0, this.nextRequestAt - now);
      await this._sleep(waitMs);
      this.nextRequestAt = Date.now() + this.minRequestIntervalMs;
      return requestJSON({ path, base: settings.base, key: settings.key, timeoutMs, apiMajor, profileId, method, body,
        fetchImpl: this.fetch, httpClient: this.httpClient, userAgent: this.userAgent });
    };
    let attempt = 0;
    for (;;) {
      const execute = this.requestQueue.then(run, run);
      this.requestQueue = execute.catch(() => {});
      try { return await execute; }
      catch (error) {
        const retryable = !noRateLimitRetry && (error?.status === 429 || error?.category === 'rate_limited');
        if (!retryable || attempt++ >= this.maxRateLimitRetries) throw error;
        const retryAfter = Math.min(this.maxRetryAfterMs, Math.max(0, Number(error.retryAfterMs ?? this.defaultRateLimitRetryMs)));
        this.backoffUntil = Math.max(this.backoffUntil, Date.now() + retryAfter);
        await this._sleep(retryAfter);
      }
    }
  }

  async _wire(deadlineAt = Date.now() + this.timeoutMs) {
    if (this.wirePromise) return this.wirePromise;
    const settings = await this._configured();
    if (this.wirePromise) return this.wirePromise;
    const assertCurrent = () => { if (this.config !== settings) throw new SiloRequestError('Silo connection changed; retry the request'); };
    const request = async (path, options = {}) => {
      assertCurrent();
      if (this.backoffUntil > Date.now()) {
        const error = new SiloRequestError('Silo request failed (429)', 429);
        error.retryAfterMs = this.backoffUntil - Date.now(); throw error;
      }
      try {
        const result = await this._rawRequest(path, { ...settings, ...options });
        assertCurrent();
        return result.data;
      } catch (error) {
        assertCurrent();
        if (error.retryAfterMs) this.backoffUntil = Date.now() + error.retryAfterMs;
        throw error;
      }
    };
    const promise = (async () => {
      const discovered = this.apiMajor === 1 ? { apiMajor: 1, serverVersion: 'Silo', capabilities: {} }
        : await discoverSilo({ request: (path, options) => {
          const remaining = deadlineAt - Date.now();
          if (remaining <= 0) throw new SiloRequestError('Silo request timed out');
          return request(path, { ...options, timeoutMs: Math.min(this.timeoutMs, remaining) });
        } });
      assertCurrent();
      if (this.apiMajor === 2 && discovered.apiMajor !== 2) throw new SiloRequestError('Silo API v2 is unavailable');
      this.connectionInfo = discovered;
      if (discovered.serverId) this.serverInfoCache = { id: discovered.serverId };
      const read = (path, options) => request(path, { apiMajor: discovered.apiMajor, ...options });
      return discovered.apiMajor === 2 ? createV2(read, { maxPages: this.maxPages }) : createV1(read);
    })();
    this.wirePromise = promise;
    try { return await promise; }
    catch (error) { if (this.wirePromise === promise) this.wirePromise = null; throw error; }
  }

  async _request(path, options) {
    if (path === 'health' || options?.base) return (await this._rawRequest(path, options)).data;
    const wire = await this._wire(options?.deadlineAt);
    if (options?.deadlineAt) {
      const remaining = options.deadlineAt - Date.now();
      if (remaining <= 0) throw new SiloRequestError('Silo request timed out');
      options = { ...options, timeoutMs: Math.min(options.timeoutMs || this.timeoutMs, remaining) };
    }
    return wire.read(path, options);
  }

  getConnectionInfo() {
    if (!this.connectionInfo) return null;
    const { apiMajor, serverVersion, contractDigest, checkedAt } = this.connectionInfo;
    return { apiMajor, serverVersion, contractDigest, checkedAt,
      diagnosticsAvailable: this.capabilityCache?.value?.available ?? null };
  }

  async _sessionCapabilities(settings) {
    if (this.connectionInfo?.apiMajor !== 2) return undefined;
    if (this.capabilityCache?.expiresAt > Date.now()) return this.capabilityCache.value;
    let value;
    try {
      const response = await this._rawRequest('admin/sessions/capabilities', { ...settings, apiMajor: 2,
        timeoutMs: Math.min(this.enrichmentTimeoutMs, 750), noRateLimitRetry: true });
      value = sessionCapabilities(response.data);
    } catch { value = { available: false }; }
    if (this.config === settings) this.capabilityCache = { value, expiresAt: Date.now() + 60000 };
    return value;
  }

  async probeConnection() {
    await this._configured(true);
    await this._wire();
    const sessions = await this._request('admin/sessions', { timeoutMs: Math.min(this.timeoutMs, 5000) });
    if (!Array.isArray(sessions)) throw new SiloRequestError('Invalid Silo session response');
    return { identity: await this.systemInfo(), sessions };
  }

  async getSessionCommandCapabilities() {
    const settings = await this._configured(true);
    await this._wire();
    if (this.connectionInfo?.apiMajor !== 2) {
      return { available: false, allowed: false, actions: [], state: 'unsupported' };
    }
    const response = await this._rawRequest('admin/sessions/command-capabilities', { ...settings, apiMajor: 2,
      timeoutMs: Math.min(this.timeoutMs, 3000), noRateLimitRetry: true });
    const body = response.data;
    if (!body || typeof body.available !== 'boolean' || typeof body.allowed !== 'boolean' || !Array.isArray(body.actions)) {
      throw new SiloRequestError('Invalid Silo playback command capabilities');
    }
    const supported = new Set(['pause', 'resume', 'stop', 'terminate', 'message']);
    return { available: body.available, allowed: body.allowed,
      actions: body.actions.map(action => String(action).toLowerCase()).filter(action => supported.has(action)),
      state: String(body.state || ''), sequencedCommands: Boolean(body.sequenced_commands),
      terminateRevokesAuthority: Boolean(body.terminate_revokes_authority) };
  }

  async controlSession(sessionId, action, { reason = '', message = '', title = '' } = {}) {
    const id = String(sessionId || '').trim();
    const command = String(action || '').toLowerCase();
    if (!id || id.length > 128 || /[\x00-\x1f\x7f]/.test(id)) throw new SiloRequestError('Invalid Silo session ID', 400);
    if (!['pause', 'resume', 'stop', 'terminate', 'message'].includes(command)) throw new SiloRequestError('Unsupported playback command', 400);
    const settings = await this._configured(true);
    await this._wire();
    if (this.connectionInfo?.apiMajor !== 2) throw new SiloRequestError('Silo playback controls require API v2', 501);
    const capabilities = await this.getSessionCommandCapabilities();
    if (!capabilities.available || !capabilities.allowed || !capabilities.actions.includes(command)) {
      throw new SiloRequestError('Silo playback command is unavailable', 403);
    }
    const cleanReason = String(reason || '').trim().slice(0, 1024);
    let body;
    if (command === 'terminate') body = cleanReason ? { reason: cleanReason } : {};
    else {
      const priorSequence = this.commandSequences.get(id) || 0;
      const sequence = Math.max(Date.now(), priorSequence + 1);
      this.commandSequences.set(id, sequence);
      body = { command_id: randomUUID(), sequence, deadline_ms: 3000 };
      if (cleanReason) body.reason = cleanReason;
      if (command === 'message') {
        const cleanMessage = String(message || '').trim().slice(0, 2048);
        if (!cleanMessage) throw new SiloRequestError('A playback message is required', 400);
        body.message = cleanMessage;
        const cleanTitle = String(title || '').trim().slice(0, 256);
        if (cleanTitle) body.title = cleanTitle;
      }
    }
    const response = await this._rawRequest(`admin/sessions/${encodeURIComponent(id)}/${command}`, { ...settings,
      apiMajor: 2, method: 'POST', body, timeoutMs: Math.min(this.timeoutMs, 12000), noRateLimitRetry: true });
    return { action: command, status: response.status, receipt: response.data || null };
  }

  _cachedDetail(id) {
    const entry = this.detailCache.get(String(id));
    if (!entry || entry.expiresAt <= Date.now()) { this.detailCache.delete(String(id)); return null; }
    this.detailCache.delete(String(id));
    this.detailCache.set(String(id), entry);
    return entry.value;
  }

  _storeDetail(id, detail) {
    this.detailFailureCache.delete(String(id));
    this.detailCache.delete(String(id));
    this.detailCache.set(String(id), { value: detail, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
    while (this.detailCache.size > DETAIL_CACHE_MAX) this.detailCache.delete(this.detailCache.keys().next().value);
    return detail;
  }

  async _detail(id, options) {
    if (!id || /^https?:\/\//i.test(String(id))) throw new SiloRequestError('Invalid Silo item ID', 400);
    const cached = this._cachedDetail(id);
    if (cached) return cached;
    const settings = await this._configured();
    const detail = await this._request(`catalog/items/${encodeURIComponent(String(id))}`, options);
    if (this.config !== settings) throw new SiloRequestError('Silo connection changed; retry the request');
    if (!detail || typeof detail !== 'object' || String(detail.content_id) !== String(id)) throw new SiloRequestError('Invalid Silo item response');
    return this._storeDetail(id, detail);
  }

  async _attachMediaSources(item) {
    if (!item || !['Movie', 'Audio', 'Episode', 'Book'].includes(item.Type)) return item;
    try {
      const detail = await this._detail(item.Id);
      item.MediaSources = Array.isArray(detail.versions) ? detail.versions.map(version => versionToMediaSource(version, item.Id)) : [];
    } catch {
      item.MediaSources = [];
    }
    return item;
  }

  async _serverId() {
    if (this.serverInfoCache) return this.serverInfoCache.id;
    const settings = this.config;
    try {
      const health = await this._request('health', { timeoutMs: this.enrichmentTimeoutMs });
      const id = health?.status === 'ok' && typeof health.server_id === 'string' ? health.server_id : '';
      if (id && this.config === settings) this.serverInfoCache = { id };
      return id;
    } catch {
      return '';
    }
  }

  async getSessions() {
    const settings = await this._configured(true);
    if (!this.sessionsInFlight || this.sessionsSettings !== settings) {
      const promise = this._getSessions(settings).finally(() => {
        if (this.sessionsInFlight === promise) this.sessionsInFlight = null;
      });
      this.sessionsSettings = settings;
      this.sessionsInFlight = promise;
    }
    return this.sessionsInFlight;
  }

  async _getSessions(settings) {
    // Two bounded attempts plus parallel optional metadata stay below the UI's
    // 15-second deadline. Never retry authentication, redirects, or bad payloads.
    const options = { timeoutMs: Math.min(this.timeoutMs, 5000), deadlineAt: Date.now() + this.sessionBudgetMs };
    let rows;
    try {
      rows = await this._request('admin/sessions', options);
    } catch (error) {
      const transient = [502, 503, 504].includes(error.status)
        || ['Silo request timed out', 'Unable to connect to Silo'].includes(error.message);
      if (!transient || error.retryAfterMs || Date.now() + 150 >= options.deadlineAt) throw error;
      await new Promise(resolve => setTimeout(resolve, 150));
      rows = await this._request('admin/sessions', options);
    }
    if (!Array.isArray(rows)) throw new SiloRequestError('Invalid Silo session response');
    if (this.config !== settings) throw new SiloRequestError('Silo connection changed; retry the request');
    const serverIdPromise = this._serverId();
    const capabilitiesPromise = this._sessionCapabilities(settings);
    const details = new Map();
    const ids = [...new Set(rows.filter(isEpisodeSession).map(row => String(row.content_id || '')).filter(Boolean))];
    const uncached = [];
    for (const id of ids) {
      const detail = this._cachedDetail(id);
      const failedUntil = this.detailFailureCache.get(id) || 0;
      if (detail) details.set(id, detail);
      else if (failedUntil <= Date.now() && uncached.length < SESSION_ENRICH_LIMIT) uncached.push(id);
    }
    await Promise.all(uncached.map(async id => {
      try { details.set(id, await this._detail(id, { timeoutMs: this.enrichmentTimeoutMs })); }
      catch {
        if (this.config !== settings) return;
        this.detailFailureCache.set(id, Date.now() + DETAIL_CACHE_TTL_MS);
        while (this.detailFailureCache.size > DETAIL_CACHE_MAX) this.detailFailureCache.delete(this.detailFailureCache.keys().next().value);
      }
    }));
    const serverId = await serverIdPromise;
    const capabilities = await capabilitiesPromise;
    if (this.config !== settings) throw new SiloRequestError('Silo connection changed; retry the request');
    return rows.map(row => sessionToJellyfin(supportedSession(row, capabilities), details.get(String(row.content_id)), serverId));
  }

  async validateSettings(url, apikey) {
    let cleanedUrl = '';
    try {
      cleanedUrl = normalizeBase(url);
      const health = await this._request('health', { base: cleanedUrl, key: apikey });
      if (!health || health.status !== 'ok') throw new SiloRequestError('Invalid Silo health response');
      const candidate = new SiloAPI({ getConfig: async () => ({ state: 2, SILO_URL: cleanedUrl, SILO_API_KEY: apikey }),
        fetch: this.fetch, httpClient: this.httpClient, timeoutMs: this.timeoutMs, apiMajor: this.apiMajor, maxPages: this.maxPages });
      const sessions = await candidate._request('admin/sessions');
      if (!Array.isArray(sessions)) throw new SiloRequestError('Invalid Silo session response');
      return { isValid: true, status: 200, errorMessage: '', url, cleanedUrl };
    } catch (error) {
      return { isValid: false, status: error.status || 400, errorMessage: error.message || 'Unable to connect to Silo', url, cleanedUrl };
    }
  }

  async systemInfo() {
    try {
      const settings = await this._configured(true);
      const health = await this._request('health', settings);
      if (this.config !== settings || !health || health.status !== 'ok') return {};
      await this._wire();
      if (this.config !== settings) return {};
      return { Id: health.server_id || '', ServerName: health.server_name || 'Silo', Version: this.connectionInfo?.serverVersion || 'Silo' };
    } catch { return {}; }
  }

  async getUsers(refreshConfig = false) {
    await this._configured(true);
    const rows = await this._request('admin/users');
    if (!Array.isArray(rows)) throw new SiloRequestError('Invalid Silo user response');
    const serverId = await this._serverId();
    return rows.map(row => userToJellyfin(row, serverId));
  }

  async getAdmins(refreshConfig = false) { return (await this.getUsers(refreshConfig)).filter(user => user.Policy.IsAdministrator); }
  async getUserById(userid) { return (await this.getUsers()).find(user => user.Id === String(userid)) || null; }

  async getHomeDashboard() {
    const { buildNativeHomeDashboard } = require('./silo/home-dashboard');
    return buildNativeHomeDashboard(await this.getAdminDashboardInsights({ hours: 168, days: 7, limit: 10 }));
  }

  async getPlaybackHistoryPage({ limit = 50, page = 1, cursor, userId, profileId, mediaItemId, completed, _deadlineAt } = {}) {
    await this._configured(true);
    await this._wire();
    if (this.connectionInfo?.apiMajor !== 2) throw new SiloRequestError('Silo playback history requires API v2', 501);
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 50));
    const pageNumber = Math.max(1, Number(page) || 1);
    const deadlineAt = _deadlineAt || Date.now() + this.timeoutMs;
    const query = new URLSearchParams({ limit: String(pageSize) });
    if (cursor) query.set('cursor', String(cursor));
    if (userId) query.set('user_id', String(userId));
    if (profileId) query.set('profile_id', String(profileId));
    if (mediaItemId) query.set('media_item_id', String(mediaItemId));
    if (completed !== undefined && completed !== 'all') query.set('completed', String(Boolean(completed)));
    const body = await this._request(`admin/playback-history?${query}`, { deadlineAt });
    if (!body || !Array.isArray(body.items) || !body.page || typeof body.page.has_more !== 'boolean') {
      throw new SiloRequestError('Invalid Silo playback history response');
    }
    const nextCursor = body.page.next_cursor;
    if (body.page.has_more && (typeof nextCursor !== 'string' || !nextCursor || nextCursor === cursor || body.items.length === 0)) {
      throw new SiloRequestError('Invalid Silo playback history cursor');
    }
    if (!body.page.has_more && nextCursor) throw new SiloRequestError('Invalid terminal Silo playback history cursor');
    const methodName = value => ({ direct: 'DirectPlay', remux: 'DirectStream', transcode: 'Transcode', audio: 'Transcode' })
      [String(value || '').toLowerCase()] || '';
    const results = body.items.map(row => {
      const itemId = row.media_item_id ? String(row.media_item_id) : '';
      return {
        Id: String(row.session_id), SiloSessionId: String(row.session_id), UserId: String(row.user_id),
        UserName: row.username || '', ProfileId: row.profile_id ? String(row.profile_id) : '',
        ProfileName: row.profile_name || '', NowPlayingItemId: itemId,
        EpisodeId: String(row.media_type || '').toLowerCase() === 'episode' ? itemId : null,
        NowPlayingItemName: row.media_title || '', SiloMediaType: String(row.media_type || ''),
        SiloMediaFileId: String(row.media_file_id || ''), PlayMethod: methodName(row.play_method),
        SiloPlayMethod: String(row.play_method || ''), PlaybackDuration: Math.max(0, Number(row.watched_seconds) || 0),
        ActivityDateInserted: row.ended_at || row.started_at, DateCreated: row.started_at, EndedAt: row.ended_at,
        RunTime: row.duration_seconds, Completed: row.completed === true, Client: '', DeviceName: '', RemoteEndPoint: '',
        TotalPlays: 1, TotalDuration: Math.max(0, Number(row.watched_seconds) || 0), MediaServerProvider: 'silo',
        HistorySource: 'Silo retention',
      };
    });
    return { results, currentPage: pageNumber, hasMore: body.page.has_more, nextCursor: body.page.has_more ? nextCursor : null };
  }

  async _itemLibraryIds(itemId, deadlineAt) {
    const key = String(itemId || '');
    if (!key) return new Set();
    const cached = this.itemLibraryCache.get(key);
    if (cached?.expiresAt > Date.now()) return cached.ids;
    const ids = new Set();
    const seenCursors = new Set();
    let cursor;
    for (let page = 0; page < this.maxPages; page += 1) {
      const query = new URLSearchParams({ limit: '100' });
      if (cursor) query.set('cursor', cursor);
      let body;
      try { body = await this._request(`admin/items/${encodeURIComponent(key)}/files?${query}`, { deadlineAt }); }
      catch (error) {
        // A deleted catalog item can remain in retained history but no longer
        // belongs to a current library. Other failures must stay visible.
        if (error?.status === 404) break;
        throw error;
      }
      if (!body || !Array.isArray(body.items)) throw new SiloRequestError('Invalid Silo item file response');
      for (const file of body.items) if (file?.library_id !== undefined && file?.library_id !== null) ids.add(String(file.library_id));
      if (!body.page?.has_more) { cursor = undefined; break; }
      cursor = body.page.next_cursor;
      if (typeof cursor !== 'string' || !cursor || seenCursors.has(cursor)) throw new SiloRequestError('Invalid Silo item file cursor');
      seenCursors.add(cursor);
      if (page === this.maxPages - 1) throw new SiloRequestError('Silo item files exceed the safe page limit', 503);
    }
    this.itemLibraryCache.set(key, { ids, expiresAt: Date.now() + 60000 });
    while (this.itemLibraryCache.size > 1024) this.itemLibraryCache.delete(this.itemLibraryCache.keys().next().value);
    return ids;
  }

  async getLibraryPlaybackHistoryPage({ libraryId, limit = 50, cursor } = {}) {
    await this._configured(true);
    await this._wire();
    if (this.connectionInfo?.apiMajor !== 2) throw new SiloRequestError('Silo library playback history requires API v2', 501);
    if (!libraryId) throw new SiloRequestError('Silo library ID is required', 400);
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 50));
    const deadlineAt = Date.now() + this.timeoutMs;
    const libraryKey = String(libraryId);
    const library = (await this.getLibraries()).find(row => String(row.Id) === libraryKey);
    if (!library) throw new SiloRequestError('Silo library was not found', 404);
    let state = { pending: [], upstreamCursor: undefined, upstreamDone: false };
    if (cursor) {
      const cached = this.libraryHistoryContinuations.get(String(cursor));
      if (!cached || cached.expiresAt <= Date.now() || cached.libraryId !== String(libraryId)) {
        throw new SiloRequestError('Silo library history cursor expired; restart from the first page', 409);
      }
      state = { ...cached, pending: [...cached.pending] };
    }
    const results = [];
    let scannedPages = 0;
    while (results.length < pageSize) {
      while (state.pending.length && results.length < pageSize) results.push(state.pending.shift());
      if (results.length >= pageSize || state.upstreamDone) break;
      if (++scannedPages > this.maxPages) throw new SiloRequestError('Silo library history exceeds the safe page limit', 503);
      const history = await this.getPlaybackHistoryPage({ limit: 100, cursor: state.upstreamCursor, _deadlineAt: deadlineAt });
      const membership = new Map();
      const itemIds = [...new Set(history.results.map(row => String(row.NowPlayingItemId || '')).filter(Boolean))];
      await forEachLimited(itemIds, 8, async itemId => membership.set(itemId, await this._itemLibraryIds(itemId, deadlineAt)));
      state.pending.push(...history.results.filter(row => membership.get(String(row.NowPlayingItemId))?.has(libraryKey))
        .map(row => ({ ...row, SiloLibraryId: libraryKey })));
      state.upstreamCursor = history.nextCursor || undefined;
      state.upstreamDone = !history.hasMore;
    }
    let nextCursor = null;
    if (state.pending.length || !state.upstreamDone) {
      nextCursor = randomUUID();
      this.libraryHistoryContinuations.set(nextCursor, { ...state, libraryId: String(libraryId),
        expiresAt: Date.now() + 2 * 60 * 1000 });
      while (this.libraryHistoryContinuations.size > 128) {
        this.libraryHistoryContinuations.delete(this.libraryHistoryContinuations.keys().next().value);
      }
    }
    return { results, hasMore: Boolean(nextCursor), nextCursor, coverage: 'complete-library-membership' };
  }

  async getPlaybackHistoryUsers() {
    return this.getUsers(true);
  }

  async getPlaybackHistoryProfiles(userId) {
    await this._configured(true);
    await this._wire();
    if (this.connectionInfo?.apiMajor !== 2) throw new SiloRequestError('Silo profiles require API v2', 501);
    const body = await this._request(`admin/users/${encodeURIComponent(String(userId))}/profiles`);
    const rows = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : null;
    if (!rows) throw new SiloRequestError('Invalid Silo profile response');
    return rows.map(row => ({ id: String(row.id), name: row.name || row.display_name || String(row.id), userId: String(userId) }));
  }

  async getAdminDashboardInsights({ hours = 168, days = 7, limit = 10, refresh = false } = {}) {
    await this._configured(true);
    await this._wire();
    if (this.connectionInfo?.apiMajor !== 2) throw new SiloRequestError('Silo dashboard insights require API v2', 501);
    const deadlineAt = Date.now() + this.timeoutMs;
    const refreshValue = refresh ? 'true' : 'false';
    const [stats, playback, top] = await Promise.all([
      this._request(`admin/stats?refresh=${refreshValue}`, { deadlineAt }),
      this._request(`admin/stats/playback-activity?hours=${Math.min(744, Math.max(1, Number(hours) || 168))}&refresh=${refreshValue}`, { deadlineAt }),
      this._request(`admin/stats/top-activity?days=${Math.min(30, Math.max(1, Number(days) || 7))}&limit=${Math.min(25, Math.max(1, Number(limit) || 10))}&refresh=${refreshValue}`, { deadlineAt }),
    ]);
    if (!stats || !Array.isArray(playback?.buckets) || !playback.reliability || !Array.isArray(top?.titles) || !Array.isArray(top?.profiles)) {
      throw new SiloRequestError('Invalid Silo dashboard insights response');
    }
    return { stats, playback, top };
  }

  async getLibraries() {
    await this._configured(true);
    const rows = await this._request('libraries');
    if (!Array.isArray(rows)) throw new SiloRequestError('Invalid Silo library response');
    const serverId = await this._serverId();
    return rows.map(row => libraryToJellyfin(row, serverId));
  }

  async _catalogPage({ libraryId, startIndex = 0, limit = 100, recent = false, mediaType, search, sort, desc, deadlineAt }) {
    const query = new URLSearchParams({ offset: String(Math.max(0, startIndex)), limit: String(Math.min(100, Math.max(1, limit))) });
    if (libraryId !== undefined && libraryId !== null) query.set('library_id', String(libraryId));
    if (mediaType) query.set('type', String(mediaType));
    if (search) query.set('q', String(search));
    if (sort) query.set('sort', `${desc ? '-' : ''}${sort}`);
    else if (recent) { query.set('sort', 'added_at'); query.set('order', 'desc'); }
    const body = await this._request(`catalog?${query}`, { deadlineAt });
    if (!body || !Array.isArray(body.items)) throw new SiloRequestError('Invalid Silo catalog response');
    return body;
  }

  async _catalogSlice({ libraryId, startIndex, limit, recent = false, search, sort, desc }) {
    const result = [];
    let offset = Math.max(0, startIndex);
    const deadlineAt = Date.now() + this.timeoutMs;
    let pages = 0;
    while (result.length < limit) {
      if (++pages > this.maxPages) throw new SiloRequestError('Silo catalog page limit exceeded');
      const pageLimit = Math.min(100, limit - result.length);
      const page = await this._catalogPage({ libraryId, startIndex: offset, limit: pageLimit, recent, search, sort, desc, deadlineAt });
      result.push(...page.items);
      if (!page.has_more || page.items.length === 0) break;
      offset += page.items.length;
    }
    return result;
  }

  async getItemsFromParentId({ id, itemid, params = {}, ws, syncTask, wsMessage } = {}) {
    await this._configured(true);
    const serverId = await this._serverId();
    let items;
    if (itemid !== undefined && itemid !== null) items = [await this._detail(itemid)];
    else items = await this._catalogSlice({ libraryId: id, startIndex: params.startIndex ?? 0,
      limit: params.increment ?? params.limit ?? 100 });
    const result = items.map(row => itemToJellyfin(row, serverId));
    for (const row of items.filter(item => String(item.type).toLowerCase() === 'series')) {
      const seasons = await this.getSeasons(row.content_id, false, row.title);
      result.push(...seasons);
      for (const season of seasons) result.push(...await this.getEpisodes({ SeriesId: row.content_id, SeasonId: season.Id }, false));
    }
    await forEachLimited(result, 6, item => this._attachMediaSources(item));
    if (ws && syncTask && wsMessage) ws(syncTask.wsKey, { type: 'Update', message: wsMessage });
    return result;
  }

  async getLibraryCatalogSummary({ id } = {}) {
    await this._configured(true);
    const body = await this._catalogPage({ libraryId: id, startIndex: 0, limit: 1 });
    return { total: Number(body.total || body.items?.length || 0), totalExact: Boolean(body.total_exact), hasMore: Boolean(body.has_more) };
  }

  _libraryPosterStorePath() {
    return path.join(process.env.CONFIG_DIR || path.resolve(process.cwd(), 'config'), 'silo-library-posters.json');
  }

  _readLibraryPosterStore() {
    if (this.libraryPosterStore) return this.libraryPosterStore;
    try {
      this.libraryPosterStore = JSON.parse(fs.readFileSync(this._libraryPosterStorePath(), 'utf8')) || {};
    } catch {
      this.libraryPosterStore = {};
    }
    return this.libraryPosterStore;
  }

  _writeLibraryPosterStore() {
    try {
      const file = this._libraryPosterStorePath();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(this.libraryPosterStore || {}, null, 2));
    } catch {
      // Poster persistence is an optimization; never fail library loading because of it.
    }
  }

  async _discoverLibraryPosterUrl(id) {
    const page = await this._catalogPage({ libraryId: id, startIndex: 0, limit: 12, recent: true, deadlineAt: Date.now() + Math.min(this.timeoutMs, 5000) });
    const item = (Array.isArray(page.items) ? page.items : []).find(row => row?.poster_url || row?.backdrop_url || row?.still_url || row?.image_url || row?.artwork_url);
    return item?.poster_url || item?.backdrop_url || item?.still_url || item?.image_url || item?.artwork_url || '';
  }

  _refreshLibraryPosterInBackground(id) {
    const cacheKey = String(id || '');
    if (!cacheKey || this.libraryPosterRefreshes.has(cacheKey)) return;
    const refresh = this._discoverLibraryPosterUrl(id).then(value => {
      if (!value) return;
      const store = this._readLibraryPosterStore();
      store[cacheKey] = { url: value, updatedAt: new Date().toISOString() };
      this.libraryPosterStore = store;
      this._writeLibraryPosterStore();
      this.libraryPosterCache.set(cacheKey, { value, expiresAt: Date.now() + 10 * 60 * 1000 });
    }).catch(() => {}).finally(() => this.libraryPosterRefreshes.delete(cacheKey));
    this.libraryPosterRefreshes.set(cacheKey, refresh);
  }

  _assetUrlNeedsRefresh(value) {
    try {
      const url = new URL(value);
      const signedAt = url.searchParams.get('X-Amz-Date');
      const lifetime = Number(url.searchParams.get('X-Amz-Expires'));
      if (!signedAt || !Number.isFinite(lifetime)) return false;
      const match = signedAt.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
      if (!match) return false;
      const issuedAt = Date.UTC(...match.slice(1).map(Number).map((part, index) => index === 1 ? part - 1 : part));
      return Date.now() >= issuedAt + lifetime * 1000 - 5 * 60 * 1000;
    } catch { return true; }
  }

  async getLibraryPosterUrl({ id, waitIfMissing = false } = {}) {
    await this._configured(true);
    const cacheKey = String(id || '');
    const cached = this.libraryPosterCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() && !this._assetUrlNeedsRefresh(cached.value)) return cached.value;

    const stored = this._readLibraryPosterStore()[cacheKey];
    if (stored?.url && !this._assetUrlNeedsRefresh(stored.url)) {
      this.libraryPosterCache.set(cacheKey, { value: stored.url, expiresAt: Date.now() + 10 * 60 * 1000 });
      this._refreshLibraryPosterInBackground(id);
      return stored.url;
    }
    if (stored?.url) waitIfMissing = true;

    if (!waitIfMissing) {
      this._refreshLibraryPosterInBackground(id);
      return '';
    }

    let value = '';
    try { value = await this._discoverLibraryPosterUrl(id); } catch { value = ''; }
    if (value) {
      const store = this._readLibraryPosterStore();
      store[cacheKey] = { url: value, updatedAt: new Date().toISOString() };
      this.libraryPosterStore = store;
      this._writeLibraryPosterStore();
    }
    this.libraryPosterCache.set(cacheKey, { value, expiresAt: Date.now() + 10 * 60 * 1000 });
    while (this.libraryPosterCache.size > 128) this.libraryPosterCache.delete(this.libraryPosterCache.keys().next().value);
    return value;
  }

  async _versionsForDetail(detail, options = {}) {
    if (!detail?.content_id) return [];
    if (Array.isArray(detail.versions)) return detail.versions;
    try {
      const body = await this._request(`catalog/items/${encodeURIComponent(String(detail.content_id))}/versions`, {
        timeoutMs: options.timeoutMs || this.enrichmentTimeoutMs,
        deadlineAt: options.deadlineAt,
      });
      return Array.isArray(body?.items) ? body.items : [];
    } catch {
      return [];
    }
  }

  _libraryStorageStorePath() {
    return path.join(process.env.CONFIG_DIR || path.resolve(process.cwd(), 'config'), 'silo-library-storage.json');
  }

  _readLibraryStorageStore() {
    if (this.libraryStorageStore) return this.libraryStorageStore;
    try {
      this.libraryStorageStore = JSON.parse(fs.readFileSync(this._libraryStorageStorePath(), 'utf8')) || {};
    } catch {
      this.libraryStorageStore = {};
    }
    return this.libraryStorageStore;
  }

  _writeLibraryStorageStore() {
    try {
      const file = this._libraryStorageStorePath();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(this.libraryStorageStore || {}, null, 2));
    } catch {
      // Storage persistence is best-effort only.
    }
  }

  _refreshLibraryStorageInBackground(id) {
    const cacheKey = String(id || '');
    if (!cacheKey || this.libraryStorageRefreshes.has(cacheKey)) return;
    const refresh = this.libraryStorageQueue.then(() => this._calculateLibraryStorage(id)).then(row => {
      if (!row?.measurement_available) return;
      const store = this._readLibraryStorageStore();
      store[cacheKey] = { Size: row.Size, files: row.files, updatedAt: new Date().toISOString() };
      this.libraryStorageStore = store;
      this._writeLibraryStorageStore();
      this.libraryMetadataCache = null;
    }).catch(() => {}).finally(() => this.libraryStorageRefreshes.delete(cacheKey));
    this.libraryStorageQueue = refresh.catch(() => {});
    this.libraryStorageRefreshes.set(cacheKey, refresh);
  }

  async _storageDetailsForItem(item, deadlineAt) {
    if (String(item?.type || '').toLowerCase() !== 'series') {
      try { return [await this._detail(item.content_id, { timeoutMs: 5000, deadlineAt })]; } catch { return []; }
    }
    const details = [];
    try {
      const seasonsBody = await this._request(`catalog/series/${encodeURIComponent(String(item.content_id))}/seasons`, { timeoutMs: 8000, deadlineAt });
      for (const season of seasonsBody?.seasons || []) {
        if (Date.now() >= deadlineAt - 500) break;
        const episodesBody = await this._request(`catalog/series/${encodeURIComponent(String(item.content_id))}/seasons/${season.season_number}/episodes`, { timeoutMs: 8000, deadlineAt });
        await forEachLimited(episodesBody?.episodes || [], 4, async episode => {
          try { details.push(await this._detail(episode.content_id, { timeoutMs: 5000, deadlineAt })); } catch {}
        });
      }
    } catch {}
    return details;
  }

  async _calculateLibraryStorage(id, { maxItems = 5000 } = {}) {
    let offset = 0;
    let scanned = 0;
    let pages = 0;
    let size = 0;
    let files = 0;
    let complete = false;
    const deadlineAt = Date.now() + 5 * 60 * 1000;
    while (scanned < maxItems && Date.now() < deadlineAt - 500) {
      if (++pages > this.maxPages) break;
      const pageLimit = Math.min(100, maxItems - scanned);
      const page = await this._catalogPage({ libraryId: id, startIndex: offset, limit: pageLimit, deadlineAt });
      const items = Array.isArray(page.items) ? page.items : [];
      scanned += items.length;
      offset += items.length;
      for (const item of items) {
        if (Date.now() >= deadlineAt - 500) break;
        const details = await this._storageDetailsForItem(item, deadlineAt);
        await forEachLimited(details, 4, async detail => {
          const versions = await this._versionsForDetail(detail, { timeoutMs: 5000, deadlineAt });
          for (const version of versions) {
            const value = Number(version.file_size ?? version.size ?? version.bytes);
            if (Number.isFinite(value) && value > 0) size += value;
            files += 1;
          }
        });
      }
      if (!page.has_more || items.length === 0) { complete = true; break; }
    }
    return { Id: String(id), Size: files > 0 && complete ? size : null, files: files > 0 && complete ? files : null,
      measurement_available: files > 0 && complete, measurement_source: files > 0 && complete ? 'silo-catalog-versions' : 'unavailable' };
  }

  async getLibraryStorageMetadata() {
    await this._configured(true);
    const cacheKey = `${this.config?.SILO_URL || ''}:persisted`;
    if (this.libraryMetadataCache?.key === cacheKey && this.libraryMetadataCache.expiresAt > Date.now()) {
      return this.libraryMetadataCache.value;
    }

    const libraries = await this.getLibraries();
    const store = this._readLibraryStorageStore();
    const rows = libraries.map(library => {
      const nativeSize = Number.isFinite(Number(library.Size)) ? Number(library.Size) : null;
      const nativeFiles = Number.isFinite(Number(library.files)) ? Number(library.files) : null;
      const stored = store[String(library.Id)] || {};
      const size = nativeSize ?? (Number.isFinite(Number(stored.Size)) ? Number(stored.Size) : null);
      const files = nativeFiles ?? (Number.isFinite(Number(stored.files)) ? Number(stored.files) : null);
      if (size === null && files === null) this._refreshLibraryStorageInBackground(library.Id);
      return { Id: library.Id, Size: size, files,
        measurement_available: size !== null || files !== null,
        measurement_source: nativeSize !== null || nativeFiles !== null ? 'silo-library' : stored.updatedAt ? 'silo-catalog-versions' : 'pending',
        measurement_pending: size === null && files === null };
    });
    this.libraryMetadataCache = { key: cacheKey, value: rows, expiresAt: Date.now() + 30 * 1000 };
    return rows;
  }

  async getLibraryItemsPage({ id, startIndex = 0, limit = 50, recent = false, search, sort, desc = false } = {}) {
    await this._configured(true);
    const serverId = await this._serverId();
    const items = await this._catalogSlice({ libraryId: id, startIndex, limit, recent, search, sort, desc });
    return items.map(row => ({ ...itemToJellyfin(row, serverId), ParentId: String(id), archived: false }));
  }

  async getItemsByID({ ids } = {}) {
    await this._configured(true);
    const values = Array.isArray(ids) ? ids : String(ids || '').split(',').filter(Boolean);
    const serverId = await this._serverId();
    const result = [];
    for (const id of values.slice(0, 200)) {
      try {
        const detail = await this._detail(id);
        const item = itemToJellyfin(detail, serverId);
        item.MediaSources = Array.isArray(detail.versions) ? detail.versions.map(version => versionToMediaSource(version, item.Id)) : [];
        result.push(item);
      } catch {}
    }
    return result;
  }

  async getSeasons(SeriesId, refreshConfig = true, seriesName) {
      if (refreshConfig) await this._configured(true);
      const cached = this.seasonCache.get(String(SeriesId));
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      const body = await this._request(`catalog/series/${encodeURIComponent(String(SeriesId))}/seasons`);
      if (!body || !Array.isArray(body.seasons)) throw new SiloRequestError('Invalid Silo season response');
      const detail = this._cachedDetail(SeriesId);
      const serverId = await this._serverId();
      const seasons = body.seasons.map(row => seasonToJellyfin(row, SeriesId, seriesName || detail?.title, serverId));
      this.seasonCache.set(String(SeriesId), { value: seasons, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
      while (this.seasonCache.size > DETAIL_CACHE_MAX) this.seasonCache.delete(this.seasonCache.keys().next().value);
      return seasons;
  }

  async getEpisodes({ SeriesId, SeasonId } = {}, refreshConfig = true) {
      if (refreshConfig) await this._configured(true);
      const seasons = await this.getSeasons(SeriesId, false);
      const season = seasons.find(row => row.Id === String(SeasonId)) || seasons.find(row => row.IndexNumber === Number(SeasonId));
      if (!season) return [];
      const body = await this._request(`catalog/series/${encodeURIComponent(String(SeriesId))}/seasons/${season.IndexNumber}/episodes`);
      if (!body || !Array.isArray(body.episodes)) throw new SiloRequestError('Invalid Silo episode response');
      const detail = this._cachedDetail(SeriesId);
      const serverId = await this._serverId();
      return body.episodes.map(row => episodeToJellyfin(row, SeriesId, season.Id, season.SeriesName || detail?.title, serverId));
  }

  async getRecentlyAdded({ libraryid, limit = 20 } = {}) {
    try {
      await this._configured(true);
      const items = await this._catalogSlice({ libraryId: libraryid, startIndex: 0, limit, recent: true });
      const serverId = await this._serverId();
      const result = items.map(row => itemToJellyfin(row, serverId));
      await forEachLimited(result, 6, item => this._attachMediaSources(item));
      return result;
    } catch { return []; }
  }

  async getItemInfo({ itemID } = {}) {
    try {
      await this._configured(true);
      const detail = await this._detail(itemID);
      return Array.isArray(detail.versions) ? detail.versions.map(version => versionToMediaSource(version, detail.content_id)) : [];
    } catch { return []; }
  }

  async getImageUrl(itemId, type = 'Primary') {
    try {
      await this._configured(true);
      if (!itemId || /^https?:\/\//i.test(String(itemId))) return null;
      try {
        const detail = await this._detail(itemId);
        return String(type).toLowerCase() === 'backdrop' ? (detail.backdrop_url || null) : (detail.poster_url || detail.still_url || null);
      } catch (error) {
        const library = (await this.getLibraries()).find(row => String(row.Id) === String(itemId));
        return library?.SiloPosterUrl || await this.getLibraryPosterUrl({ id: itemId, waitIfMissing: true }) || null;
      }
    } catch { return null; }
  }

  _publicAssetUrl(value) {
    if (!value || ['none', 'null', 'undefined'].includes(String(value).trim().toLowerCase())) return null;
    try {
      const root = String(this.config?.base || '').replace(/\/api\/v[12]$/, '/');
      const url = new URL(String(value), root || undefined);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href;
    } catch {}
    return null;
  }

  async getUserImageUrl(userId) {
    try {
      await this._configured(true);
      const key = String(userId || '');
      const cached = this.userImageCache.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      const rows = await this._request('admin/users');
      const row = Array.isArray(rows) ? rows.find(user => String(user.id) === key) : null;
      let imageUrl = this._publicAssetUrl(row?.avatar_url || row?.avatar || row?.image_url || row?.profile_image_url);
      if (!imageUrl) {
        const profiles = await this._request('profiles').catch(() => null);
        const list = Array.isArray(profiles?.profiles) ? profiles.profiles : Array.isArray(profiles?.items) ? profiles.items : [];
        const profile = list.find(item => String(item.user_id || item.account_id || item.owner_user_id || '') === key) || (list.length === 1 ? list[0] : null);
        imageUrl = this._publicAssetUrl(profile?.avatar_url || profile?.avatar);
      }
      this.userImageCache.set(key, { value: imageUrl, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
      while (this.userImageCache.size > DETAIL_CACHE_MAX) this.userImageCache.delete(this.userImageCache.keys().next().value);
      return imageUrl;
    } catch { return null; }
  }
  async getInstalledPlugins() { return []; }
  async StatsSubmitCustomQuery() { throw new Error('Custom statistics queries are not supported by Silo'); }
}

module.exports = SiloAPI;
module.exports.SiloRequestError = SiloRequestError;
