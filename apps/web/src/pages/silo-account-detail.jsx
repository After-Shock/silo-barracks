import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "../lib/axios_instance";
import Config from "../lib/config";
import Loading from "./components/general/loading";
import SiloScopedActivity from "./components/activity/silo-scoped-activity";
import "./css/fleet-history-detail.css";

export default function SiloAccountDetail() {
  const { userId } = useParams();
  const [config, setConfig] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const token = localStorage.getItem("token");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.all([
      Config.getConfig(),
      axios.get(`/api/getHistory/users/${encodeURIComponent(userId)}`, {
        signal: controller.signal, headers: { Authorization: `Bearer ${token}` },
      }).then((response) => response.data),
    ]).then(([nextConfig, payload]) => { if (active) { setConfig(nextConfig); setDetail(payload); } })
      .catch((requestError) => { if (active && requestError.code !== "ERR_CANCELED") setError(requestError.response?.data?.error || requestError.message || "Unable to load Silo account."); });
    return () => { active = false; controller.abort(); };
  }, [token, userId]);

  if (error) return <div className="fleet-history-detail"><section className="activity-state is-error" role="alert"><h1>Account unavailable</h1><p>{error}</p><Link to="/activity">Back to Activity</Link></section></div>;
  if (!config || !detail) return <div aria-busy="true"><Loading /></div>;
  const user = detail.user;
  return <div className="fleet-history-detail" data-theme-screen="activity">
    <Link className="fleet-detail-back" to="/activity">← Activity</Link>
    <header className="fleet-detail-hero">
      <span className="fleet-detail-avatar">{String(user.Name || "?").slice(0, 1).toUpperCase()}</span>
      <div><span>Primary server · {user.SiloRole || "Account"}</span><h1>{user.Name || userId}</h1><small>Account ID: {userId}</small>
        <div className="fleet-profile-list">{(detail.profiles || []).map((profile) => <span key={profile.id}>{profile.name}</span>)}</div></div>
    </header>
    <SiloScopedActivity endpoint="/api/getUserHistory" body={{ userid: userId }} scopeLabel="Account" config={config} />
  </div>;
}
