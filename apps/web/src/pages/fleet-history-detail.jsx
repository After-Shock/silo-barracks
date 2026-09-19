import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "../lib/axios_instance";
import Config from "../lib/config";
import Loading from "./components/general/loading";
import SiloScopedActivity from "./components/activity/silo-scoped-activity";
import siloIcon from "../../public/brand/barracks-mark.svg";
import "./css/fleet-history-detail.css";

export default function FleetHistoryDetail({ type }) {
  const { serverId, itemId, userId } = useParams();
  const id = type === "item" ? itemId : userId;
  const [config, setConfig] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const token = localStorage.getItem("token");
  const detailUrl = type === "item"
    ? `/fleet/catalog/${encodeURIComponent(serverId)}/items/${encodeURIComponent(id)}`
    : `/fleet/users/${encodeURIComponent(serverId)}/${encodeURIComponent(id)}`;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.all([
      Config.getConfig(),
      axios.get(detailUrl, { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } }).then((response) => response.data),
    ]).then(([nextConfig, payload]) => {
      if (!active) return;
      setConfig(nextConfig);
      setDetail(payload);
    }).catch((requestError) => {
      if (active && requestError.code !== "ERR_CANCELED") setError(requestError.response?.data?.error || requestError.message || "Unable to load Silo detail.");
    });
    return () => { active = false; controller.abort(); };
  }, [detailUrl, token]);

  if (error) return <div className="fleet-history-detail"><section className="activity-state is-error" role="alert"><h1>Detail unavailable</h1><p>{error}</p><Link to="/activity">Back to Activity</Link></section></div>;
  if (!config || !detail) return <div aria-busy="true"><Loading /></div>;

  const value = type === "item" ? detail.item : detail.user;
  const title = value.Name || value.UserName || id;
  const historyQuery = type === "item" ? { media_item_id: id } : { user_id: id };

  return <div className="fleet-history-detail" data-theme-screen="activity">
    <Link className="fleet-detail-back" to="/activity">← Activity</Link>
    <header className="fleet-detail-hero">
      {type === "item" ? <img src={value.SiloPosterUrl || siloIcon} alt="" onError={(event) => { event.currentTarget.src = siloIcon; }} />
        : <span className="fleet-detail-avatar">{String(title).slice(0, 1).toUpperCase()}</span>}
      <div><span>{detail.serverName} · {type === "item" ? value.Type || "Media" : value.SiloRole || "Account"}</span><h1>{title}</h1>
        {type === "item" && value.Overview ? <p>{value.Overview}</p> : null}
        <small>Server-scoped ID: {id}</small></div>
    </header>
    <SiloScopedActivity endpoint={`/fleet/history/${encodeURIComponent(serverId)}`} method="get" query={historyQuery}
      scopeLabel={type === "item" ? "Item" : "Account"} config={config} serverId={serverId} />
  </div>;
}
