# Fleet Overview Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the multi-server Active Sessions block (Home, Activity → Live, kiosk) into a JellyGlance-style compact widget: one summary line, one row of server pills, and the session card grid, with a one-line strip when nothing is playing.

**Architecture:** Move the snapshot → display arithmetic out of `FleetOverview.jsx` into a small pure module (`fleet-summary.js`, unit-tested), then rewrite the multi-server branch of `FleetOverview.jsx` around it. Single-server rendering (the upstream widget) is untouched. The existing fixture-driven browser check `scripts/check-fleet-ui.cjs` is updated to drive pills instead of the removed select and is the acceptance test.

**Tech Stack:** React 18, react-bootstrap `OverlayTrigger`/`Tooltip`, `node:test`, Playwright (fixture script).

**Spec (user decisions, 2026-09-28):**
- **Server selection:** one **pill row** — `All <total>` then each enabled server with its stream count and a **status dot** (connected / connecting / unavailable; disabled servers are not shown as pills). Clicking filters. Tooltip on a non-connected pill shows its state and "Last seen <time>". Replaces the totals tiles, the server tiles and the "Show activity" select.
- **Header line:** `Active Sessions` + summary `N streaming · N paused · C/E servers` + `Manage servers` link + ⓘ tooltip.
- **Empty state:** **one-line strip** — `Active Sessions · No Active Sessions Found` with the pill row beneath (target ≤ 110px total instead of 437px).
- **Card server label:** **small badge on the card** (server name; `· Stale` appended when stale), replacing the label row above each card.
- **Footnote:** moves into the **ⓘ tooltip** in the header.

## Analysis

- Current multi-server block (`FleetOverview.jsx:45-86`, measured live on Home at 1440×900, 4 servers, nothing playing): 437px tall — heading ≈60px, totals tiles 94px, server tiles 128px, "Show activity" select 41px, empty line and footnote.
- Upstream's widget (`sessions.jsx` + `home.css` `.home-active-sessions:has(.sessions-empty-state)`) is a heading + card grid; the empty state collapses to a single flex row.
- `scripts/check-fleet-ui.cjs` stubs `/fleet` (primary + "extra" server) and asserts: `data-testid="fleet-total"` values (2, 1, "—"), `.fleet-stream` counts, `.fleet-streams` text, `.fleet-overview` bounding box on mobile, the text `Stale · last known activity`, a `Retry` button, and filtering via `getByLabel('Show activity').selectOption('extra'|'all')`.
- Semantics that must survive (they encode real fleet behaviour): the total is `snapshot.totalActiveStreams` for "all" or the server's `activeStreams`; it shows `—` on transport error; a partial total is labelled; stale streams are labelled and excluded from the total; controls are disabled on stale/non-connected sessions.

## Global Constraints

- Keep hooks used by tests: `.fleet-overview`, `.fleet-streams`, `.fleet-stream`, `data-testid="fleet-total"`, the `Retry` button name, and the exact text `Stale · last known activity` (now inside the badge's accessible label or tooltip — see Task 3).
- Only `--barracks-*` tokens (`npm run theme:check`); Silo/Barracks copy (`npm run branding:check`).
- Single-server branch of `FleetOverview.jsx` unchanged.
- Gate per task: `npm test && npm run lint && npm run build && npm run theme:check && npm run branding:check && git diff --check`.

## Review Focus

1. Transport error (`/fleet` 503) → summary shows `—`, pills still render from the last snapshot or show nothing, a Retry is reachable, and no "No Active Sessions Found" claim is made. (Task 1 test + Task 4 fixture)
2. Selected server becomes disabled/removed while selected → view falls back to "All" rather than an empty or crashing view. (Task 1 test)
3. A pill row with many servers (8+) or long names wraps without horizontal page scroll at 390px. (Task 4 check)
4. Kiosk surface: no `Manage servers` link and no controls; pills still filter. (Task 3 check)
5. Stale sessions: badge says stale, card controls stay disabled, and the stale stream is not counted in the pill count for a non-connected server's total. (Task 4 fixture)

---

### Task 1: `fleet-summary.js` — pure snapshot → display model

**Files:**
- Create: `apps/web/src/lib/fleet-summary.js`
- Test: `apps/web/src/lib/fleet-summary.test.js`

**Interfaces — Produces:**
`summarizeFleet(snapshot, selectedId, error) -> {`
`  filter: 'all' | serverId,` (falls back to `'all'` if `selectedId` is not an enabled server)
`  total: number | null,` (null when `error` or no snapshot)
`  paused: number | null,`
`  connected: number, enabled: number,`
`  partial: boolean,`
`  pills: Array<{ id: 'all' | string, label: string, count: number | null, state: 'all'|'connected'|'connecting'|'unavailable', lastSuccessAt: string | null, isPrimary: boolean, selected: boolean }>,`
`  visibleServers: Array<server>` (enabled servers matching the filter)
`}`

- [ ] **Step 1: Failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFleet } from './fleet-summary.js';

