const { createPoller } = require('./silo-activity');
const { createActivityStore } = require('../classes/silo-activity-store');

function startSiloActivityMonitor() {
  const db = require('../db');
  const api = require('../classes/api-loader');
  const Config = require('../classes/config');
  const { sendUpdate } = require('../ws');
  const status = require('../classes/session-status');
  const interval = Math.max(1000, Math.min(60000, Number(process.env.SILO_POLL_INTERVAL_MS) || 5000));
  const store = createActivityStore(db.pool, {
    maxGapSeconds: interval * 3 / 1000,
    onCompleted: async () => {
      await Promise.all(db.materializedViews.map(view => db.refreshMaterializedView(view)));
    },
  });
  const poll = createPoller({ api, getConfig: () => new Config().getConfig(), store,
    publish: async (tag, payload) => {
      if (tag === 'session-status') status.set(payload);
      await sendUpdate(tag, payload);
    },
  });
  // Single-flight protection inside poll bounds requests even if a server is slow.
  const timer = setInterval(poll, interval);
  void poll();
  return () => clearInterval(timer);
}

module.exports = { startSiloActivityMonitor };
