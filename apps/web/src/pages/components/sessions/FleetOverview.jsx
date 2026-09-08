import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useFleet from '../../../lib/use-fleet';
import { normalizeSessions } from '../../../lib/session-cache';
import { getActiveSessionIpPrivacy, shouldHideActiveSessionIp, ACTIVE_SESSION_IP_PRIVACY_EVENT } from '../../../lib/privacy-settings';
import SessionCard from './session-card';
import ErrorBoundary from '../general/ErrorBoundary';
import '../../css/fleet.css';

export default function FleetOverview({ surface = 'home' }) {
  const { snapshot, error, refresh } = useFleet();
  const [selected, setSelected] = useState('all');
  const [privacy, setPrivacy] = useState(getActiveSessionIpPrivacy);
  useEffect(() => {
    const update = () => setPrivacy(getActiveSessionIpPrivacy());
    window.addEventListener(ACTIVE_SESSION_IP_PRIVACY_EVENT, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(ACTIVE_SESSION_IP_PRIVACY_EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  const servers = snapshot?.servers || [];
  const selectedServer = servers.find(server => server.id === selected);
  const filter = selectedServer ? selected : 'all';
  const visible = servers.filter(server => server.enabled && (filter === 'all' || server.id === filter));
  const count = filter === 'all' ? snapshot?.totalActiveStreams : selectedServer.activeStreams;
  const partial = Boolean(error || (filter === 'all' ? snapshot?.partial : selectedServer?.state !== 'connected'));
  const streams = visible.flatMap(server => normalizeSessions(server.sessions || []).map(session => ({ server, session })));
  return <section className="fleet-overview" aria-label="All Silo servers">
    <header className="fleet-heading">
      <div><span className="fleet-eyebrow">{filter === 'all' ? 'All servers' : selectedServer.name}</span><h1>Active Sessions</h1></div>
      <Link to="/settings/servers" className="fleet-manage-link">Manage servers</Link>
    </header>
    <div className="fleet-totals">
      <div><strong data-testid="fleet-total">{snapshot && !error ? (count ?? '—') : '—'}</strong><span>{error ? 'Current total unavailable' : partial ? 'Confirmed active streams · partial total' : 'Active streams'}</span></div>
      <div><strong>{servers.filter(server => server.enabled && server.state === 'connected').length} / {servers.filter(server => server.enabled).length}</strong><span>Servers connected</span></div>
      <div><strong>{filter === 'all' ? snapshot?.pausedStreams ?? '—' : selectedServer.pausedStreams ?? '—'}</strong><span>Paused · included in active</span></div>
    </div>
    {error && <p role="status" className="fleet-notice">{error} <button onClick={refresh}>Retry</button></p>}
    {!error && partial && <p role="status" className="fleet-notice">Some servers are unavailable or still connecting. Last-known streams are labelled stale and excluded from the total.</p>}
    <div className="fleet-server-grid">
      {servers.map(server => <button key={server.id} className={`fleet-server ${server.state}`} disabled={!server.enabled}
        aria-pressed={filter === server.id} onClick={() => setSelected(server.id)}>
        <span>{server.name}{server.isPrimary && <small>Primary</small>}</span>
        <strong>{server.activeStreams ?? '—'}</strong>
        <small>{server.state === 'connected' ? 'Connected' : server.state === 'disabled' ? 'Monitoring disabled' : server.state === 'connecting' ? 'Connecting…' : 'Unavailable'}</small>
        {server.lastSuccessAt && server.state !== 'connected' && <small>Last seen {new Date(server.lastSuccessAt).toLocaleTimeString()}</small>}
      </button>)}
    </div>
    <label className="fleet-filter">Show activity
      <select value={filter} onChange={event => setSelected(event.target.value)}>
        <option value="all">All servers</option>
        {servers.filter(server => server.enabled).map(server => <option key={server.id} value={server.id}>{server.name}</option>)}
      </select>
    </label>
    {!snapshot && <p role="status">Connecting to your Silo servers…</p>}
    {snapshot && streams.length === 0 && <p>{partial ? 'No current activity can be confirmed for this selection.' : 'No active streams on the selected servers.'}</p>}
    <div className="fleet-streams">
      {streams.map(({ server, session }) => <div key={`${server.id}:${session.Id}`} className="fleet-stream">
        <div className="fleet-source"><strong>{server.name}</strong>{(session.stale || server.state !== 'connected' || error) && <span>Stale · last known activity</span>}</div>
        <ErrorBoundary><SessionCard data={{ session: { ...session, FleetServerId: server.id } }} hideIpAddress={shouldHideActiveSessionIp(surface, privacy)} /></ErrorBoundary>
      </div>)}
    </div>
    {servers.length > 1 && <p className="fleet-footnote">Live activity includes all enabled servers. Saved history and library statistics currently belong to the primary server.</p>}
  </section>;
}
