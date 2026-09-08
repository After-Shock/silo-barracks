// Silo snapshots are authoritative only after a successful poll. Keep this module
// free of timers, database globals and network clients so lifecycle rules are testable.
const { createHash } = require('node:crypto');

function activityId(session) {
  return 'silo-' + createHash('sha256').update(JSON.stringify([session.ServerId, session.Id])).digest('hex');
}

function observedSeconds(previous, now, maxGapSeconds) {
  const last = Date.parse(previous.PlayState?.SiloObservedAt);
  const elapsed = (now - last) / 1000;
  // A restart or outage leaves an unknown interval; never infer it was watched.
  return !previous.IsPaused && elapsed >= 0 && elapsed <= maxGapSeconds ? elapsed : 0;
}

function planSnapshot(existing, sessions, { now = Date.now(), maxGapSeconds = 15 } = {}) {
  const timestamp = new Date(now).toISOString();
  const previous = new Map(existing.map(row => [row.ActivityId, row]));
  const active = [];
  const started = [];
  for (const session of sessions) {
    const id = activityId(session);
    const old = previous.get(id);
    previous.delete(id);
    const watched = Number(old?.PlayState?.SiloWatchedSeconds ?? old?.PlaybackDuration ?? 0)
      + (old ? observedSeconds(old, now, maxGapSeconds) : 0);
    const item = session.NowPlayingItem;
    const row = {
      Id: session.Id, ActivityId: id, IsPaused: Boolean(session.PlayState.IsPaused),
      UserId: session.UserId, UserName: session.UserName, Client: session.Client,
      DeviceName: session.DeviceName, DeviceId: session.DeviceId,
      ApplicationVersion: session.ApplicationVersion || '',
      NowPlayingItemId: item.SeriesId || item.Id, NowPlayingItemName: item.Name,
      EpisodeId: item.Type === 'Episode' ? item.Id : null,
      SeasonId: item.SeasonId || null, SeriesName: item.SeriesName || null,
      PlaybackDuration: Math.floor(watched), PlayMethod: session.PlayState.PlayMethod,
      ActivityDateInserted: timestamp, MediaStreams: item.MediaStreams || [],
      TranscodingInfo: session.TranscodingInfo || null,
      PlayState: { ...session.PlayState, SiloSessionId: session.Id,
        SiloProfileId: session.ProfileId || '', SiloProfileName: session.ProfileName || '',
        SiloObservedAt: timestamp, SiloWatchedSeconds: watched,
        SiloFirstObservedAt: old?.PlayState?.SiloFirstObservedAt || timestamp },
      OriginalContainer: item.Container || '', RemoteEndPoint: session.RemoteEndPoint || '',
      ServerId: session.ServerId || '',
    };
    active.push(row);
    if (!old) started.push(row);
  }
  const ended = [...previous.values()].map(row => ({ ...row,
    PlaybackDuration: Math.floor(Number(row.PlayState?.SiloWatchedSeconds ?? row.PlaybackDuration ?? 0)
      + observedSeconds(row, now, maxGapSeconds)),
    ActivityDateInserted: timestamp,
  }));
  return { active, started, ended };
}

function createPoller({ api, getConfig, store, publish, now = Date.now }) {
  let inFlight = false;
  let lastSuccessAt = null;
  let discontinuous = true;
  return async function poll() {
    if (inFlight) return;
    inFlight = true;
    try {
      const config = await getConfig();
      if (config.error || config.state !== 2) {
        discontinuous = true;
        await publish('session-status', { state: 'unconfigured', lastSuccessAt });
        return;
      }
      const sessions = await api.getSessions();
      if (!Array.isArray(sessions)) throw new Error('Invalid Silo session response');
      const excluded = new Set((config.settings?.ExcludedUsers || []).map(String));
      const tracked = sessions.filter(row => !excluded.has(row.UserId));
      const observedAt = now();
      lastSuccessAt = new Date(observedAt).toISOString();
      await publish('sessions', sessions);
      try {
        await store.applySnapshot(tracked, observedAt, { discontinuous });
        discontinuous = false;
      } catch {
        discontinuous = true;
        await publish('session-status', { state: 'storage-unavailable', lastSuccessAt,
          message: 'Live activity is current, but playback history could not be saved.' });
        return;
      }
      await publish('session-status', { state: 'connected', lastSuccessAt });
    } catch {
      discontinuous = true;
      // Never send [] here: that would erase the last good browser snapshot and
      // manufacture playback-ended events. Never expose upstream URLs or tokens.
      await publish('session-status', { state: 'unavailable', lastSuccessAt,
        message: 'Silo activity is unavailable. Showing the last successful update.' });
    } finally {
      inFlight = false;
    }
  };
}

module.exports = { planSnapshot, createPoller };
