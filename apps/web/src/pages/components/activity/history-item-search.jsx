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
  const inputRef = useRef(null);
  const clearRef = useRef(null);
  const blurTimer = useRef(null);
  // Focus moves only after a user picks or clears a title (never on first render).
  const pendingFocus = useRef(null);

  // Consumed on the next render either way, so a pick the parent ignores can't steal focus later.
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === "chip") clearRef.current?.focus();
    else if (target === "input") inputRef.current?.focus();
  });

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

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
    // Drop previous results immediately so nothing stale can be picked while this search is pending.
    setResults([]);
    setActive(-1);
    setError("");
    setStatus("loading");
    const timer = window.setTimeout(() => {
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
    pendingFocus.current = "chip";
    setOpen(false);
    setQuery("");
    setResults([]);
    onSelect(result);
  }

  if (selected) {
    return (
      <span className="activity-search-chip" title={formatHistorySearchResult(selected)}>
        <span>{formatHistorySearchResult(selected)}</span>
        <button ref={clearRef} type="button" aria-label="Clear title filter" onClick={() => { pendingFocus.current = "input"; onClear(); }}>×</button>
      </span>
    );
  }

  const showMenu = open && query.trim().length >= 2;
  const showList = showMenu && status !== "error" && results.length > 0;
  const isError = status === "error";
  const statusText = !showMenu ? ""
    : status === "loading" ? "Searching…"
      : isError ? error
        : status === "done" && results.length === 0 ? "No movies or episodes match" : "";
  return (
    <div className="activity-search">
      <input
        ref={inputRef}
        className="activity-search-input form-control"
        placeholder="Search titles"
        aria-label="Search titles"
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        value={query}
        maxLength={100}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => { window.clearTimeout(blurTimer.current); setOpen(true); }}
        onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 150); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (event.key === "Enter" && showMenu && status === "done" && results.length) { event.preventDefault(); choose(results[Math.max(0, active)]); }
          else if (event.key === "Escape") { setOpen(false); setActive(-1); }
        }}
      />
      {showMenu ? (
        <div className="activity-search-menu">
          {statusText ? <p className={`activity-search-state${isError ? " is-error" : ""}`} aria-hidden="true">{statusText}</p> : null}
          {showList ? (
            <ul id={listId} role="listbox" aria-label="Matching titles">
              {results.map((result, index) => (
                <li
                  key={result.id}
                  id={`${listId}-${index}`}
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
      ) : null}
      {/* Live regions stay mounted so screen readers announce text changes; errors interrupt. */}
      <p className="visually-hidden" role="status">{isError ? "" : statusText}</p>
      <p className="visually-hidden" role="alert">{isError ? statusText : ""}</p>
    </div>
  );
}
