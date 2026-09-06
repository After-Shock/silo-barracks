import { useState, useEffect } from "react";
import Config from "../../../lib/config";
// import API from "../../../classes/jellyfin-api";

import "../../css/sessions.css";
import ErrorBoundary from "../general/ErrorBoundary";
import SessionCard from "./session-card";

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
import {
  ACTIVE_SESSION_IP_PRIVACY_EVENT,
  ACTIVE_SESSION_IP_PRIVACY_KEY,
  getActiveSessionIpPrivacy,
  shouldHideActiveSessionIp,
} from "../../../lib/privacy-settings";

function Sessions({ surface = "home" }) {
  const [data, setData] = useState(() => getCachedActiveSessions());
  const [status, setStatus] = useState(getSessionStatus);
  const [ipPrivacy, setIpPrivacy] = useState(() => getActiveSessionIpPrivacy());
  const [config, setConfig] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("config") || "null");
    } catch {
      return null;
    }
  });

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
      <h1 className="my-3">
        Active Sessions
      </h1>
      <div className="sessions-container">
        {data &&
          data.length > 0 &&
          data
            .sort((a, b) => a.Id.padStart(12, "0").localeCompare(b.Id.padStart(12, "0")))
            .map((session) => (
              <ErrorBoundary key={session.Id}>
                <SessionCard data={{ session: session, base_url: config?.base_url }} hideIpAddress={hideIpAddress} />
              </ErrorBoundary>
            ))}
      </div>
    </div>
  );
}

export default Sessions;
