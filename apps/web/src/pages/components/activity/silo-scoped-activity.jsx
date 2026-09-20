import { useEffect, useRef, useState } from "react";
import axios from "../../../lib/axios_instance";
import ActivityTable from "./activity-table";
import Loading from "../general/loading";

const PAGE_SIZES = [10, 25, 50, 100];

export default function SiloScopedActivity({ endpoint, body = {}, query = {}, method = "post", scopeLabel, config, serverId = "primary", sparseContinuation = false }) {
  const token = config.token || localStorage.getItem("token");
  const [pageSize, setPageSize] = useState(() => Math.min(100, Math.max(10,
    Number(localStorage.getItem("PREF_ACTIVITY_ItemCount")) || 25)));
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState({ 1: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const generation = useRef(0);
  const activeCursor = cursors[page] || "";
  const scopeKey = JSON.stringify({ body, query });

  useEffect(() => {
    const controller = new AbortController();
    const request = ++generation.current;
    setLoading(true);
    setError("");
    setData(null);
    const scope = JSON.parse(scopeKey);
    const options = { signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      params: { ...scope.query, size: pageSize, page, cursor: activeCursor || undefined } };
    const requestPromise = method === "get" ? axios.get(endpoint, options) : axios.post(endpoint, scope.body, options);
    requestPromise.then(({ data: payload }) => {
      if (request !== generation.current) return;
      setData(payload);
      if (payload.has_more && payload.next_cursor) {
        setCursors((current) => current[page + 1] === payload.next_cursor ? current
          : { ...current, [page + 1]: payload.next_cursor });
      }
    }).catch((requestError) => {
      if (requestError.code === "ERR_CANCELED" || request !== generation.current) return;
      setError(requestError.response?.data?.error || requestError.message || `Unable to load ${scopeLabel.toLowerCase()} activity.`);
    }).finally(() => { if (request === generation.current) setLoading(false); });
    return () => controller.abort();
    // scopeKey deliberately represents the stable request body.
  }, [activeCursor, endpoint, method, page, pageSize, refreshKey, scopeKey, token, scopeLabel]);

  function reset(nextSize = pageSize) {
    generation.current += 1;
    localStorage.setItem("PREF_ACTIVITY_ItemCount", String(nextSize));
    setPageSize(nextSize);
    setPage(1);
    setCursors({ 1: "" });
    setData(null);
    setRefreshKey((value) => value + 1);
  }

  return <section className="Activity silo-scoped-activity">
    <div className="d-md-flex justify-content-between align-items-center">
      <div><h1 className="my-3">{scopeLabel} Activity</h1><p className="activity-notice">Finalized attempts from Silo retention for this {scopeLabel.toLowerCase()}.</p></div>
      <div className="activity-controls">
        <label className="activity-control-field is-compact"><span>Items</span><select value={pageSize} onChange={(event) => reset(Number(event.target.value))}>
          {PAGE_SIZES.map((size) => <option key={size}>{size}</option>)}</select></label>
        <button type="button" className="activity-control-button" disabled={loading} onClick={() => reset()}>Refresh</button>
      </div>
    </div>
    {error ? <p className="activity-notice is-error" role="alert">{error} <button type="button" onClick={() => reset()}>Retry</button></p> : null}
    {!data && loading ? <div aria-busy="true"><Loading /></div> : <>
      <ActivityTable data={data?.results || []} itemCount={pageSize} isBusy={loading} readOnly siloHistory serverId={serverId} cursorMode />
      <nav className="activity-cursor-pagination" aria-label={`${scopeLabel} activity pages`}>
        <button type="button" disabled={page === 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
        <span>Page {page}</span>
        <button type="button" disabled={!data?.has_more || !cursors[page + 1] || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
      </nav>
      {!loading && !data?.results?.length ? <p className="activity-state is-empty">{sparseContinuation && data?.has_more
        ? "No matching attempts were found in this retained slice. Continue to search older history."
        : `No finalized attempts were found for this ${scopeLabel.toLowerCase()}.`}</p> : null}
    </>}
  </section>;
}
