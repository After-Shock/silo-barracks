import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "../lib/axios_instance";
import Config from "../lib/config";
import Loading from "./components/general/loading";
import SiloScopedActivity from "./components/activity/silo-scoped-activity";
import siloIcon from "../../public/brand/barracks-mark.svg";
import "./css/fleet-libraries.css";

function bytes(value) {
  const size = Number(value);
  if (!Number.isFinite(size)) return "Pending";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(Math.max(size, 1)) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export default function FleetLibraries() {
  const { serverId, libraryId } = useParams();
  const token = localStorage.getItem("token");
  const [config, setConfig] = useState(null);
  const [payload, setPayload] = useState(null);
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const base = `/fleet/libraries/${encodeURIComponent(serverId)}`;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.all([Config.getConfig(), axios.get(libraryId ? `${base}/${encodeURIComponent(libraryId)}` : base,
      { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } }).then((response) => response.data)])
      .then(([nextConfig, result]) => { if (active) { setConfig(nextConfig); setPayload(result); } })
      .catch((requestError) => { if (active && requestError.code !== "ERR_CANCELED") setError(requestError.response?.data?.error || requestError.message || "Unable to load Silo libraries."); });
    return () => { active = false; controller.abort(); };
  }, [base, libraryId, token]);

  useEffect(() => {
    if (!libraryId) return undefined;
    const controller = new AbortController();
    setItems(null);
    axios.get(`${base}/${encodeURIComponent(libraryId)}/items`, { signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` }, params: { page, size: 24, search: query || undefined, sort: "title" } })
      .then((response) => setItems(response.data))
      .catch((requestError) => { if (requestError.code !== "ERR_CANCELED") setError(requestError.response?.data?.error || requestError.message || "Unable to load library items."); });
    return () => controller.abort();
  }, [base, libraryId, page, query, token]);

  if (error) return <div className="fleet-libraries-page"><section className="activity-state is-error" role="alert"><h1>Libraries unavailable</h1><p>{error}</p><Link to="/activity">Back to Activity</Link></section></div>;
  if (!config || !payload) return <div aria-busy="true"><Loading /></div>;

  if (!libraryId) return <div className="fleet-libraries-page">
    <Link to="/activity">← Activity</Link><header><span>{payload.serverName}</span><h1>Libraries</h1></header>
    <div className="fleet-library-grid">{payload.libraries.map((library) => <Link key={library.Id}
      to={`/silo-fleet/${encodeURIComponent(serverId)}/libraries/${encodeURIComponent(library.Id)}`}>
      <img src={library.SiloPosterUrl || siloIcon} alt="" onError={(event) => { event.currentTarget.src = siloIcon; }} />
      <strong>{library.Name}</strong><span>{library.CollectionType || "Library"}</span></Link>)}</div>
  </div>;

  const library = payload.library;
  return <div className="fleet-libraries-page">
    <Link to={`/silo-fleet/${encodeURIComponent(serverId)}/libraries`}>← {payload.serverName} libraries</Link>
    <header><span>{payload.serverName} · {library.CollectionType || "Library"}</span><h1>{library.Name}</h1></header>
    <div className="fleet-library-metrics"><article><span>Catalog items</span><strong>{library.Library_Count == null ? "Pending" : Number(library.Library_Count).toLocaleString()}</strong></article>
      <article><span>Files</span><strong>{library.files == null ? "Pending" : Number(library.files).toLocaleString()}</strong></article>
      <article><span>Storage</span><strong>{bytes(library.Size)}</strong></article></div>
    <section className="fleet-library-items"><div className="fleet-library-items-head"><h2>Media</h2><form onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search.trim()); }}>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this library" /><button type="submit">Search</button></form></div>
      {!items ? <Loading /> : <><div className="fleet-item-grid">{items.results.map((item) => <Link key={item.Id}
        to={`/silo-fleet/${encodeURIComponent(serverId)}/items/${encodeURIComponent(item.Id)}`}><img src={item.SiloPosterUrl || siloIcon} alt="" onError={(event) => { event.currentTarget.src = siloIcon; }} /><strong>{item.Name}</strong><span>{item.Type}</span></Link>)}</div>
        <nav className="activity-cursor-pagination"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span><button disabled={!items.hasMore} onClick={() => setPage((value) => value + 1)}>Next</button></nav></>}
    </section>
    <SiloScopedActivity endpoint={`/fleet/history/${encodeURIComponent(serverId)}/libraries/${encodeURIComponent(libraryId)}`}
      method="get" scopeLabel="Library" config={config} serverId={serverId} sparseContinuation />
  </div>;
}
