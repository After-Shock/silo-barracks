# Activity Header Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Silo Activity page header a single JellyGlance-style row (title block left, controls right) so the history table starts near the top, and replace the raw "Media item ID" box with a Silo catalog title search.

**Architecture:** One small backend addition (catalog title search scoped to history-filterable items, for the primary server and fleet servers) and a restructure of `apps/web/src/pages/silo-activity.jsx` into: compact Live/History toggle, inline primary filters, a "Filters" popover for secondary filters, an ⓘ tooltip for the retention note, and a title-search typeahead component.

**Tech Stack:** React 18, react-bootstrap (`OverlayTrigger`, `Tooltip`, `Popover` — already used in `navbar.jsx`), Express, `node:test`.

**Spec (user decisions, 2026-09-28):**
- Live/History tabs → **compact segmented toggle in the header**.
- Filters → **inline**: Server (only when >1 server), Account, Search, Items, Refresh; **Profile and Completion move into a "Filters" popover** with an active-count badge.
- "Media item ID" → **title search**: query Silo's catalog, pick a result, history filters to that item; clear button resets; no raw ID entry.
- Retention notice → **ⓘ tooltip** next to the description; error banners and the non-primary-server note remain banners.

## Analysis

- Upstream (`git show upstream/main:apps/web/src/pages/activity.jsx:343-405`): `<header className="activity-page-header">` holds the title block **and** `.activity-controls` (Libraries, Type, Items, Search) in one row; no notice, no tabs. Table starts ≈ y=105 at 1440×900.
- Barracks today (`silo-activity.jsx:108-135`): tabs inside the header, then a notice paragraph, then `.activity-controls.activity-silo-filters` with 7 controls that wrap to two rows. Table starts ≈ y=300.
- Silo v2 facts (verified live against the attached server):
  - `/api/v2/admin/playback-history?media_item_id=` matches the **exact** catalog item only. A series ID returns 0 attempts; episode and movie IDs work.
  - `/api/v2/catalog?q=` (via `SiloApi._catalogPage({ search })`) returns movies, **episodes** and series with `content_id`s identical to history `media_item_id`s.
  - Therefore search results must offer **movies and episodes only** (series cannot be filtered by the history API).

## Global Constraints

- Only `--barracks-*` colour tokens (`npm run theme:check`); Silo/Barracks copy (`npm run branding:check`).
- No fabricated capability: series are not offered as search results; the search never claims "no plays" for an item it could not query.
- Gate per task: `npm test && npm run lint && npm run build && npm run theme:check && npm run branding:check && git diff --check`.

## Review Focus

1. Stale search responses: typing "dead" then "deadliest" quickly must never show results for "dead" after "deadliest" results arrive (abort previous request). (Task 3 test via pure reducer + manual)
2. Query validation at the trust boundary: `q` shorter than 2 chars, longer than 100 chars, or whitespace → `[]` with **no** upstream call; special characters are URL-encoded. (Task 1 test)
3. Switching Silo server clears the selected search item and the popover filters (IDs are server-scoped). (Task 3 manual check)
4. Catalog search failure (503) shows an inline message inside the search dropdown, not a page-level error banner that hides the table. (Task 3 manual check)
5. Mobile 390px: header stacks, no horizontal scroll, popover and dropdown stay inside the viewport. (Task 4 check)

---

### Task 1: Backend — history item title search

**Files:**
- Modify: `apps/api/classes/silo/mappers.js` (add `historySearchResult`)
- Modify: `apps/api/classes/silo-api.js` (add `searchPlaybackHistoryItems`)
- Modify: `apps/api/classes/silo-fleet.js` (add `playbackHistorySearch`, export it)
- Modify: `apps/api/routes/api.js` (`GET /getHistory/search`, next to `/getHistory/users`)
- Modify: `apps/api/routes/fleet.js` (`GET /history/:serverId/search`)
- Test: `apps/api/tests/silo-history-search.test.js`

**Interfaces — Produces:**
- `historySearchResult(row) -> { id: string, title: string, type: 'movie'|'episode', seriesName: string|null, seasonNumber: number|null, episodeNumber: number|null, year: number|null } | null` (null for any non-movie/non-episode row or a row without `content_id`).
- `SiloApi#searchPlaybackHistoryItems(q) -> Promise<Array<result>>` — returns `[]` without an upstream call when `typeof q !== 'string'` or `q.trim().length < 2` or `> 100`; otherwise `_catalogPage({ search: q.trim(), limit: 20 })`, map, drop nulls, cap 8.
- HTTP: `GET /api/getHistory/search?q=` → `{ results: result[], serverId: 'primary' }`; `GET /fleet/history/:serverId/search?q=` → `{ results, serverId, serverName }`. Both require `req.permissions.dashboard` like their neighbours; errors → `{ error }` with upstream status or 503.

