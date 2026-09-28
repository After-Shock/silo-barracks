'use strict';

// Rebuilds the fs_get_user_activity timeline shape from Silo playback history.
// ponytail: scans the newest 500 attempts and resolves ≤100 episodes; raise the caps if users need deeper timelines.
const MAX_PAGES = 5;
const PAGE_SIZE = 100;
const MAX_EPISODE_LOOKUPS = 100;
const LOOKUP_BATCH = 10;

function historyToTimeline(rows, seriesById) {
  const groups = new Map();
  for (const row of rows) {
    const isEpisode = row.SiloMediaType === 'episode';
    const series = isEpisode ? seriesById.get(row.NowPlayingItemId) : null;
    const key = series ? `s:${series.seriesId}:${series.seasonName}` : `i:${row.NowPlayingItemId}`;
    const at = row.ActivityDateInserted;
    const group = groups.get(key) || {
      UserName: row.UserName, Title: series?.seriesTitle || row.NowPlayingItemName || '', episodes: new Set(),
      FirstActivityDate: at, LastActivityDate: at, TotalPlaybackDuration: 0,
      SeasonName: series?.seasonName || null, MediaType: series ? 'tvshows' : 'movies',
      NowPlayingItemId: series?.seriesId || row.NowPlayingItemId,
    };
    if (isEpisode) group.episodes.add(row.NowPlayingItemId);
    if (at < group.FirstActivityDate) group.FirstActivityDate = at;
    if (at > group.LastActivityDate) group.LastActivityDate = at;
    group.TotalPlaybackDuration += Number(row.PlaybackDuration) || 0;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ episodes, ...group }) => ({ ...group, EpisodeCount: episodes.size }))
    .sort((a, b) => (a.LastActivityDate < b.LastActivityDate ? 1 : a.LastActivityDate > b.LastActivityDate ? -1 : 0));
}

async function buildSiloTimeline(api, userId) {
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
  for (let i = 0; i < episodeIds.length; i += LOOKUP_BATCH) {
    await Promise.all(episodeIds.slice(i, i + LOOKUP_BATCH).map(async id => {
      try {
        const detail = await api._detail(id);
        if (detail?.series_id) {
          seriesById.set(id, { seriesTitle: detail.series_title || '', seriesId: String(detail.series_id),
            seasonName: detail.season_number != null ? `Season ${detail.season_number}` : null });
        }
      } catch { /* Unresolvable episodes stay as standalone entries. */ }
    }));
  }
  return historyToTimeline(rows, seriesById);
}

module.exports = { historyToTimeline, buildSiloTimeline };