const snap = {
  totalActiveStreams: 3, pausedStreams: 1, partial: true,
  servers: [
    { id: 'p', name: 'Primary', isPrimary: true, enabled: true, state: 'connected', activeStreams: 2, pausedStreams: 1 },
    { id: 'x', name: 'Extra', enabled: true, state: 'unavailable', activeStreams: null, pausedStreams: null, lastSuccessAt: '2026-09-28T10:00:00Z' },
    { id: 'off', name: 'Off', enabled: false, state: 'disabled', activeStreams: 0 },
  ],
};

test('all-servers summary counts enabled servers and keeps partial totals', () => {
  const s = summarizeFleet(snap, 'all', '');
  assert.equal(s.filter, 'all');
  assert.equal(s.total, 3);
  assert.equal(s.paused, 1);
  assert.deepEqual([s.connected, s.enabled], [1, 2]);
  assert.equal(s.partial, true);
  assert.deepEqual(s.pills.map(p => [p.id, p.count, p.state, p.selected]),
    [['all', 3, 'all', true], ['p', 2, 'connected', false], ['x', null, 'unavailable', false]]);
  assert.deepEqual(s.visibleServers.map(v => v.id), ['p', 'x']);
});

test('selecting a server scopes totals; unknown or disabled selection falls back to all', () => {
  const one = summarizeFleet(snap, 'p', '');
  assert.deepEqual([one.filter, one.total, one.paused, one.partial], ['p', 2, 1, false]);
  assert.equal(summarizeFleet(snap, 'x', '').partial, true);
  assert.equal(summarizeFleet(snap, 'off', '').filter, 'all');
  assert.equal(summarizeFleet(snap, 'gone', '').filter, 'all');
});

test('transport error never reports a number', () => {
  const s = summarizeFleet(snap, 'all', 'Unavailable');
  assert.equal(s.total, null);
  assert.equal(s.paused, null);
  assert.equal(s.partial, true);
  assert.equal(summarizeFleet(null, 'all', '').total, null);
});
```

- [ ] **Step 2:** `node --test apps/web/src/lib/fleet-summary.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement**

```js
// Display model for the multi-server Active Sessions widget.
export function summarizeFleet(snapshot, selectedId, error) {
  const enabledServers = (snapshot?.servers || []).filter((server) => server.enabled);
  const selected = enabledServers.find((server) => server.id === selectedId);
  const filter = selected ? selected.id : 'all';
  const ok = Boolean(snapshot) && !error;
  const total = !ok ? null : (filter === 'all' ? snapshot.totalActiveStreams : selected.activeStreams) ?? null;
  const paused = !ok ? null : (filter === 'all' ? snapshot.pausedStreams : selected.pausedStreams) ?? null;
  const partial = Boolean(error) || (filter === 'all' ? Boolean(snapshot?.partial) : selected.state !== 'connected');
  const pills = [
    { id: 'all', label: 'All', count: ok ? snapshot.totalActiveStreams ?? null : null, state: 'all', lastSuccessAt: null, isPrimary: false, selected: filter === 'all' },
    ...enabledServers.map((server) => ({
      id: server.id, label: String(server.name || server.id), count: server.activeStreams ?? null,
      state: server.state === 'connected' ? 'connected' : server.state === 'connecting' ? 'connecting' : 'unavailable',
      lastSuccessAt: server.lastSuccessAt || null, isPrimary: Boolean(server.isPrimary), selected: filter === server.id,
    })),
  ];
  return {
    filter, total, paused, partial, pills,
    connected: enabledServers.filter((server) => server.state === 'connected').length,
    enabled: enabledServers.length,
    visibleServers: enabledServers.filter((server) => filter === 'all' || server.id === filter),
  };
}
```