- [ ] **Step 1: Failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { historySearchResult } = require('../classes/silo/mappers');
const SiloApi = require('../classes/silo-api');

test('search results keep only history-filterable movies and episodes', () => {
  assert.deepEqual(historySearchResult({ content_id: 'movie-1', type: 'movie', title: 'Heat', year: 1995 }),
    { id: 'movie-1', title: 'Heat', type: 'movie', seriesName: null, seasonNumber: null, episodeNumber: null, year: 1995 });
  assert.deepEqual(historySearchResult({ content_id: 'ep-1', type: 'episode', title: 'Pilot', series_title: 'Show',
    season_number: 1, episode_number: 2 }),
    { id: 'ep-1', title: 'Pilot', type: 'episode', seriesName: 'Show', seasonNumber: 1, episodeNumber: 2, year: null });
  assert.equal(historySearchResult({ content_id: 'series-1', type: 'series', title: 'Show' }), null);
  assert.equal(historySearchResult({ type: 'movie', title: 'No id' }), null);
});

test('invalid queries never reach Silo; valid ones are trimmed and capped', async () => {
  const api = Object.create(SiloApi.prototype);
  const calls = [];
  api._catalogPage = async (options) => { calls.push(options); return { items: Array.from({ length: 12 }, (_, i) => ({ content_id: `m${i}`, type: 'movie', title: `M${i}` })) }; };
  for (const q of [undefined, null, '', ' a ', 'x'.repeat(101), 42]) assert.deepEqual(await api.searchPlaybackHistoryItems(q), []);
  assert.equal(calls.length, 0);
  const results = await api.searchPlaybackHistoryItems('  deadliest catch & co ');
  assert.equal(calls[0].search, 'deadliest catch & co');
  assert.equal(results.length, 8);
});
```

`silo-api.js` exports the class (`module.exports = SiloAPI`, line 967), so `Object.create(SiloApi.prototype)` gives an instance without running the constructor. Add `historySearchResult` to the existing destructured `require('./silo/mappers')` at `silo-api.js:6`.

- [ ] **Step 2:** `node --test apps/api/tests/silo-history-search.test.js` → FAIL (`historySearchResult` undefined).

- [ ] **Step 3: Implement** in `mappers.js` (export it):

```js
function historySearchResult(row) {
  const type = String(row?.type || '').toLowerCase();
  if (!row?.content_id || !['movie', 'episode'].includes(type)) return null;
  const num = value => (value === undefined || value === null || value === '' ? null : Number(value));
  return { id: String(row.content_id), title: String(row.title || ''), type,
    seriesName: type === 'episode' ? (row.series_title || row.series_name || null) : null,
    seasonNumber: type === 'episode' ? num(row.season_number) : null,
    episodeNumber: type === 'episode' ? num(row.episode_number) : null,
    year: num(row.year) };
}
```

In `silo-api.js` (next to `getPlaybackHistoryUsers`):

```js
  async searchPlaybackHistoryItems(q) {
    if (typeof q !== 'string') return [];
    const query = q.trim();
    if (query.length < 2 || query.length > 100) return [];
    const body = await this._catalogPage({ search: query, limit: 20 });
    return body.items.map(historySearchResult).filter(Boolean).slice(0, 8);
  }
```

In `silo-fleet.js`, beside `playbackHistoryProfiles`:

```js
  async function playbackHistorySearch(serverId, q) {
    const record = connectedClient(serverId);
    const results = await record.client.searchPlaybackHistoryItems(q);
    return { results, serverId: record.id, serverName: String(record.server.name || record.id) };
  }
```

Routes — `api.js` (copy the `/getHistory/users` guard/shape):

```js
router.get("/getHistory/search", async (req, res) => {
  if (!API.isSilo) return res.status(404).json({ error: "Silo history search is unavailable" });
  try { return res.json({ results: await API.searchPlaybackHistoryItems(req.query.q), serverId: "primary" }); }
  catch (error) { return res.status(error.status || 503).json({ error: error.message || "Unable to search the Silo catalog" }); }
});
```

Register it next to `/getHistory/users` (`api.js:5580`); there is no `/getHistory/:param` catch-all, so order does not matter.

`fleet.js` (copy the `/history/:serverId/users` shape):

```js
  router.get('/history/:serverId/search', async (req, res) => {
    if (!req.permissions?.dashboard) return res.status(403).json({ error: 'Dashboard access required.' });
    try { res.json(await fleet.playbackHistorySearch(req.params.serverId, req.query.q)); }
    catch (error) { res.status(error.status || 503).json({ error: error.message || 'Unable to search the Silo catalog.' }); }
  });
