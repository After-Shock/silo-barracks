// Display model for the multi-server Active Sessions widget.
export function summarizeFleet(snapshot, selectedId, error) {
  const enabledServers = (snapshot?.servers || []).filter((server) => server.enabled);
  const selected = enabledServers.find((server) => server.id === selectedId);
  const filter = selected ? selected.id : 'all';
  const ok = Boolean(snapshot) && !error;
  const total = !ok ? null : (filter === 'all' ? snapshot.totalActiveStreams : selected.activeStreams) ?? null;
  const paused = !ok ? null : (filter === 'all' ? snapshot.pausedStreams : selected.pausedStreams) ?? null;
  const playing = !ok ? null : (filter === 'all' ? snapshot.playingStreams : selected.playingStreams) ?? null;
  const partial = Boolean(error) || (filter === 'all' ? Boolean(snapshot?.partial) : selected.state !== 'connected');
  const pills = [
    { id: 'all', label: 'All', count: ok ? snapshot.totalActiveStreams ?? null : null, state: 'all', lastSuccessAt: null, isPrimary: false, selected: filter === 'all' },
    ...enabledServers.map((server) => ({
      // Without a fresh snapshot, per-server counts and states are last-known, not live.
      id: server.id, label: String(server.name || server.id), count: ok ? server.activeStreams ?? null : null,
      state: !ok ? 'unavailable' : server.state === 'connected' ? 'connected' : server.state === 'connecting' ? 'connecting' : 'unavailable',
      lastSuccessAt: server.lastSuccessAt || null, isPrimary: Boolean(server.isPrimary), selected: filter === server.id,
    })),
  ];
  return {
    filter, total, playing, paused, partial, pills,
    noServers: enabledServers.length === 0,
    connected: enabledServers.filter((server) => server.state === 'connected').length,
    enabled: enabledServers.length,
    visibleServers: enabledServers.filter((server) => filter === 'all' || server.id === filter),
  };
}