- [ ] **Step 4:** PASS; `npm test` PASS. **Commit** `feat(fleet): add fleet summary display model`

---

### Task 2: Baseline the fleet fixture check

- [ ] **Step 1:** Run the fixture check against the running container before any UI change and keep its output: `BARRACKS_PLAYWRIGHT=/home/plex/twocaptainscharters/node_modules/playwright BARRACKS_CHROMIUM=/usr/bin/google-chrome BARRACKS_QA_DIR=<scratch>/fleet-before node scripts/check-fleet-ui.cjs`. Expected: exit 0. If it fails on `main`, record the failing assertion in the ledger as pre-existing and continue (no commit).

---

### Task 3: Compact multi-server widget

**Files:**
- Modify: `apps/web/src/pages/components/sessions/FleetOverview.jsx` (multi-server branch only, lines ~45-86)
- Modify: `apps/web/src/pages/css/fleet.css` (replace `.fleet-totals`, `.fleet-server-grid`, `.fleet-server*`, `.fleet-filter`, `.fleet-source`, `.fleet-footnote` rules with the compact rules; keep `.fleet-streams`/`.fleet-stream`)
- Modify: `scripts/check-fleet-ui.cjs` (pill selection)

**Interfaces — Consumes:** `summarizeFleet` from Task 1.

- [ ] **Step 1: Markup** — replace the multi-server `return` with (shape; keep existing imports, add `OverlayTrigger`, `Tooltip`):

