// Display model for the multi-server Active Sessions widget.
export function summarizeFleet(snapshot, selectedId, error) {
  const enabledServers = (snapshot?.servers || []).filter((server) => server.enabled);
  const selected = enabledServers.find((server) => server.id === selectedId);
  const filter = selected ? selected.id : 'all';
  const ok = Boolean(snapshot) && !error;
  const total = !ok ? null : (filter === 'all' ? snapshot.totalActiveStreams : selected.activeStreams) ?? null;
  const paused = !ok ? null : (filter === 'all' ? snapshot.pausedStreams : selected.pausedStreams) ?? null;
  const partial = Boolean(error) || (filter === 'all' ? Boolean(snapshot?.partial) : selected.state !== 'connected');
  const pills = [
    { id: 'all', label: 'All', count: ok ? snapshot.totalActiveStreams ?? null : null, state: 'all', lastSuccessAt: null, isPrimary: false, selected: filter === 'all' },
    ...enabledServers.map((server) => ({
      id: server.id, label: String(server.name || server.id), count: server.activeStreams ?? null,
      state: server.state === 'connected' ? 'connected' : server.state === 'connecting' ? 'connecting' : 'unavailable',
      lastSuccessAt: server.lastSuccessAt || null, isPrimary: Boolean(server.isPrimary), selected: filter === server.id,
    })),
  ];
  return {
    filter, total, paused, partial, pills,
    connected: enabledServers.filter((server) => server.state === 'connected').length,
    enabled: enabledServers.length,
    visibleServers: enabledServers.filter((server) => filter === 'all' || server.id === filter),
  };
}
