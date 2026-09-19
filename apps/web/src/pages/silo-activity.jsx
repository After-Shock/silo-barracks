import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "../lib/axios_instance";
import { Link } from "react-router-dom";
import ActivityTable from "./components/activity/activity-table";
import FleetOverview from "./components/sessions/FleetOverview";
import Loading from "./components/general/loading";
import "./css/activity.css";

const sizes = [10, 25, 50, 100];

function errorMessage(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback;
}

export default function SiloActivity({ config }) {
  const token = config.token || localStorage.getItem("token");
  const canControl = ["Owner", "Admin"].includes(config.settings?.auth?.role) && Boolean(config.settings?.auth?.permissions?.settings);
  const [view, setView] = useState("history");
  const [servers, setServers] = useState([]);
  const [serverId, setServerId] = useState("primary");
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [filters, setFilters] = useState({ userId: "", profileId: "", mediaItemId: "", completed: "all" });
  const [mediaItemInput, setMediaItemInput] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState({ 1: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const requestGeneration = useRef(0);

  const historyBase = serverId === "primary" ? "/api/getHistory" : `/fleet/history/${encodeURIComponent(serverId)}`;
  const userBase = serverId === "primary" ? "/api/getHistory/users" : `/fleet/history/${encodeURIComponent(serverId)}/users`;
  const activeCursor = cursors[page] || "";

  useEffect(() => {
    const controller = new AbortController();
    axios.get("/fleet", { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(({ data: snapshot }) => setServers((snapshot.servers || []).filter((server) => server.enabled)))
      .catch((requestError) => { if (requestError.code !== "ERR_CANCELED") setError(errorMessage(requestError, "Unable to load Silo servers.")); });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (view !== "history") return undefined;
    const controller = new AbortController();
    setUsers([]);
    setProfiles([]);
    axios.get(userBase, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(({ data: payload }) => setUsers(payload.users || []))
      .catch((requestError) => { if (requestError.code !== "ERR_CANCELED") setError(errorMessage(requestError, "Unable to load Silo users.")); });
    return () => controller.abort();
  }, [token, userBase, view]);

  useEffect(() => {
    if (!filters.userId || view !== "history") { setProfiles([]); return undefined; }
    const controller = new AbortController();
    const url = `${userBase}/${encodeURIComponent(filters.userId)}/profiles`;
    axios.get(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(({ data: payload }) => setProfiles(payload.profiles || []))
      .catch((requestError) => { if (requestError.code !== "ERR_CANCELED") setError(errorMessage(requestError, "Unable to load household profiles.")); });
    return () => controller.abort();
  }, [filters.userId, token, userBase, view]);

  useEffect(() => {
    if (view !== "history") return undefined;
    const controller = new AbortController();
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError("");
    setData(null);
    const upstreamFilters = [];
    if (filters.userId) upstreamFilters.push({ field: "UserId", value: filters.userId });
    if (filters.profileId) upstreamFilters.push({ field: "ProfileId", value: filters.profileId });
    if (filters.mediaItemId) upstreamFilters.push({ field: "NowPlayingItemId", value: filters.mediaItemId });
    if (filters.completed !== "all") upstreamFilters.push({ field: "Completed", value: filters.completed === "true" });
    axios.get(historyBase, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
      params: { size: pageSize, page, cursor: activeCursor || undefined, filters: JSON.stringify(upstreamFilters) },
    }).then(({ data: payload }) => {
      if (generation !== requestGeneration.current) return;
      setData(payload);
      if (payload.has_more && payload.next_cursor) {
        setCursors((current) => current[page + 1] === payload.next_cursor ? current : ({ ...current, [page + 1]: payload.next_cursor }));
      }
    }).catch((requestError) => {
      if (requestError.code !== "ERR_CANCELED" && generation === requestGeneration.current) {
        setError(errorMessage(requestError, "Unable to load Silo playback history."));
      }
    }).finally(() => { if (generation === requestGeneration.current) setLoading(false); });
    return () => controller.abort();
  }, [activeCursor, filters, historyBase, page, pageSize, refreshKey, token, view]);

  const resetQuery = useCallback((nextFilters = filters, nextSize = pageSize) => {
    requestGeneration.current += 1;
    setPage(1);
    setCursors({ 1: "" });
    setData(null);
    setFilters(nextFilters);
    setPageSize(nextSize);
  }, [filters, pageSize]);

  const selectedServer = useMemo(() => servers.find((server) => server.id === serverId), [servers, serverId]);
  const rows = data?.results || [];

  return <div className="Activity" data-theme-screen="activity">
    <header className="activity-page-header">
      <div><p>Silo activity</p><h1>Activity</h1><span>Live playback diagnostics and finalized playback history from Silo API v2.</span></div>
      <div className="activity-view-tabs" role="tablist" aria-label="Activity view">
        <button type="button" role="tab" aria-selected={view === "live"} onClick={() => setView("live")}>Live sessions</button>
        <button type="button" role="tab" aria-selected={view === "history"} onClick={() => setView("history")}>Playback history</button>
      </div>
    </header>

    {view === "live" ? <FleetOverview surface="activity" canControl={canControl} /> : <>
      <p className="activity-notice" role="status">Finalized attempts are read directly from Silo retention. Barracks does not duplicate or delete them.</p>
      <div className="activity-controls activity-silo-filters">
        {servers.length > 1 && <label className="activity-control-field"><span>Silo server</span><select value={serverId} onChange={(event) => {
          setServerId(event.target.value); setMediaItemInput(""); resetQuery({ userId: "", profileId: "", mediaItemId: "", completed: "all" });
        }}><option value="primary">Primary server</option>{servers.filter((server) => !server.isPrimary).map((server) =>
          <option key={server.id} value={server.id} disabled={server.state !== "connected"}>{server.name}{server.state === "connected" ? "" : " (unavailable)"}</option>)}</select></label>}
        <label className="activity-control-field"><span>Account</span><select value={filters.userId} onChange={(event) => resetQuery({ ...filters, userId: event.target.value, profileId: "" })}>
          <option value="">All accounts</option>{users.map((user) => <option key={user.Id} value={user.Id}>{user.Name}</option>)}</select></label>
        <label className="activity-control-field"><span>Profile</span><select value={filters.profileId} disabled={!filters.userId} onChange={(event) => resetQuery({ ...filters, profileId: event.target.value })}>
          <option value="">All profiles</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        <label className="activity-control-field"><span>Completion</span><select value={filters.completed} onChange={(event) => resetQuery({ ...filters, completed: event.target.value })}>
          <option value="all">All attempts</option><option value="true">Completed</option><option value="false">Not completed</option></select></label>
        <label className="activity-control-field"><span>Media item ID</span><input value={mediaItemInput} placeholder="All items" onChange={(event) => setMediaItemInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") resetQuery({ ...filters, mediaItemId: mediaItemInput.trim() }); }}
          onBlur={() => { if (mediaItemInput.trim() !== filters.mediaItemId) resetQuery({ ...filters, mediaItemId: mediaItemInput.trim() }); }} /></label>
        <label className="activity-control-field is-compact"><span>Items</span><select value={pageSize} onChange={(event) => resetQuery(filters, Number(event.target.value))}>{sizes.map((size) => <option key={size}>{size}</option>)}</select></label>
        <button type="button" className="activity-control-button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>Refresh</button>
      </div>
      {selectedServer && serverId !== "primary" ? <p className="activity-notice">Viewing {selectedServer.name}. Item and account links remain explicitly scoped to this server. <Link to={`/fleet/${encodeURIComponent(serverId)}/libraries`}>Browse its libraries</Link>.</p> : null}
      {error ? <p className="activity-notice is-error" role="alert">{error} <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Retry</button></p> : null}
      {!data && loading ? <div aria-busy="true"><Loading /></div> : <div className="Activity activity-table-shell">
        <ActivityTable data={rows} itemCount={pageSize} isBusy={loading} readOnly siloHistory serverId={serverId} cursorMode />
        <nav className="activity-cursor-pagination" aria-label="Playback history pages">
          <button type="button" disabled={page === 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
          <span>Page {page}</span>
          <button type="button" disabled={!data?.has_more || !cursors[page + 1] || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
        </nav>
        {!loading && rows.length === 0 ? <p className="activity-state is-empty">No finalized attempts match these filters.</p> : null}
      </div>}
    </>}
  </div>;
}
