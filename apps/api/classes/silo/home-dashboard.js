// Read-only aggregates over Silo's retained history, never the Jellyfin SQL tables.
const UNAVAILABLE_SECTIONS = ['library', 'catalog', 'milestones', 'trends', 'issues', 'watchParty', 'seasonGaps', 'automation'];

async function loadHomeHistory(request, { maxPages = 10 } = {}) {
  const rows = [];
  const cursors = new Set();
  let cursor;
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const body = await request(`admin/playback-history?${query}`);
    if (!Array.isArray(body?.items) || typeof body?.page?.has_more !== 'boolean') {
      throw new Error('Invalid Silo playback history response');
    }
    rows.push(...body.items);
    if (!body.page.has_more) return { rows, truncated: false };
    cursor = body.page.next_cursor;
    if (typeof cursor !== 'string' || !cursor || cursors.has(cursor)) {
      throw new Error('Invalid Silo playback history cursor');
    }
    cursors.add(cursor);
  }
  return { rows, truncated: true };
}

function buildHomeDashboard({ rows, truncated }, { excludedUsers = [], now = Date.now() } = {}) {
  const excluded = new Set(excludedUsers.map(String));
  const seen = new Set();
  const users = new Map();
  const weeklyUsers = new Map();
  const weeklyItems = new Map();
  const peakHours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  let totalPlaybacks = 0;
  let totalWatchSeconds = 0;
  let oldest = null;
  function add(map, key, value, seconds) {
    const entry = map.get(key) || { ...value, plays: 0, watchSeconds: 0 };
    entry.plays += 1;
    entry.watchSeconds += seconds;
    map.set(key, entry);
  }
  for (const row of rows) {
    if (!row.session_id || seen.has(String(row.session_id)) || excluded.has(String(row.user_id))) continue;
    seen.add(String(row.session_id));
    const duration = Number(row.watched_seconds);
    const seconds = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    const date = new Date(row.ended_at || row.started_at);
    const time = date.getTime();
    const user = { userId: String(row.user_id), userName: row.username || 'Unknown user' };
    totalPlaybacks += 1;
    totalWatchSeconds += seconds;
    add(users, user.userId, user, seconds);
    if (Number.isFinite(time)) {
      peakHours[date.getUTCHours()].count += 1;
      oldest = oldest === null ? time : Math.min(oldest, time);
      if (time >= now - 7 * 86400000 && time <= now) {
        add(weeklyUsers, user.userId, user, seconds);
        // Do not merge different items simply because they share a title.
        add(weeklyItems, String(row.media_item_id || row.media_title || row.session_id), {
          itemId: row.media_item_id, name: row.media_title || 'Unknown item',
        }, seconds);
      }
    }
  }
  const ranked = map => [...map.values()].sort((a, b) => b.plays - a.plays || b.watchSeconds - a.watchSeconds);
  return {
    source: 'silo',
    history: { retentionManaged: true, truncated, sampledRows: rows.length,
      oldest: oldest === null ? null : new Date(oldest).toISOString(), timeZone: 'UTC' },
    unavailableSections: UNAVAILABLE_SECTIONS,
    totals: { totalPlaybacks, totalWatchSeconds, uniqueViewers: users.size },
    peakHours,
    hallOfFame: ranked(users).slice(0, 5),
    weekPulse: { topItem: ranked(weeklyItems)[0] || null, mostActiveViewer: ranked(weeklyUsers)[0] || null, quietUsers: [] },
  };
}

function buildNativeHomeDashboard({ stats, playback, top }) {
  const reliability = playback.reliability || {};
  const peakHours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const bucket of playback.buckets || []) {
    const date = new Date(bucket.hour);
    if (!Number.isNaN(date.getTime())) {
      peakHours[date.getUTCHours()].count += Number(bucket.direct || 0) + Number(bucket.remux || 0) + Number(bucket.transcode || 0);
    }
  }
  const profiles = (top.profiles || []).map(row => ({
    userId: String(row.user_id || ''), userName: row.profile_name || row.username || 'Unknown profile',
    accountName: row.username || '', profileId: String(row.profile_id || ''),
    plays: Number(row.plays || 0), watchSeconds: Number(row.total_seconds || 0),
  }));
  const titles = (top.titles || []).map(row => ({ itemId: String(row.media_item_id || ''),
    name: row.title || 'Unknown item', mediaType: row.media_type || '', plays: Number(row.plays || 0),
    watchSeconds: Number(row.total_seconds || 0) }));
  return {
    source: 'silo-native',
    history: { retentionManaged: true, from: playback.from, to: playback.to,
      hours: Number(playback.hours || 0), days: Number(top.days || 0), timeZone: 'UTC' },
    unavailableSections: ['library', 'milestones', 'trends', 'issues', 'watchParty', 'seasonGaps', 'automation'],
    totals: { totalPlaybacks: Number(reliability.sessions_started || 0),
      finalizedPlaybacks: Number(reliability.finalized_sessions || 0),
      completedPlaybacks: Number(reliability.completed_sessions || 0),
      completionRate: Number(reliability.completion_rate || 0),
      totalWatchSeconds: null, uniqueViewers: Number(reliability.unique_profiles || playback.profiles_active_24h || 0) },
    peakHours,
    hallOfFame: profiles.slice(0, 5),
    weekPulse: { topItem: titles[0] || null, mostActiveViewer: profiles[0] || null, quietUsers: [] },
    catalog: { movies: Number(stats.total_movies || 0), shows: Number(stats.total_shows || 0),
      episodes: 0, showFiles: Number(stats.total_show_files || 0), movieFiles: Number(stats.total_movie_files || 0),
      artists: 0, activeLibraries: null, size: Number(stats.total_storage_bytes || 0),
      totalItems: Number(stats.total_items || 0), totalFiles: Number(stats.total_files || 0) },
    reliability,
  };
}

module.exports = { loadHomeHistory, buildHomeDashboard, buildNativeHomeDashboard };
