'use strict';

const { createHash } = require('node:crypto');

const {
  isEpisodeSession, sessionToJellyfin, userToJellyfin, libraryToJellyfin, itemToJellyfin,
  seasonToJellyfin, episodeToJellyfin, versionToMediaSource, forEachLimited,
} = require('./silo/mappers');
const { SiloRequestError, normalizeBase, requestJSON } = require('./silo/http');

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
    this.fetch = options.fetch || globalThis.fetch;
    this.httpClient = options.httpClient;
    this.getConfig = options.getConfig || (async () => {
      const Config = require('./config');
      return new Config().getConfig();
    });
    this.detailCache = new Map();
    this.detailFailureCache = new Map();
    this.seasonCache = new Map();
    this.serverInfoCache = null;
  }

  _clearUpstreamCaches() {
    this.detailCache.clear();
    this.detailFailureCache.clear();
    this.seasonCache.clear();
    this.serverInfoCache = null;
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
    if (this.config && (this.config.base !== next.base || this.config.key !== next.key)) this._clearUpstreamCaches();
    this.config = next;
    return this.config;
  }

  async _rawRequest(path, { base, key } = {}) {
    const settings = base ? { base: normalizeBase(base), key: String(key || '') } : await this._configured();
    return requestJSON({ path, base: settings.base, key: settings.key, timeoutMs: this.timeoutMs,
      fetchImpl: this.fetch, httpClient: this.httpClient, userAgent: this.userAgent });
  }

  async _request(path, options) { return (await this._rawRequest(path, options)).data; }

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

  async _detail(id) {
    if (!id || /^https?:\/\//i.test(String(id))) throw new SiloRequestError('Invalid Silo item ID', 400);
    const cached = this._cachedDetail(id);
    if (cached) return cached;
    const detail = await this._request(`catalog/items/${encodeURIComponent(String(id))}`);
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
    const fallback = `silo-${createHash('sha256').update(this.config.base).digest('hex').slice(0, 24)}`;
    try {
      const health = await this._request('health');
      const id = health?.server_id ? String(health.server_id) : fallback;
      this.serverInfoCache = { id };
      return id;
    } catch {
      this.serverInfoCache = { id: fallback };
      return fallback;
    }
  }

  async getSessions() {
    await this._configured(true);
    const rows = await this._request('admin/sessions');
    if (!Array.isArray(rows)) throw new SiloRequestError('Invalid Silo session response');
    const serverId = await this._serverId();
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
      try { details.set(id, await this._detail(id)); }
      catch {
        this.detailFailureCache.set(id, Date.now() + DETAIL_CACHE_TTL_MS);
        while (this.detailFailureCache.size > DETAIL_CACHE_MAX) this.detailFailureCache.delete(this.detailFailureCache.keys().next().value);
      }
    }));
    return rows.map(row => sessionToJellyfin(row, details.get(String(row.content_id)), serverId));
  }

  async validateSettings(url, apikey) {
    let cleanedUrl = '';
    try {
      cleanedUrl = normalizeBase(url);
      const health = await this._request('health', { base: cleanedUrl, key: apikey });
      if (!health || health.status !== 'ok') throw new SiloRequestError('Invalid Silo health response');
      const sessions = await this._request('admin/sessions', { base: cleanedUrl, key: apikey });
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
      if (!health || health.status !== 'ok') return {};
      return { Id: health.server_id || '', ServerName: health.server_name || 'Silo', Version: 'Silo' };
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

  async _catalogPage({ libraryId, startIndex = 0, limit = 100, recent = false }) {
    const query = new URLSearchParams({ offset: String(Math.max(0, startIndex)), limit: String(Math.min(100, Math.max(1, limit))) });
    if (libraryId !== undefined && libraryId !== null) query.set('library_id', String(libraryId));
    if (recent) { query.set('sort', 'added_at'); query.set('order', 'desc'); }
    const body = await this._request(`catalog?${query}`);
    if (!body || !Array.isArray(body.items)) throw new SiloRequestError('Invalid Silo catalog response');
    return body;
  }

  async _catalogSlice({ libraryId, startIndex, limit, recent = false }) {
    const result = [];
    let offset = Math.max(0, startIndex);
    while (result.length < limit) {
      const pageLimit = Math.min(100, limit - result.length);
      const page = await this._catalogPage({ libraryId, startIndex: offset, limit: pageLimit, recent });
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
      const seasons = await this.getSeasons(row.content_id, false);
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

  async getSeasons(SeriesId, refreshConfig = true) {
      if (refreshConfig) await this._configured(true);
      const cached = this.seasonCache.get(String(SeriesId));
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      const body = await this._request(`catalog/series/${encodeURIComponent(String(SeriesId))}/seasons`);
      if (!body || !Array.isArray(body.seasons)) throw new SiloRequestError('Invalid Silo season response');
      const detail = this._cachedDetail(SeriesId);
      const serverId = await this._serverId();
      const seasons = body.seasons.map(row => seasonToJellyfin(row, SeriesId, detail?.title, serverId));
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
      return body.episodes.map(row => episodeToJellyfin(row, SeriesId, season.Id, detail?.title, serverId));
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