```jsx
const s = summarizeFleet(snapshot, selected, error);
const streams = s.visibleServers.flatMap(server => normalizeSessions(server.sessions || []).map(session => ({ server, session })));
const kiosk = surface === 'kiosk';
const emptyText = !snapshot && !error ? 'Connecting to your Silo servers…'
  : s.partial ? 'No current activity can be confirmed for this selection.' : 'No Active Sessions Found';
return <section className={`fleet-overview is-compact${streams.length ? '' : ' is-empty'}`} aria-label="All Silo servers">
  <header className="fleet-heading">
    <h1>Active Sessions</h1>
    {streams.length || s.partial ? <p className="fleet-summary">
      <strong data-testid="fleet-total">{s.total ?? '—'}</strong> streaming{s.partial && s.total != null ? ' · partial total' : ''}
      {' · '}{s.paused ?? '—'} paused · {s.connected}/{s.enabled} servers
    </p> : <p className="fleet-summary is-empty"><span data-testid="fleet-total" hidden>{s.total ?? '—'}</span>{emptyText}</p>}
    <OverlayTrigger placement="bottom" overlay={<Tooltip id="fleet-note">Live activity includes all enabled servers. Paused streams are included in the total; stale streams are not. Playback History can be scoped to one connected server; library statistics remain primary-server scoped.</Tooltip>}>
      <button type="button" className="fleet-info-button" aria-label="About live activity across servers">ⓘ</button>
    </OverlayTrigger>
    {!kiosk && <Link to="/settings/servers" className="fleet-manage-link">Manage servers</Link>}
  </header>
  <div className="fleet-pills" role="group" aria-label="Show activity">
    {s.pills.map(pill => {
      const button = <button key={pill.id} type="button" className={`fleet-pill is-${pill.state}`} aria-pressed={pill.selected} onClick={() => setSelected(pill.id)}>
        {pill.state !== 'all' && <span className="fleet-pill-dot" aria-hidden="true" />}
        <span className="fleet-pill-label">{pill.label}</span>
        <span className="fleet-pill-count">{pill.count ?? '—'}</span>
      </button>;
      return pill.state === 'connected' || pill.state === 'all' ? button
        : <OverlayTrigger key={pill.id} placement="bottom" overlay={<Tooltip id={`fleet-pill-${pill.id}`}>{pill.state === 'connecting' ? 'Connecting…' : 'Unavailable'}{pill.lastSuccessAt ? ` · Last seen ${new Date(pill.lastSuccessAt).toLocaleTimeString()}` : ''}</Tooltip>}>{button}</OverlayTrigger>;
    })}
  </div>
  {error && <p role="status" className="fleet-notice">{error} <button onClick={refresh}>Retry</button></p>}
  {!error && snapshot?.partial && s.filter === 'all' && <p role="status" className="fleet-notice">Some servers are unavailable or still connecting. Last-known streams are labelled stale and excluded from the total.</p>}
  {streams.length > 0 && <div className="fleet-streams sessions-container">
    {streams.map(({ server, session }) => {
      const stale = session.stale || server.state !== 'connected' || Boolean(error);
      return <div key={`${server.id}:${session.Id}`} className="fleet-stream">
        <span className={`fleet-card-badge${stale ? ' is-stale' : ''}`}>{server.name}{stale && <span> · Stale · last known activity</span>}</span>
        <ErrorBoundary>{card({ server, session })}</ErrorBoundary>
      </div>;
    })}
  </div>}
</section>;
```

  Notes: `data-testid="fleet-total"` stays present in both branches (hidden in the empty strip so the fixture's `—`/number assertions still resolve). The pill group is labelled "Show activity" to keep the control discoverable by that name. Remove the now-unused `.fleet-totals`, `.fleet-server-grid`, `.fleet-filter`, `.fleet-footnote` markup.

- [ ] **Step 2: CSS** (tokens only) in `fleet.css`:
  - `.fleet-overview.is-compact { display:grid; gap:0.6rem; }`; `.fleet-heading { display:flex; align-items:baseline; flex-wrap:wrap; gap:0.35rem 0.75rem; }` with `h1` at `var(--jg-type-title)`-scale like the upstream compact empty state; `.fleet-summary` muted 13px; `.fleet-manage-link { margin-left:auto; }`.
  - `.fleet-pills { display:flex; flex-wrap:wrap; gap:0.4rem; }`; `.fleet-pill` rounded-full, `--barracks-surface-interactive` bg, border `--barracks-border-strong`; `[aria-pressed="true"]` uses `--barracks-action` / `--barracks-action-text`; `.fleet-pill-dot` 8px circle: connected `--barracks-state-success`, connecting `--barracks-state-warning`, unavailable `--barracks-state-danger`; `.fleet-pill-count` bold tabular.
  - `.fleet-stream { position:relative; }` and `.fleet-card-badge { position:absolute; z-index:2; top:8px; left:8px; max-width:calc(100% - 64px); padding:2px 8px; border-radius:999px; background: color-mix(in srgb, var(--barracks-canvas) 78%, transparent); color: var(--barracks-text-raised); font-size:11px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; pointer-events:none; }`, `.is-stale` border `--barracks-state-warning`.
  - `.fleet-overview.is-empty` removes extra padding so the strip is ≤ 110px.
- [ ] **Step 3: Fixture script** — in `scripts/check-fleet-ui.cjs` replace `getByLabel('Show activity').selectOption('extra')` with `getByRole('group', { name: 'Show activity' }).getByRole('button', { name: /^Extra/ }).click()` (match the fixture server's name; read it from the `extras` array in the script) and `selectOption('all')` with the `All` pill. The text assertion `Stale · last known activity` stays (it is inside the badge).
- [ ] **Step 4: Verify.** Gate. Run the fixture script against the dev server (`BARRACKS_BASE_URL=http://127.0.0.1:5173 …`) → exit 0 (Review Focus 1, 5). Live Home at 1440×900 with 4 servers and nothing playing: `.fleet-overview` height ≤ 110px. Stub one stream: badge visible top-left of the card, card grid starts directly under the pills. Kiosk (`/kiosk`): no Manage link, no controls in the card popout (Review Focus 4). Activity → Live uses the same compact widget.
- [ ] **Step 5: Commit** `feat(fleet): compact multi-server Active Sessions widget`

---

### Task 4: Mobile and regression sweep

- [ ] **Step 1:** 390×844 with 8 fixture servers with long names (Playwright-stubbed `/fleet`): pills wrap, `document.documentElement.scrollWidth <= innerWidth`, badge does not cover the card's play/title row (Review Focus 3).
- [ ] **Step 2:** Theme harness UI script against :5173 → 47 PASS (the stateMatrix pagination failure is pre-existing), no overflow in any screenshot.
- [ ] **Step 3:** Fix anything found; commit `fix(fleet): <what>` if needed.

## Out of scope

- Single-server widget (already upstream-shaped).
- Hub tabs.
