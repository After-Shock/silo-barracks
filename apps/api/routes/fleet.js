const express = require('express');
const { RegistryError } = require('../classes/silo-server-registry');

function createFleetRouter({ registry, fleet }) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/', (req, res) => req.permissions?.dashboard
    ? res.json(fleet.snapshot()) : res.status(403).json({ error: 'Dashboard access required.' }));
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
  router.get('/servers', handle(async (_req, res) => res.json(await registry.listPublic())));
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