```

- [ ] **Step 4:** Test → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(silo): search history-filterable catalog items by title`. (The live check against the real Silo happens in Task 3 after rebuilding the container.)

---

### Task 2: Search result formatting + stale-response guard (pure helpers)

**Files:**
- Create: `apps/web/src/lib/history-search.js`
- Test: `apps/web/src/lib/history-search.test.js`

**Interfaces — Produces:**
- `formatHistorySearchResult(result) -> string` — movie: `"Heat (1995)"` or `"Heat"`; episode: `"Show · S01E02 · Pilot"` (zero-padded two digits; omits missing parts, never prints `SnullEnull`).
- `createLatestRequest() -> { next(): number, isLatest(id): boolean }` — monotonic token so only the newest search response is applied.

- [ ] **Step 1: Failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHistorySearchResult, createLatestRequest } from './history-search.js';

test('results read like JellyGlance titles without null fragments', () => {
  assert.equal(formatHistorySearchResult({ type: 'movie', title: 'Heat', year: 1995 }), 'Heat (1995)');
  assert.equal(formatHistorySearchResult({ type: 'movie', title: 'Heat', year: null }), 'Heat');
  assert.equal(formatHistorySearchResult({ type: 'episode', title: 'Pilot', seriesName: 'Show', seasonNumber: 1, episodeNumber: 2 }), 'Show · S01E02 · Pilot');
  assert.equal(formatHistorySearchResult({ type: 'episode', title: 'Pilot', seriesName: null, seasonNumber: null, episodeNumber: null }), 'Pilot');
});

test('only the newest request is applied', () => {
  const latest = createLatestRequest();
  const a = latest.next(); const b = latest.next();
  assert.equal(latest.isLatest(a), false);
  assert.equal(latest.isLatest(b), true);
});
```

- [ ] **Step 2:** `node --test apps/web/src/lib/history-search.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement**

```js
export function formatHistorySearchResult(result) {
  if (result?.type !== 'episode') return result?.year ? `${result.title} (${result.year})` : String(result?.title || '');
  const pad = (n) => String(n).padStart(2, '0');
  const code = result.seasonNumber != null && result.episodeNumber != null ? `S${pad(result.seasonNumber)}E${pad(result.episodeNumber)}` : '';
  return [result.seriesName, code, result.title].filter(Boolean).join(' · ');
}

export function createLatestRequest() {
  let current = 0;
  return { next: () => ++current, isLatest: (id) => id === current };
}
```

- [ ] **Step 4:** PASS; `npm test` PASS. Commit `feat(activity): add history search helpers`.

---

### Task 3: Compact header, toggle, Filters popover, ⓘ note and title search

**Files:**
- Create: `apps/web/src/pages/components/activity/history-item-search.jsx`
- Modify: `apps/web/src/pages/silo-activity.jsx:108-137`
- Modify: `apps/web/src/pages/css/activity.css` (append a "Compact Silo header" section)

**Interfaces — Consumes:** Task 1 endpoints; Task 2 helpers.

- [ ] **Step 1: `HistoryItemSearch` component** — props `{ searchUrl, token, selected, onSelect, onClear }`:
  - Input (`className="activity-search-input"`, `placeholder="Search titles"`, `aria-label="Search titles"`, `role="combobox"`, `aria-expanded`, `aria-controls`), 250 ms debounce, fetch only when `trim().length >= 2`, `AbortController` per request plus `createLatestRequest()` guard.
  - Dropdown `<ul role="listbox" className="activity-search-menu">` of `formatHistorySearchResult` rows; Up/Down/Enter/Escape keyboard handling; click selects.
  - States inside the dropdown: "Searching…", "No movies or episodes match", and on error `error.response?.data?.error || "Catalog search is unavailable"` — **never** a page banner (Review Focus 4).
  - When `selected` is set: render a chip `<span className="activity-search-chip">{formatHistorySearchResult(selected)} <button aria-label="Clear title filter">×</button></span>` instead of the input.
- [ ] **Step 2: Header** — replace lines 109-135 with:

