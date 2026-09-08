'use strict';

const DEFAULT_STALE_AFTER_MS = 20_000;
const MAX_CONCURRENCY = 4;

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function copyValue(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const result = [];
    seen.set(value, result);
    for (const item of value) result.push(copyValue(item, seen));
    return result;
  }
  const result = {};
  seen.set(value, result);
  for (const key of Object.keys(value)) result[key] = copyValue(value[key], seen);
  return result;
}

function identityFor(server) {
  // Credentials are deliberately used only for cache identity and are never
  // copied into a snapshot or passed to publication.
  return `${String(server.url || '')}\u0000${String(server.apiKey || '')}`;
}

function enabled(server) {
  return server.enabled !== false;
}

function isoTime(value) {
  try { return new Date(value).toISOString(); } catch { return null; }
}

function createFleet({
  listServers,
  createClient,
  publish,
  now = Date.now,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
} = {}) {
  if (typeof listServers !== 'function') throw new TypeError('listServers is required');
  if (typeof createClient !== 'function') throw new TypeError('createClient is required');

  const records = new Map();
  const queue = [];
  let running = 0;
  let registryFailure = false;

  function currentTime() {
    const value = Number(now());
    return Number.isFinite(value) ? value : Date.now();
  }

  function currentRecord(record) {
    return records.get(record.id) === record && !record.removed;
  }

  function currentJob(job) {
    const record = job.record;
    return currentRecord(record) && enabled(record.server)
      && record.generation === job.generation && record.identity === job.identity;
  }

  function newRecord(server) {
    return {
      id: String(server.id),
      server,
      identity: identityFor(server),
      generation: 0,
      state: enabled(server) ? 'connecting' : 'disabled',
      client: null,
      rawSessions: [],
      lastSuccessMs: null,
      failed: false,
      job: null,
      rerun: false,
      rerunWaiters: [],
      removed: false,
    };
  }

  function resetRecord(record, server, nextState = enabled(server) ? 'connecting' : 'disabled') {
    record.server = server;
    record.identity = identityFor(server);
    record.generation += 1;
    record.state = nextState;
    record.client = null;
    record.rawSessions = [];
    record.lastSuccessMs = null;
    record.failed = false;
  }

  function normalizeRegistry(rows) {
    if (!Array.isArray(rows)) throw new TypeError('Invalid server registry');
    const result = [];
    const ids = new Set();
    for (const row of rows) {
      if (!row || row.id === undefined || row.id === null || String(row.id) === '') {
        throw new TypeError('Invalid server registry');
      }
      const id = String(row.id);
      if (ids.has(id)) throw new TypeError('Invalid server registry');
      ids.add(id);
      result.push({ ...row, id });
    }
    return result;
  }

  function reconcile(rows) {
    const incoming = new Map(rows.map(server => [String(server.id), server]));
    for (const [id, record] of records) {
      if (incoming.has(id)) continue;
      record.generation += 1;
      record.removed = true;
      record.rerun = false;
      for (const waiter of record.rerunWaiters.splice(0)) waiter();
      records.delete(id);
    }
    for (const [id, server] of incoming) {
      const existing = records.get(id);
      if (!existing) {
        records.set(id, newRecord(server));
        continue;
      }
      const nextIdentity = identityFor(server);
      const wasEnabled = enabled(existing.server);
      const isEnabled = enabled(server);
      existing.server = server;
      if (existing.identity !== nextIdentity || wasEnabled !== isEnabled) {
        resetRecord(existing, server);
      } else {
        // Labels and primary flags can change without invalidating a client.
        existing.server = server;
        if (!isEnabled) existing.state = 'disabled';
      }
    }
  }

  function markRegistryUnavailable() {
    registryFailure = true;
    for (const record of records.values()) {
      if (enabled(record.server)) {
        // A registry outage makes the current membership/configuration
        // unverifiable. Invalidate any older response before publishing.
        record.generation += 1;
        record.state = 'unavailable';
        record.failed = true;
      }
    }
  }

  function markStale(record, time) {
    return record.state === 'unavailable'
      || (record.lastSuccessMs !== null && time - record.lastSuccessMs > staleAfterMs);
  }

  function decoratedSessions(record, stale) {
    return record.rawSessions.map((session, index) => {
      const result = copyValue(session);
      const nativeId = session && session.Id !== undefined && session.Id !== null
        ? String(session.Id) : String(index);
      if (!result || typeof result !== 'object') {
        return {
          Value: result,
          FleetServerId: record.id,
          FleetServerName: String(record.server.name || record.id),
          FleetSessionId: `${record.id}:${nativeId}`,
          stale: Boolean(stale),
        };
      }
      result.FleetServerId = record.id;
      result.FleetServerName = String(record.server.name || record.id);
      result.FleetSessionId = `${record.id}:${nativeId}`;
      result.stale = Boolean(stale);
      return result;
    });
  }

  function serverSnapshot(record, time) {
    const isDisabled = !enabled(record.server);
    const stale = !isDisabled && markStale(record, time);
    const state = isDisabled ? 'disabled' : stale ? 'unavailable' : record.state;
    const sessions = isDisabled ? [] : decoratedSessions(record, stale);
    let activeStreams = null;
    let playingStreams = null;
    let pausedStreams = null;
    if (state === 'disabled') {
      activeStreams = 0;
      playingStreams = 0;
      pausedStreams = 0;
    } else if (state === 'connected') {
      const active = sessions.filter(session => session && session.NowPlayingItem);
      activeStreams = active.length;
      pausedStreams = active.filter(session => Boolean(session.PlayState?.IsPaused)).length;
      playingStreams = activeStreams - pausedStreams;
    }
    return {
      id: record.id,
      name: String(record.server.name || record.id),
      isPrimary: Boolean(record.server.isPrimary),
      enabled: !isDisabled,
      state,
      lastSuccessAt: record.lastSuccessMs === null ? null : isoTime(record.lastSuccessMs),
      activeStreams,
      playingStreams,
      pausedStreams,
      sessions,
      connection: record.client?.getConnectionInfo?.() || null,
    };
  }

  function snapshot() {
    const time = currentTime();
    const servers = [...records.values()].map(record => serverSnapshot(record, time));
    const aggregate = servers.reduce((totals, server) => {
      if (server.state === 'connected') {
        totals.totalActiveStreams += server.activeStreams;
        totals.playingStreams += server.playingStreams;
        totals.pausedStreams += server.pausedStreams;
      }
      if (server.enabled && server.state !== 'connected') totals.partial = true;
      return totals;
    }, { totalActiveStreams: 0, playingStreams: 0, pausedStreams: 0, partial: registryFailure });
    return {
      updatedAt: isoTime(time),
      totalActiveStreams: aggregate.totalActiveStreams,
      playingStreams: aggregate.playingStreams,
      pausedStreams: aggregate.pausedStreams,
      partial: aggregate.partial,
      servers,
    };
  }

  async function safePublish() {
    if (typeof publish !== 'function') return;
    try { await publish(snapshot()); } catch { /* publication is downstream state */ }
  }

  function releaseRerun(record) {
    const waiters = record.rerunWaiters.splice(0);
    for (const waiter of waiters) waiter();
  }

  function startPoll(record) {
    const pending = deferred();
    const job = {
      record,
      generation: record.generation,
      identity: record.identity,
      promise: pending.promise,
      resolve: pending.resolve,
    };
    record.job = job;
    queue.push(job);
    pump();
    return job.promise;
  }

  function requestPoll(record) {
    if (!enabled(record.server)) return Promise.resolve();
    if (record.job) {
      if (record.job.generation === record.generation && record.job.identity === record.identity) {
        return record.job.promise;
      }
      record.rerun = true;
      if (!record.rerunPromise) {
        record.rerunPromise = new Promise(resolve => record.rerunWaiters.push(resolve));
      }
      return record.rerunPromise;
    }
    return startPoll(record);
  }

  async function poll(job) {
    const record = job.record;
    if (!currentJob(job)) return;
    try {
      const client = record.client || await createClient({ ...job.record.server });
      if (!client || typeof client.getSessions !== 'function') throw new TypeError('Invalid Silo client');
      if (!currentJob(job)) return;
      record.client = client;
      const sessions = await client.getSessions();
      if (!Array.isArray(sessions)) throw new TypeError('Invalid Silo session response');
      if (!currentJob(job)) return;
      record.rawSessions = sessions.map(session => copyValue(session));
      record.lastSuccessMs = currentTime();
      record.failed = false;
      record.state = 'connected';
      await safePublish();
    } catch {
      if (!currentJob(job)) return;
      record.failed = true;
      record.state = 'unavailable';
      await safePublish();
    }
  }

  function complete(job) {
    const record = job.record;
    if (record.job === job) record.job = null;
    job.resolve();
    if (record.rerun) {
      record.rerun = false;
      record.rerunPromise = null;
      if (currentRecord(record) && enabled(record.server)) {
        const rerun = startPoll(record);
        rerun.then(() => releaseRerun(record));
      } else {
        releaseRerun(record);
      }
    }
  }

  function pump() {
    while (running < MAX_CONCURRENCY && queue.length) {
      const job = queue.shift();
      if (!job || !currentJob(job)) {
        if (job) complete(job);
        continue;
      }
      running += 1;
      poll(job).finally(() => {
        running -= 1;
        complete(job);
        pump();
      });
    }
  }

  async function refresh() {
    let rows;
    try {
      rows = normalizeRegistry(await listServers());
      registryFailure = false;
      reconcile(rows);
    } catch {
      markRegistryUnavailable();
      await safePublish();
      return snapshot();
    }

    // Publish the connecting/disabled view immediately, then await this
    // refresh's work. Each job publishes independently as soon as it settles.
    await safePublish();
    const jobs = [];
    for (const record of records.values()) {
      if (enabled(record.server)) jobs.push(requestPoll(record));
    }
    await Promise.allSettled(jobs);
    return snapshot();
  }

  function invalidate(id) {
    const record = records.get(String(id));
    if (!record) return;
    record.generation += 1;
    record.identity = identityFor(record.server);
    record.client = null;
    record.rawSessions = [];
    record.lastSuccessMs = null;
    record.failed = false;
    record.state = enabled(record.server) ? 'connecting' : 'disabled';
  }

  return { refresh, snapshot, invalidate };
}

module.exports = { createFleet };
