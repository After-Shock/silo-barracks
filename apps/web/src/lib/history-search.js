// Labels for Silo history title-search results, and a guard so only the newest search response applies.
export function formatHistorySearchResult(result) {
  if (result?.type !== 'episode') return result?.year ? `${result.title} (${result.year})` : String(result?.title || '');
  const pad = (n) => String(n).padStart(2, '0');
  const code = result.seasonNumber != null && result.episodeNumber != null ? `S${pad(result.seasonNumber)}E${pad(result.episodeNumber)}` : '';
  return [result.seriesName, code, result.title].filter(Boolean).join(' · ');
}

export function createLatestRequest() {
  let current = 0;
  return { next: () => ++current, isLatest: (id) => id === current };
}
