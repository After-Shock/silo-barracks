import { useEffect, useRef, useState } from "react";
import axios from "../../../lib/axios_instance";
import ActivityTable from "../activity/activity-table";
import Loading from "../general/loading";

const PAGE_SIZES = [10, 25, 50, 100];

export default function SiloLibraryActivity({ libraryId, config }) {
  const token = config.token || localStorage.getItem("token");
  const [pageSize, setPageSize] = useState(() => Math.min(100, Math.max(10,
    Number(localStorage.getItem("PREF_LIBRARY_ACTIVITY_ItemCount")) || 25)));
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState({ 1: "" });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const generation = useRef(0);
  const activeCursor = cursors[page] || "";

  useEffect(() => {
    const controller = new AbortController();
    const request = ++generation.current;
    setLoading(true);
    setError("");
    setData(null);
    axios.post("/api/getLibraryHistory", { libraryid: libraryId }, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      params: { size: pageSize, page, cursor: activeCursor || undefined },
    }).then(({ data: payload }) => {
      if (request !== generation.current) return;
      setData(payload);
      if (payload.has_more && payload.next_cursor) {
        setCursors((current) => current[page + 1] === payload.next_cursor ? current
          : { ...current, [page + 1]: payload.next_cursor });
      }
    }).catch((requestError) => {
      if (requestError.code === "ERR_CANCELED" || request !== generation.current) return;
      setError(requestError.response?.data?.error || requestError.message || "Unable to load Silo library activity.");
    }).finally(() => { if (request === generation.current) setLoading(false); });
    return () => controller.abort();
  }, [activeCursor, libraryId, page, pageSize, refreshKey, token]);

  function reset(nextSize = pageSize) {
    generation.current += 1;
    localStorage.setItem("PREF_LIBRARY_ACTIVITY_ItemCount", String(nextSize));
    setPageSize(nextSize);
    setPage(1);
    setCursors({ 1: "" });
    setData(null);
    setRefreshKey((value) => value + 1);
  }

  return <section className="Activity silo-library-activity">
    <div className="d-md-flex justify-content-between align-items-center">
      <div><h1 className="my-3">Library Activity</h1><p className="activity-notice">Finalized attempts are matched against complete Silo catalog membership for this library.</p></div>
      <div className="activity-controls">
        <label className="activity-control-field is-compact"><span>Items</span><select value={pageSize} onChange={(event) => reset(Number(event.target.value))}>
          {PAGE_SIZES.map((size) => <option key={size}>{size}</option>)}</select></label>
        <button type="button" className="activity-control-button" disabled={loading} onClick={() => reset()}>Refresh</button>
      </div>
    </div>
    {error ? <p className="activity-notice is-error" role="alert">{error} <button type="button" onClick={() => reset()}>Restart</button></p> : null}
    {!data && loading ? <div aria-busy="true"><Loading /></div> : <>
      <ActivityTable data={data?.results || []} itemCount={pageSize} isBusy={loading} readOnly siloHistory serverId="primary" cursorMode />
      <nav className="activity-cursor-pagination" aria-label="Library activity pages">
        <button type="button" disabled={page === 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
        <span>Page {page}</span>
        <button type="button" disabled={!data?.has_more || !cursors[page + 1] || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
      </nav>
      {!loading && !data?.results?.length ? <p className="activity-state is-empty">No finalized playback attempts belong to this library.</p> : null}
    </>}
  </section>;
}
