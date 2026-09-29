import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import useFleet from '../../../lib/use-fleet';
import { normalizeSessions } from '../../../lib/session-cache';
import { summarizeFleet } from '../../../lib/fleet-summary';
import { getActiveSessionIpPrivacy, shouldHideActiveSessionIp, ACTIVE_SESSION_IP_PRIVACY_EVENT } from '../../../lib/privacy-settings';
import SessionCard from './session-card';
import ErrorBoundary from '../general/ErrorBoundary';
import '../../css/fleet.css';

export default function FleetOverview({ surface = 'home', canControl = false }) {
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
  const s = summarizeFleet(snapshot, selected, error);
  const visible = s.visibleServers;
  const streams = visible.flatMap(server => normalizeSessions(server.sessions || []).map(session => ({ server, session })));
  const card = ({ server, session }) => <SessionCard data={{ session: { ...session, FleetServerId: server.id } }}
    hideIpAddress={shouldHideActiveSessionIp(surface, privacy)} kiosk={surface === 'kiosk'}
    canControl={canControl && server.state === 'connected' && !session.stale} />;
  // One server: render the plain upstream sessions widget; fleet chrome only earns its space with several servers.
  if (servers.filter(server => server.enabled).length <= 1) {
    if (!snapshot && !error) return <div className="sessions-widget sessions-widget-loading">
      <h1 className="my-3">Active Sessions</h1>
      <div className="sessions-loading-strip" aria-hidden="true"><span /><span /></div>
    </div>;
    if (snapshot && s.noServers) return <div className="sessions-widget">
      <h1 className="my-3">Active Sessions</h1>
      <div className="sessions-empty-state">No Silo servers are enabled.{surface !== 'kiosk' && <> <Link to="/settings/servers">Manage servers</Link></>}</div>
    </div>;
    const unavailable = Boolean(error) || (visible[0] && visible[0].state !== 'connected');
    return <div className="sessions-widget">
      <h1 className="my-3">Active Sessions</h1>
      {unavailable && <p role="status" className="fleet-notice">{error || (streams.length ? 'Your Silo server is unavailable. Showing last-known activity.' : 'Your Silo server is unavailable.')} <button onClick={refresh}>Retry</button></p>}
      {streams.length === 0
        ? !unavailable && <div className="sessions-empty-state">No Active Sessions Found</div>
        : <div className="sessions-container">{streams.map(stream =>
          <ErrorBoundary key={`${stream.server.id}:${stream.session.Id}`}>{card(stream)}</ErrorBoundary>)}</div>}
    </div>;
  }
  const fleetStreams = s.visibleServers.flatMap(server => normalizeSessions(server.sessions || []).map(session => ({ server, session })));
  const kiosk = surface === 'kiosk';
  const showSummary = fleetStreams.length > 0 || s.partial;
  return <section className={`fleet-overview is-compact${fleetStreams.length ? '' : ' is-empty'}`} aria-label="All Silo servers">
    <header className="fleet-heading">
      <h1>Active Sessions</h1>
      {showSummary ? <p className="fleet-summary">
        <strong data-testid="fleet-total">{s.total ?? '—'}</strong>{' '}
        {error ? <span>Current total unavailable</span> : <>active{s.partial && s.total != null ? ' (partial)' : ''}
        {' · '}{s.playing ?? '—'} playing · {s.paused ?? '—'} paused · {s.connected}/{s.enabled} servers</>}
      </p> : <p className="fleet-summary is-empty">No Active Sessions Found</p>}
      <OverlayTrigger placement="bottom" overlay={<Tooltip id="fleet-note">Live activity includes all enabled servers. Paused streams are included in the total; stale streams are not. Playback History can be scoped to one connected server; library statistics remain primary-server scoped.</Tooltip>}>
        <button type="button" className="fleet-info-button" aria-label="About live activity across servers">ⓘ</button>
      </OverlayTrigger>
      {!kiosk && <Link to="/settings/servers" className="fleet-manage-link">Manage servers</Link>}
    </header>
    <div className="fleet-pills" role="group" aria-label="Show activity">
      {s.pills.map(pill => {
        const button = <button key={pill.id} type="button" className={`fleet-pill is-${pill.state}`} aria-pressed={pill.selected} onClick={() => setSelected(pill.id)}>
          {pill.state !== 'all' && <span className="fleet-pill-dot" aria-hidden="true" />}
          <span className="fleet-pill-label">{pill.label}</span>
          {pill.state === 'connecting' || pill.state === 'unavailable' ? <span className="visually-hidden">, {pill.state}</span> : null}
          <span className="fleet-pill-count">{pill.count ?? '—'}</span>
        </button>;
        return pill.state === 'connected' || pill.state === 'all' ? button
          : <OverlayTrigger key={pill.id} placement="bottom" overlay={<Tooltip id={`fleet-pill-${pill.id}`}>{pill.state === 'connecting' ? 'Connecting…' : 'Unavailable'}{pill.lastSuccessAt ? ` · Last seen ${new Date(pill.lastSuccessAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</Tooltip>}>{button}</OverlayTrigger>;
      })}
    </div>
    {error && <p role="status" className="fleet-notice">{error} <button onClick={refresh}>Retry</button></p>}
    {!error && snapshot?.partial && s.filter === 'all' && <p role="status" className="fleet-notice">Some servers are unavailable or still connecting. Last-known streams are labelled stale and excluded from the total.</p>}
    {fleetStreams.length > 0 && <div className="fleet-streams sessions-container">
      {fleetStreams.map(({ server, session }) => {
        const stale = session.stale || server.state !== 'connected' || Boolean(error);
        return <div key={`${server.id}:${session.Id}`} className="fleet-stream">
          <span className={`fleet-card-badge${stale ? ' is-stale' : ''}`}>{server.name}{stale && <><span className="visually-hidden">, </span><span className="fleet-card-badge-state">Stale · last known activity</span></>}</span>
          <ErrorBoundary>{card({ server, session })}</ErrorBoundary>
        </div>;
      })}
    </div>}
  </section>;
}
