'use strict';
const { collection, allPages } = require('./pagination');
const { SiloRequestError } = require('./http');

module.exports = function createV2(rawRequest, { maxPages = 100 } = {}) {
  const windows = new Map();
  let profileCache;
  let profileInFlight;
  async function primaryProfile(timeoutMs) {
    if (profileCache?.expiresAt > Date.now()) return profileCache.id;
    if (!profileInFlight) {
      profileInFlight = (async () => {
        const body = collection(await rawRequest('profiles', { timeoutMs }));
        const primary = body.items.filter(profile => profile.is_primary === true);
        if (primary.length !== 1 || typeof primary[0].id !== 'string' || !primary[0].id) {
          throw new SiloRequestError('Silo account primary profile is unavailable');
        }
        profileCache = { id: primary[0].id, expiresAt: Date.now() + 60000 };
        return profileCache.id;
      })().finally(() => { profileInFlight = null; });
    }
    // A concurrent metadata caller can have a much shorter budget than the
    // catalog sync that started discovery. Do not inherit its longer wait.
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new SiloRequestError('Silo request timed out')), timeoutMs);
      profileInFlight.then(value => { clearTimeout(timer); resolve(value); },
        error => { clearTimeout(timer); reject(error); });
    });
  }
  async function request(path, options = {}) {
    if (!/^catalog(?:[/?]|$)/.test(path)) return rawRequest(path, options);
    const deadline = Math.min(options.deadlineAt || Infinity, Date.now() + (options.timeoutMs || 8000));
    const profileId = await primaryProfile(Math.max(1, deadline - Date.now()));
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new SiloRequestError('Silo request timed out');
    // Use only the key owner's explicit primary profile, never an active viewer
    // or a guessed child profile. Upstream still enforces all profile/PIN policy.
    return rawRequest(path, { ...options, profileId, timeoutMs: remaining });
  }
  async function catalogPage(path, options) {
    const legacy = new URLSearchParams(path.split('?')[1]);
    const offset = Number(legacy.get('offset') || 0);
    const query = new URLSearchParams(legacy);
    query.delete('offset');
    query.delete('order');
    query.set('limit', legacy.get('limit') || '100');
    if (legacy.get('sort') === 'added_at') query.set('sort', '-added_at');
    const scope = query.toString();
    const deadline = Date.now() + (options?.timeoutMs || 8000);
    const fetchPage = async q => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new SiloRequestError('Silo request timed out');
      return collection(await request(`catalog?${q}`, { ...options, timeoutMs: remaining }));
    };
    let cached = windows.get(scope);
    if (cached?.expiresAt < Date.now()) cached = null;
    let first;
    if (offset > 0 && !cached) {
      first = await fetchPage(query);
      cached = { cursor: first.window_cursor, expiresAt: Date.now() + 60000 };
    }
    if (offset > 0) {
      if (typeof cached?.cursor !== 'string' || !cached.cursor) throw new SiloRequestError('Invalid Silo catalog window cursor');
      query.set('cursor', cached.cursor); query.set('seek', String(offset));
    }
    const body = await fetchPage(query);
    if (typeof body.window_cursor === 'string' && body.window_cursor) {
      windows.delete(scope);
      windows.set(scope, { cursor: body.window_cursor, expiresAt: Date.now() + 60000 });
      while (windows.size > 32) windows.delete(windows.keys().next().value);
    }
    return { ...body, has_more: body.page?.has_more || false };
  }
  return { async read(path, options = {}) {
    if (path === 'admin/sessions' || path === 'admin/users') {
      return allPages(request, path, { ...options, maxPages, idField: path === 'admin/sessions' ? 'session_id' : 'id' });
    }
    if (path.startsWith('catalog?')) return catalogPage(path, options);
    const body = await request(path, options);
    if (path === 'libraries') return collection(body).items;
    if (/^catalog\/series\/[^/]+\/seasons$/.test(path)) return { seasons: collection(body).items };
    if (/^catalog\/series\/[^/]+\/seasons\/[^/]+\/episodes$/.test(path)) return { episodes: collection(body).items };
    return body;
  } };
};