```jsx
<header className="activity-page-header is-compact">
  <div className="activity-page-title">
    <p>Playback log</p>
    <h1>Activity</h1>
    <span>Review watch history, playback method, device, and session details. <Link to="/timeline">Open Timeline view</Link>.
      {view === "history" && <OverlayTrigger placement="bottom" overlay={<Tooltip id="activity-retention-note">Finalized attempts are read directly from Silo retention. Barracks does not duplicate or delete them.</Tooltip>}>
        <button type="button" className="activity-info-button" aria-label="About Silo playback history">ⓘ</button>
      </OverlayTrigger>}
    </span>
  </div>
  <div className="activity-controls activity-silo-filters">
    <div className="activity-view-toggle" role="tablist" aria-label="Activity view">
      <button type="button" role="tab" aria-selected={view === "live"} onClick={() => setView("live")}>Live</button>
      <button type="button" role="tab" aria-selected={view === "history"} onClick={() => setView("history")}>History</button>
    </div>
    {view === "history" && <>
      {/* Server select (unchanged logic; also clears searchItem) — only when servers.length > 1 */}
      {/* Account select (unchanged logic) */}
      <HistoryItemSearch searchUrl={`${historyBase}/search`} token={token} selected={searchItem}
        onSelect={(item) => { setSearchItem(item); resetQuery({ ...filters, mediaItemId: item.id }); }}
        onClear={() => { setSearchItem(null); resetQuery({ ...filters, mediaItemId: "" }); }} />
      {/* Filters popover button, Items select, Refresh button */}
    </>}
  </div>
</header>
```

  - Replace `mediaItemInput` state with `const [searchItem, setSearchItem] = useState(null);`. The server-change handler sets `setSearchItem(null)` and resets filters (Review Focus 3).
  - Filters popover: `OverlayTrigger trigger="click" rootClose placement="bottom-end"` with a `Popover` containing the existing Profile and Completion selects (same handlers). Button label `Filters` plus `<span className="activity-filter-badge">{n}</span>` when `n = (filters.profileId ? 1 : 0) + (filters.completed !== "all" ? 1 : 0)` > 0.
  - Delete the standalone `<p className="activity-notice" role="status">Finalized attempts…</p>`. Keep the non-primary server note and error banner paragraphs unchanged.
  - Imports: `OverlayTrigger`, `Tooltip`, `Popover` from `react-bootstrap`; `HistoryItemSearch`.
- [ ] **Step 3: CSS** (tokens only), appended to `activity.css`:
  - `.activity-page-header.is-compact { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:0.75rem 1rem; margin-bottom:0.9rem; }`
  - `.activity-page-header.is-compact .activity-controls { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:0.5rem; margin:0; }`
  - `.activity-view-toggle` segmented pill (two buttons, active uses `var(--barracks-action)` / `var(--barracks-action-text)`); `.activity-info-button` borderless muted; `.activity-search-menu` absolutely positioned under the input (`z-index` above the table, `max-height: 18rem; overflow:auto`); `.activity-search-chip`; `.activity-filter-badge`.
  - `@media (max-width: 640px)`: header column, controls `width:100%`, search full width, menu `left:0; right:0`.
- [ ] **Step 4: Verify.** Gate. Dev server on :5173 (proxying :3000 — rebuild the container first so the Task 1 endpoints exist, or stub `/api/getHistory/search` in Playwright). Acceptance at 1440×900: `document.querySelector('.activity-table-shell').getBoundingClientRect().top <= 170`; header is one row (`.activity-page-header` height ≤ 110px). Search "Father Brother" → pick the episode → table shows only that episode's attempts; chip shows `Deadliest Catch · S22E19 · Father, Brother, Sailor, Son`; clear restores all. Rapid typing never shows stale results (Review Focus 1). Filters badge shows `1` after choosing Completed. Live toggle shows `FleetOverview` and hides the filter controls. Stub a 503 for search → dropdown message, table still visible (Review Focus 4).
- [ ] **Step 5: Commit** `feat(activity): compact JellyGlance-style header with title search`

---

### Task 4: Mobile, regression sweep, rebuild check

- [ ] **Step 1:** 390×844: header stacks, `document.documentElement.scrollWidth <= innerWidth`, popover and search menu within viewport (measure `getBoundingClientRect()` right edge ≤ 390) (Review Focus 5).
- [ ] **Step 2:** Run the theme harness UI script against :5173 (`BARRACKS_BASE_URL=http://127.0.0.1:5173 … node scripts/check-universal-theme-ui.cjs`) and compare with a pre-change run: same PASS count (47 on current main; the stateMatrix pagination failure is pre-existing), no new overflow.
- [ ] **Step 3:** Fix anything found; commit `fix(activity): <what>` if needed.

## Out of scope

- Server-side text search over history (Silo API has none).
- Series-level filtering (history API matches exact items only).
- Hub tabs and fleet-overview compaction.
