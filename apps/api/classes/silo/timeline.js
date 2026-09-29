'use strict';

// Rebuilds the fs_get_user_activity timeline shape from Silo playback history.
// ponytail: scans the newest 500 attempts and resolves ≤100 episodes; raise the caps if users need deeper timelines.
const MAX_PAGES = 5;
const PAGE_SIZE = 100;
const MAX_EPISODE_LOOKUPS = 100;
const LOOKUP_BATCH = 10;

// Mirrors fs_get_user_activity: walk plays oldest-first and start a new run when the title
// changes or more than a month passes, then split each run by season.
function historyToTimeline(rows, seriesById) {
  const groups = new Map();
  let run = 0;
  let prevTitle;
  let prevAt;
  const ordered = [...rows].sort((a, b) => (a.ActivityDateInserted < b.ActivityDateInserted ? -1 : a.ActivityDateInserted > b.ActivityDateInserted ? 1 : 0));
  for (const row of ordered) {
    const isEpisode = row.SiloMediaType === 'episode';
    const series = isEpisode ? seriesById.get(row.NowPlayingItemId) : null;
    const title = series?.seriesTitle || row.NowPlayingItemName || '';
    const at = row.ActivityDateInserted;
    const gapLimit = prevAt ? new Date(prevAt) : null;
    if (gapLimit) gapLimit.setUTCMonth(gapLimit.getUTCMonth() + 1);
    if (title !== prevTitle || !gapLimit || new Date(at) > gapLimit) run += 1;
    prevTitle = title;
    prevAt = at;
    const key = `${run}:${series?.seasonName ?? ''}`;
    const group = groups.get(key) || {
      UserName: row.UserName, Title: title, episodes: new Set(),
      FirstActivityDate: at, LastActivityDate: at, TotalPlaybackDuration: 0,
      SeasonName: series?.seasonName || null, MediaType: series ? 'tvshows' : 'movies',
      NowPlayingItemId: series?.seriesId || row.NowPlayingItemId,
    };
    if (isEpisode) group.episodes.add(row.NowPlayingItemId);
    group.LastActivityDate = at;
    group.TotalPlaybackDuration += Number(row.PlaybackDuration) || 0;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ episodes, ...group }) => ({ ...group, EpisodeCount: episodes.size }))
    .sort((a, b) => (a.LastActivityDate < b.LastActivityDate ? 1 : a.LastActivityDate > b.LastActivityDate ? -1 : 0));
}

async function buildSiloTimeline(api, userId, { lookupBudgetMs = 8000 } = {}) {
  if (typeof userId !== 'string' || !userId.trim()) {
    throw Object.assign(new Error('A userId is required.'), { status: 400 });
  }
  const rows = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await api.getPlaybackHistoryPage({ limit: PAGE_SIZE, cursor, userId });
    rows.push(...result.results);
    if (!result.hasMore || !result.nextCursor) break;
    cursor = result.nextCursor;
  }
  const episodeIds = [...new Set(rows.filter(row => row.SiloMediaType === 'episode' && row.NowPlayingItemId)
    .map(row => row.NowPlayingItemId))].slice(0, MAX_EPISODE_LOOKUPS);
  const seriesById = new Map();
  // Lookups share one budget; anything unresolved when it runs out keeps its own title.
  const deadlineAt = Date.now() + lookupBudgetMs;
  const withinBudget = (promise) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), Math.max(0, deadlineAt - Date.now()));
    promise.then((value) => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(null); });
  });
  for (let i = 0; i < episodeIds.length && Date.now() < deadlineAt; i += LOOKUP_BATCH) {
    await Promise.all(episodeIds.slice(i, i + LOOKUP_BATCH).map(async id => {
      // withinBudget never rejects: unresolvable episodes come back null and stay standalone entries.
      const detail = await withinBudget(api._detail(id, { deadlineAt, timeoutMs: api.enrichmentTimeoutMs }));
      if (detail?.series_id) {
        seriesById.set(id, { seriesTitle: detail.series_title || '', seriesId: String(detail.series_id),
          seasonName: detail.season_number != null ? `Season ${detail.season_number}` : null });
      }
    }));
  }
  return historyToTimeline(rows, seriesById);
}

module.exports = { historyToTimeline, buildSiloTimeline };
