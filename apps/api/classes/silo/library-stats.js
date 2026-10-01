'use strict';

// Silo v2 has no per-library play or storage totals, so Barracks derives them from
// playback history and the per-title file/version endpoints.

function sinceInterval(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(totalSeconds / 86400), hours: Math.floor(totalSeconds / 3600) % 24,
    minutes: Math.floor(totalSeconds / 60) % 60, seconds: totalSeconds % 60 };
}

function libraryIdsForPlay(row, files) {
  const played = files.find(file => file?.id !== undefined && String(file.id) === String(row.media_file_id));
  if (played?.library_id != null) return [String(played.library_id)];
  return [...new Set(files.filter(file => file?.library_id != null).map(file => String(file.library_id)))];
}

// rows: raw Silo playback-history items; filesByItem: Map<media_item_id, Silo file rows with library_id>.
// A play counts toward the library of the file that was played, or every library holding the title.
function summarizeLibraryPlays(rows, filesByItem, now = Date.now()) {
  const stats = {};
  for (const row of rows) {
    const at = Date.parse(row.ended_at || row.started_at || '');
    for (const libraryId of libraryIdsForPlay(row, filesByItem.get(String(row.media_item_id || '')) || [])) {
      const entry = stats[libraryId] ||= { Plays: 0, total_playback_duration: 0, lastAt: -Infinity, ItemName: null, ItemId: null };
      entry.Plays += 1;
      entry.total_playback_duration += Math.max(0, Number(row.watched_seconds) || 0);
      if (Number.isFinite(at) && at > entry.lastAt) Object.assign(entry, { lastAt: at, ItemName: row.media_title || null, ItemId: row.media_item_id });
    }
  }
  for (const entry of Object.values(stats)) {
    entry.total_playback_duration = Math.round(entry.total_playback_duration);
    entry.LastActivity = Number.isFinite(entry.lastAt) ? sinceInterval(now - entry.lastAt) : null;
    delete entry.lastAt;
  }
  return stats;
}

// A stored measurement is stale once Silo reports a scan newer than the one it was taken after.
function storageNeedsRefresh(stored, library) {
  if (!stored?.updatedAt) return true;
  return Boolean(library?.LastScannedAt) && stored.scannedAt !== library.LastScannedAt;
}

function versionBytes(version) {
  const value = Number(version?.file_size ?? version?.size ?? version?.bytes);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// Counts the library's files (one lookup per movie or series) and, for movie libraries, sums the
// sizes of versions stored in this library (a title can have copies in several libraries).
// Titles are walked one at a time with pauseMs per call so the job never trips Silo's rate limit,
// which would otherwise fail every other Barracks request until the backoff ends.
// complete=false means the deadline cut the walk short.
async function measureLibraryStorage({ libraryId, measureSize, catalogPage, itemFiles, itemVersions, deadlineAt, pauseMs = 0 }) {
  const key = String(libraryId);
  const pause = calls => (pauseMs > 0 ? new Promise(resolve => setTimeout(resolve, pauseMs * calls)) : null);
  let files = 0;
  let size = 0;
  let offset = 0;
  while (Date.now() < deadlineAt) {
    const page = await catalogPage({ startIndex: offset, limit: 100, deadlineAt });
    await pause(1);
    const items = Array.isArray(page?.items) ? page.items : [];
    for (const item of items) {
      if (Date.now() >= deadlineAt) return { files, size: measureSize ? size : null, complete: false };
      const own = (await itemFiles(item.content_id, deadlineAt) || []).filter(file => String(file?.library_id) === key);
      files += own.length;
      if (measureSize && own.length) {
        const ownIds = new Set(own.map(file => String(file.id)));
        for (const version of await itemVersions(item.content_id, deadlineAt) || []) {
          if (ownIds.has(String(version?.file_id))) size += versionBytes(version);
        }
      }
      await pause(measureSize && own.length ? 2 : 1);
    }
    offset += items.length;
    if (!page?.has_more || items.length === 0) return { files, size: measureSize ? size : null, complete: true };
  }
  return { files, size: measureSize ? size : null, complete: false };
}

module.exports = { summarizeLibraryPlays, storageNeedsRefresh, measureLibraryStorage };
