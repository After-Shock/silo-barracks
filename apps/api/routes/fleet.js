const express = require('express');
const { RegistryError } = require('../classes/silo-server-registry');
const { addAuditEntry } = require('../classes/admin-history');

function createFleetRouter({ registry, fleet }) {
  const router = express.Router();
  const historyFailure = error => error?.category === 'invalid_cursor'
    ? { status: 400, message: 'Silo playback history cursor expired or is invalid; restart from the first page' }
    : { status: error?.status || 503, message: error?.message || 'Unable to load Silo playback history.' };
  const recordAuditSafely = async (req, action, details) => {
    try { await addAuditEntry(req, action, details); }
    catch (error) { console.error(`[Silo Barracks] Audit logging failed for ${action}:`, error.message); }
  };
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/', (req, res) => req.permissions?.dashboard
    ? res.json(fleet.snapshot()) : res.status(403).json({ error: 'Dashboard access required.' }));
  router.get('/history/:serverId', async (req, res) => {
    if (!req.permissions?.dashboard) return res.status(403).json({ error: 'Dashboard access required.' });
    try {
      const history = await fleet.playbackHistoryPage(req.params.serverId, {
        limit: req.query.size, page: req.query.page, cursor: req.query.cursor, userId: req.query.user_id,
        profileId: req.query.profile_id, mediaItemId: req.query.media_item_id,
        completed: req.query.completed === undefined || req.query.completed === 'all' ? undefined : req.query.completed === 'true',
      });
      res.json({ current_page: history.currentPage, size: Number(req.query.size) || 10,
        sort: 'ActivityDateInserted', desc: true, results: history.results, has_more: history.hasMore,
        next_cursor: history.nextCursor, server_id: history.serverId, server_name: history.serverName,
        source: 'Silo retention', retention_managed_by: 'Silo' });
    } catch (error) {
      const failure = historyFailure(error);
      res.status(failure.status).json({ error: failure.message });
    }
  });
  router.get('/history/:serverId/users', async (req, res) => {
    if (!req.permissions?.dashboard) return res.status(403).json({ error: 'Dashboard access required.' });
    try { res.json(await fleet.playbackHistoryUsers(req.params.serverId)); }
    catch (error) { res.status(error.status || 503).json({ error: error.message || 'Unable to load Silo users.' }); }
  });
  router.get('/history/:serverId/users/:userId/profiles', async (req, res) => {
    if (!req.permissions?.dashboard) return res.status(403).json({ error: 'Dashboard access required.' });
    try { res.json(await fleet.playbackHistoryProfiles(req.params.serverId, req.params.userId)); }
    catch (error) { res.status(error.status || 503).json({ error: error.message || 'Unable to load Silo profiles.' }); }
  });
  router.get('/history/:serverId/libraries/:libraryId', async (req, res) => {
    if (!req.permissions?.dashboard) return res.status(403).json({ error: 'Dashboard access required.' });
    try {
      const history = await fleet.libraryHistoryPage(req.params.serverId, req.params.libraryId,
        { limit: req.query.size, cursor: req.query.cursor });
      res.json({ results: history.results, has_more: history.hasMore, next_cursor: history.nextCursor,
        server_id: history.serverId, server_name: history.serverName, source: 'Silo retention', coverage: history.coverage });
    } catch (error) { res.status(error.status || 503).json({ error: error.message || 'Unable to load Silo library history.' }); }
  });
  router.get('/libraries/:serverId', async (req, res) => {
    if (!req.permissions?.dashboard) return res.status(403).json({ error: 'Dashboard access required.' });
    try { res.json(await fleet.libraryList(req.params.serverId)); }
    catch (error) { res.status(error.status || 503).json({ error: error.message || 'Unable to load Silo libraries.' }); }
  });
  router.get('/libraries/:serverId/:libraryId', async (req, res) => {
    if (!req.permissions?.dashboard) return res.status(403).json({ error: 'Dashboard access required.' });
    try { res.json(await fleet.libraryDetail(req.params.serverId, req.params.libraryId)); }
    catch (error) { res.status(error.status || 503).json({ error: error.message || 'Unable to load Silo library.' }); }
  });
  router.get('/libraries/:serverId/:libraryId/items', async (req, res) => {
    if (!req.permissions?.dashboard) return res.status(403).json({ error: 'Dashboard access required.' });
    try { res.json(await fleet.libraryItems(req.params.serverId, req.params.libraryId, { page: req.query.page,
      limit: req.query.size, search: req.query.search, sort: req.query.sort,
      desc: req.query.desc === 'true' })); }
    catch (error) { res.status(error.status || 503).json({ error: error.message || 'Unable to load Silo library items.' }); }
  });
  router.get('/catalog/:serverId/items/:itemId', async (req, res) => {
    if (!req.permissions?.dashboard) return res.status(403).json({ error: 'Dashboard access required.' });
    try { res.json(await fleet.catalogItem(req.params.serverId, req.params.itemId)); }
    catch (error) { res.status(error.status || 503).json({ error: error.message || 'Unable to load Silo item.' }); }
  });
  router.get('/users/:serverId/:userId', async (req, res) => {
    if (!req.permissions?.dashboard) return res.status(403).json({ error: 'Dashboard access required.' });
    try { res.json(await fleet.historyUser(req.params.serverId, req.params.userId)); }
    catch (error) { res.status(error.status || 503).json({ error: error.message || 'Unable to load Silo account.' }); }
  });
  router.use('/sessions', (req, res, next) => {
    if (!req.permissions?.settings || !['Owner', 'Admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Barracks administrator role required.' });
    }
    next();
  });
  router.get('/sessions/:serverId/capabilities', async (req, res) => {
    try { res.json(await fleet.sessionCommandCapabilities(req.params.serverId)); }
    catch (error) { res.status(error.status || 503).json({ error: error.message || 'Playback controls are unavailable.' }); }
  });
  router.post('/sessions/:serverId/:sessionId/:action', async (req, res) => {
    const action = String(req.params.action || '').toLowerCase();
    if (!['pause', 'resume', 'stop', 'terminate', 'message'].includes(action)) {
      return res.status(400).json({ error: 'Unsupported playback command.' });
    }
    try {
      const result = await fleet.controlSession(req.params.serverId, req.params.sessionId, action, req.body || {});
      await recordAuditSafely(req, 'playback.command', { serverId: req.params.serverId,
        sessionId: req.params.sessionId, action, status: result.status });
      res.status(result.status === 202 ? 202 : 200).json(result);
    } catch (error) {
      await recordAuditSafely(req, 'playback.command.failed', { serverId: req.params.serverId,
        sessionId: req.params.sessionId, action, status: error.status || 503 });
      res.status(error.status || 503).json({ error: error.message || 'Playback command failed.' });
    }
  });
  router.use('/servers', (req, res, next) => req.permissions?.settings ? next() : res.status(403).json({ error: 'Settings access required.' }));
  const handle = action => async (req, res) => {
    try { await action(req, res); }
    catch (error) {
      res.status(error instanceof RegistryError ? error.status : 503).json({
        error: error instanceof RegistryError ? error.message : 'Server management is unavailable. Please try again.',
      });
    }
  };
  const refresh = id => {
    fleet.invalidate(id);
    void fleet.refresh().catch(() => {});
  };
  router.get('/servers', handle(async (_req, res) => {
    const connections = new Map(fleet.snapshot().servers?.map(server => [server.id, server.connection]) || []);
    res.json((await registry.listPublic()).map(server => ({ ...server, connection: connections.get(server.id) || null })));
  }));
  router.post('/servers', handle(async (req, res) => {
    const server = await registry.add(req.body || {});
    refresh(server.id);
    res.status(201).json(server);
  }));
  router.put('/servers/:id', handle(async (req, res) => {
    const server = await registry.update(req.params.id, req.body || {});
    refresh(server.id);
    res.json(server);
  }));
  router.delete('/servers/:id', handle(async (req, res) => {
    await registry.remove(req.params.id);
    refresh(req.params.id);
    res.status(204).end();
  }));
  return router;
}
module.exports = { createFleetRouter };
