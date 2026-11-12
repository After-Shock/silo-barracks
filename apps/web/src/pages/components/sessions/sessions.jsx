import { useState, useEffect } from "react";
import Config from "../../../lib/config";
// import API from "../../../classes/jellyfin-api";

import "../../css/sessions.css";
import ErrorBoundary from "../general/ErrorBoundary";
import SessionCard from "./session-card";
import FleetOverview from './FleetOverview';
import SessionWall from "./session-wall";
import { orderSessions } from "../../../lib/session-order";

const SESSION_VIEW_KEY = "jellyglance_sessions_view";

function getStoredSessionView() {
  try {
    return localStorage.getItem(SESSION_VIEW_KEY) === "wall" ? "wall" : "cards";
  } catch {
    return "cards";
  }
}

import socket from "../../../socket";
import {
  cacheActiveSessions,
  fetchActiveSessions,
  getCachedActiveSessions,
  subscribeActiveSessions,
  getSessionStatus,
  cacheSessionStatus,
  subscribeSessionStatus,
} from "../../../lib/session-cache";
import { useSessionGlanceStitch } from "../../../lib/session-glance-cache";
import {
  ACTIVE_SESSION_IP_PRIVACY_EVENT,
  ACTIVE_SESSION_IP_PRIVACY_KEY,
  getActiveSessionIpPrivacy,
  shouldHideActiveSessionIp,
} from "../../../lib/privacy-settings";

function canManageSessions(config) {
  const role = String(config?.settings?.auth?.role || "").toLowerCase();
  if (role.includes("owner") || role.includes("admin")) return true;
  try {
    const token = localStorage.getItem("token");
    if (!token) return false;
    const payload = JSON.parse(window.atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const tokenRole = String(payload?.role || payload?.Role || "").toLowerCase();
    return tokenRole.includes("owner") || tokenRole.includes("admin");
  } catch {
    return false;
  }
}

function LegacySessions({ surface = "home" }) {
  const [data, setData] = useState(() => getCachedActiveSessions());
  const [status, setStatus] = useState(getSessionStatus);
  const [view, setView] = useState(() => getStoredSessionView());
  const [ipPrivacy, setIpPrivacy] = useState(() => getActiveSessionIpPrivacy());
  const [config, setConfig] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("config") || "null");
    } catch {
      return null;
    }
  });
  const canManage = canManageSessions(config);
  const stitchByItemId = useSessionGlanceStitch(data || []);

  useEffect(() => {
    const handleIpPrivacyUpdate = () => setIpPrivacy(getActiveSessionIpPrivacy());
    const handleStorage = (event) => {
      if (event.key === ACTIVE_SESSION_IP_PRIVACY_KEY) {
        handleIpPrivacyUpdate();
      }
    };

    window.addEventListener(ACTIVE_SESSION_IP_PRIVACY_EVENT, handleIpPrivacyUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(ACTIVE_SESSION_IP_PRIVACY_EVENT, handleIpPrivacyUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeActiveSessions(setData);
    const unsubscribeStatus = subscribeSessionStatus(setStatus);
    const handleSessions = (sessionData) => {
      if (typeof sessionData === "object" && Array.isArray(sessionData)) {
        cacheActiveSessions(sessionData);
      }
    };

    socket.on("sessions", handleSessions);
    socket.on('session-status', cacheSessionStatus);
    const disconnected = () => cacheSessionStatus({ state: 'unavailable', message: 'Live updates disconnected. Retrying…' });
    socket.on('disconnect', disconnected);

    const refresh = () => fetchActiveSessions().catch(() => {});
    refresh();
    // REST fallback also recovers when the dashboard socket is unavailable.
    const timer = setInterval(refresh, 15000);

    return () => {
      unsubscribe();
      unsubscribeStatus();
      clearInterval(timer);
      socket.off("sessions", handleSessions);
      socket.off('session-status', cacheSessionStatus);
      socket.off('disconnect', disconnected);
    };
  }, []);

  const hideIpAddress = shouldHideActiveSessionIp(surface, ipPrivacy);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const newConfig = await Config.getConfig();
        setConfig(newConfig);
      } catch (error) {
        console.log(error);
      }
    };

    if (!config) {
      fetchConfig();
    }
  }, [config]);

  const changeView = (nextView) => {
    setView(nextView);
    try {
      localStorage.setItem(SESSION_VIEW_KEY, nextView);
    } catch {
      // ignore storage errors
    }
  };

  const unavailable = ['unavailable', 'unconfigured', 'storage-unavailable'].includes(status.state);
  const statusNotice = unavailable ? (
    <div className="session-connection-status" role="status">
      <strong>{status.state === 'unconfigured' ? 'Connect Silo Server to see activity.' : status.state === 'storage-unavailable' ? 'Activity history unavailable' : 'Activity connection unavailable'}</strong>
      {status.message && <span>{status.message}</span>}
      {status.lastSuccessAt && <small>Last update: {new Date(status.lastSuccessAt).toLocaleTimeString()}</small>}
    </div>
  ) : null;

  if (!data && !unavailable) {
    return (
      <div className="sessions-widget sessions-widget-loading">
        <h1 className="my-3">
          Active Sessions
        </h1>
        <div className="sessions-loading-strip" aria-hidden="true">
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="sessions-widget sessions-widget-empty">
        <h1 className="my-3">
          Active Sessions
        </h1>
        {statusNotice}
        {!unavailable && <div className="sessions-empty-state">
          No Active Sessions Found
        </div>}
      </div>
    );
  }

  return (
    <div className="sessions-widget">
      {statusNotice}
      <div className="sessions-widget-header">
        <h1 className="my-3">
          Active Sessions
        </h1>
        <div className="sessions-view-toggle" role="group" aria-label="Session layout">
          <button type="button" className={view === "cards" ? "is-active" : ""} aria-pressed={view === "cards"} onClick={() => changeView("cards")}>
            Cards
          </button>
          <button type="button" className={view === "wall" ? "is-active" : ""} aria-pressed={view === "wall"} onClick={() => changeView("wall")}>
            Wall
          </button>
        </div>
      </div>
      {view === "wall" ? <SessionWall sessions={data} /> : <div className="sessions-container">
        {orderSessions(data).map((session) => (
          <ErrorBoundary key={session.Id}>
            <SessionCard
              data={{ session: session, base_url: config?.base_url }}
              hideIpAddress={hideIpAddress}
              kiosk={surface === "kiosk"}
              canManage={canManage}
              stitch={stitchByItemId.get(session.NowPlayingItem?.Id) || null}
            />
          </ErrorBoundary>
        ))}
      </div>}
    </div>
  );
}

export default function Sessions(props) {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(false);
  useEffect(() => { Config.getConfig().then(nextConfig => {
    if (typeof nextConfig?.IS_SILO !== 'boolean') throw new Error('Configuration unavailable');
    setConfig(nextConfig);
  }).catch(() => setConfigError(true)); }, []);
  if (configError) return <p role="status">Activity configuration unavailable. Please reload to retry.</p>;
  if (!config) return <p role="status">Loading activity…</p>;
  const canControl = ['Owner', 'Admin'].includes(config.settings?.auth?.role) && Boolean(config.settings?.auth?.permissions?.settings);
  return config.IS_SILO ? <FleetOverview {...props} canControl={canControl} /> : <LegacySessions {...props} />;
}
