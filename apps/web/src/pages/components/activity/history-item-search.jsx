/* eslint-disable react/prop-types */
import { useEffect, useId, useRef, useState } from "react";
import axios from "../../../lib/axios_instance";
import { createLatestRequest, formatHistorySearchResult } from "../../../lib/history-search";

// Title search over the Silo catalog; picking a movie or episode filters history to that exact item.
export default function HistoryItemSearch({ searchUrl, token, selected, onSelect, onClear }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const latest = useRef(createLatestRequest());
  const listId = useId();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      latest.current.next();
      setResults([]);
      setStatus("idle");
      return undefined;
    }
    const controller = new AbortController();
    const requestId = latest.current.next();
    const timer = window.setTimeout(() => {
      setStatus("loading");
      axios.get(searchUrl, { headers: { Authorization: `Bearer ${token}` }, params: { q: trimmed }, signal: controller.signal })
        .then(({ data }) => {
          if (!latest.current.isLatest(requestId)) return;
          setResults(Array.isArray(data?.results) ? data.results : []);
          setActive(-1);
          setStatus("done");
        })
        .catch((requestError) => {
          if (requestError.code === "ERR_CANCELED" || !latest.current.isLatest(requestId)) return;
          setResults([]);
          setError(requestError?.response?.data?.error || "Catalog search is unavailable");
          setStatus("error");
        });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, searchUrl, token]);

  function choose(result) {
    setOpen(false);
    setQuery("");
    setResults([]);
    onSelect(result);
  }

  if (selected) {
    return (
      <span className="activity-search-chip" title={formatHistorySearchResult(selected)}>
        <span>{formatHistorySearchResult(selected)}</span>
        <button type="button" aria-label="Clear title filter" onClick={onClear}>×</button>
      </span>
    );
  }

  const showMenu = open && query.trim().length >= 2;
  return (
    <div className="activity-search">
      <input
        className="activity-search-input form-control"
        placeholder="Search titles"
        aria-label="Search titles"
        role="combobox"
        aria-expanded={showMenu}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        maxLength={100}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (event.key === "Enter" && results.length) { event.preventDefault(); choose(results[Math.max(0, active)]); }
          else if (event.key === "Escape") setOpen(false);
        }}
      />
      {showMenu ? (
        <ul id={listId} role="listbox" className="activity-search-menu">
          {status === "loading" ? <li className="activity-search-state">Searching…</li> : null}
          {status === "error" ? <li className="activity-search-state is-error" role="alert">{error}</li> : null}
          {status === "done" && results.length === 0 ? <li className="activity-search-state">No movies or episodes match</li> : null}
          {status !== "error" && results.map((result, index) => (
            <li
              key={result.id}
              role="option"
              aria-selected={index === active}
              className={index === active ? "is-active" : ""}
              onMouseDown={(event) => { event.preventDefault(); choose(result); }}
            >
              <strong>{formatHistorySearchResult(result)}</strong>
              <small>{result.type === "episode" ? "Episode" : "Movie"}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
