'use strict';

const {
  isEpisodeSession, sessionToJellyfin, userToJellyfin, libraryToJellyfin, itemToJellyfin,
  seasonToJellyfin, episodeToJellyfin, versionToMediaSource, forEachLimited,
} = require('./silo/mappers');
const { SiloRequestError, normalizeBase, requestJSON } = require('./silo/http');
const { discoverSilo } = require('./silo/discovery');
const createV1 = require('./silo/v1');
const createV2 = require('./silo/v2');
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
    this.getConfig = options.getConfig || (async () => {
      const Config = require('./config');
      return new Config().getConfig();
    });
    this.detailCache = new Map();
    this.detailFailureCache = new Map();
    this.seasonCache = new Map();
    this.serverInfoCache = null;
    this.wirePromise = null;
    this.connectionInfo = null;
    this.backoffUntil = 0;
    this.capabilityCache = null;
  }

  _clearUpstreamCaches() {
    this.detailCache.clear();
    this.detailFailureCache.clear();
    this.seasonCache.clear();
    this.serverInfoCache = null;
    this.wirePromise = null;
    this.connectionInfo = null;
    this.backoffUntil = 0;
    this.capabilityCache = null;
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

  async _rawRequest(path, { base, key, timeoutMs = this.timeoutMs, apiMajor = 1, profileId } = {}) {
    const settings = base ? { base: normalizeBase(base), key: String(key || '') } : await this._configured();
    return requestJSON({ path, base: settings.base, key: settings.key, timeoutMs, apiMajor, profileId,
      fetchImpl: this.fetch, httpClient: this.httpClient, userAgent: this.userAgent });
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
        timeoutMs: Math.min(this.enrichmentTimeoutMs, 750) });
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

  async getLibraries() {
    await this._configured(true);
    const rows = await this._request('libraries');
    if (!Array.isArray(rows)) throw new SiloRequestError('Invalid Silo library response');
    const serverId = await this._serverId();
    return rows.map(row => libraryToJellyfin(row, serverId));
  }

  async _catalogPage({ libraryId, startIndex = 0, limit = 100, recent = false, deadlineAt }) {
    const query = new URLSearchParams({ offset: String(Math.max(0, startIndex)), limit: String(Math.min(100, Math.max(1, limit))) });
    if (libraryId !== undefined && libraryId !== null) query.set('library_id', String(libraryId));
    if (recent) { query.set('sort', 'added_at'); query.set('order', 'desc'); }
    const body = await this._request(`catalog?${query}`, { deadlineAt });
    if (!body || !Array.isArray(body.items)) throw new SiloRequestError('Invalid Silo catalog response');
    return body;
  }

  async _catalogSlice({ libraryId, startIndex, limit, recent = false }) {
    const result = [];
    let offset = Math.max(0, startIndex);
    const deadlineAt = Date.now() + this.timeoutMs;
    let pages = 0;
    while (result.length < limit) {
      if (++pages > this.maxPages) throw new SiloRequestError('Silo catalog page limit exceeded');
      const pageLimit = Math.min(100, limit - result.length);
      const page = await this._catalogPage({ libraryId, startIndex: offset, limit: pageLimit, recent, deadlineAt });
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
      const detail = await this._detail(itemId);
      return String(type).toLowerCase() === 'backdrop' ? (detail.backdrop_url || null) : (detail.poster_url || detail.still_url || null);
    } catch { return null; }
  }

  async getUserImageUrl() { return null; }
  async getInstalledPlugins() { return []; }
  async StatsSubmitCustomQuery() { throw new Error('Custom statistics queries are not supported by Silo'); }
}

module.exports = SiloAPI;
module.exports.SiloRequestError = SiloRequestError;
