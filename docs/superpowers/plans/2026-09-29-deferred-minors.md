# Deferred Minors Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every minor finding deferred by the five JellyGlance-parity plans (sessions/activity, sidebar/density, activity header, fleet overview, hubs), and repair the theme harness so all four themes are captured again.

**Architecture:** Six independent tasks grouped by area. Pure logic changes are test-first (`node:test`); UI/CSS changes are verified with Playwright against the dev server and, at the end, the full theme harness across all themes.

**Tech Stack:** React 18, Express, `node:test`, Playwright, the repo's fixture scripts.

**Spec:** "Fix the deferred minors across all the plans" (user, 2026-09-29). The inventory below is the complete list; each line cites the plan it came from.

## Inventory (24 items)

| # | Plan | Item |
|---|------|------|
| a | sessions/activity | `/stats/getAllUserActivity` swallows errors as `[]`, so a Silo outage shows the timeline's "no users" state instead of its users error |
| b | sessions/activity | Silo timeline item lookups use the full client timeout; worst case far beyond the ~9.5s cold load |
| c | sessions/activity | FleetOverview with zero enabled servers says "No Active Sessions Found" instead of "not configured" |
| d | sidebar/density | `home.css` large-widget padding rule deleted instead of set to upstream `0.7rem 0.8rem` |
| e | sidebar/density | `navbar.css` has 3 empty `@media` blocks and a stray "Install app button" comment |
| f | sidebar/density | collapsed rail is 78px set inline after first paint (upstream 4.875rem via `html.jg-nav-collapsed`), so a saved collapsed state flashes full width on load |
| g | sidebar/density | library-detail fixed `::before` grid sits inside the scaled page and stops short of the viewport bottom on short pages |
| h | sidebar/density | `.app-shell-main` is `overflow:auto` without a fixed height, so sticky headers (users, settings, stats) never stick |
| i | activity header | focus drops to `<body>` after choosing or clearing a title |
| j | activity header | 150ms blur timer not cleared on refocus |
| k | activity header | status rows live inside `role=listbox`; `aria-controls` points at a missing id when closed |
| l | fleet | two of three `emptyText` branches are unreachable |
| m | fleet | "N streaming · M paused" reads as additive although paused is included |
| n | fleet | "Last seen" shows a time without a date |
| o | fleet | badge server name and stale state run together for screen readers |
| p | fleet | pill connection state is colour-only until hover/focus |
| q | fleet | hidden `data-testid="fleet-total"` span exists only for tests |
| r | fleet | duplicate `.fleet-footnote` and `.server-settings input` rules |
| s | hubs | Home/Integrations still link `/wizarr`, `/automation-health` |
| t | hubs | tab clicks push history entries, even on the active tab |
| u | hubs | `role=tablist` on `<nav>`, no `tabpanel`/`aria-controls`, no arrow keys |
| v | hubs | first switch to an unloaded tab shows blank content (Suspense `null`) |
| w | hubs | "Server" nav label hard-coded English |
| x | hubs | availability flag keys duplicated in `hub-tabs.js` and `navbar.jsx` |
| y | hubs | hidden-link settings for Invites/Automation Health no longer apply |
| z | sidebar/density | theme harness stops at its state matrix (pre-existing), so only the default theme is captured |

(25 rows: y is resolved as a ruling — see Task 5.)

## Global Constraints

- Only `--barracks-*` colour tokens; Silo/Barracks copy.
- Gate per task: `npm test && npm run lint && npm run build && npm run theme:check && npm run branding:check && git diff --check`.
- `scripts/check-fleet-ui.cjs` must stay green after Task 3.

## Review Focus

1. Sticky headers (h) must not break horizontal clipping: no page may gain horizontal scroll at 1440 or 390.
2. Collapsed-rail change (f) must keep the collapsed tooltip rail usable and expand back to 179px.
3. Focus management (i) must not steal focus on initial render or when the page loads with a pre-selected item.
4. Timeline deadline (b) must still return the partial timeline (movies and unresolved episodes) when lookups time out, never an error.
5. Harness repair (z) must not weaken assertions for non-Silo behaviour; Silo-specific branches only.

---

### Task 1: Backend — timeline users error and lookup deadline (a, b)

**Files:** `apps/api/routes/stats.js` (`/getAllUserActivity`), `apps/api/classes/silo/timeline.js`, `apps/api/tests/silo-timeline.test.js`, `apps/web/src/pages/activity_time_line.jsx` (only if it needs the error status).

- [ ] **Step 1 (a):** In the Silo branch of `/getAllUserActivity`, catch upstream errors and respond `res.status(error.status >= 400 && error.status < 600 ? error.status : 503).json({ error: "Unable to load Silo users" })`. The non-Silo SQL branch keeps its existing `[]` fallback. The timeline page already maps request failures to `ACTIVITY_STATES.TIMELINE_USERS_ERROR`.
- [ ] **Step 2 (b) failing test** in `silo-timeline.test.js`:

```js
test('slow item lookups are cut off and the timeline still returns', async () => {
  const api = {
    enrichmentTimeoutMs: 20,
    async getPlaybackHistoryPage() { return { results: [ep('slow', '2026-09-02T00:00:00Z', 10)], hasMore: false }; },
    async _detail(id, options) {
      assert.ok(options?.deadlineAt, 'lookups carry a deadline');
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { series_id: 1, series_title: 'Late', season_number: 1 };
    },
  };
  const started = Date.now();
  const out = await buildSiloTimeline(api, 'u1', { lookupBudgetMs: 50 });
  assert.ok(Date.now() - started < 180, 'did not wait for slow lookups');
  assert.deepEqual(out.map(r => r.Title), ['Ep slow']);
});
```

- [ ] **Step 3:** Implement: `buildSiloTimeline(api, userId, { lookupBudgetMs = 8000 } = {})` computes `deadlineAt = Date.now() + lookupBudgetMs` before the lookup loop; each `_detail(id, { deadlineAt, timeoutMs: api.enrichmentTimeoutMs })` is raced against the remaining budget (`Promise.race` with a timer that resolves `null`), and the loop stops starting batches once the deadline passes. Unresolved episodes fall back to their own titles (existing behaviour).
- [ ] **Step 4:** PASS, suite PASS, gate. **Commit** `fix(silo): bound timeline lookups and surface user-list failures`

### Task 2: Activity search focus and ARIA (i, j, k)

**Files:** `apps/web/src/pages/components/activity/history-item-search.jsx`, `apps/web/src/pages/css/activity.css`.

- [ ] **Step 1:** Keep a ref to the input and one to the chip's clear button. After `choose()` focus the clear button; after clearing, focus the input. Only move focus in response to those user actions (Review Focus 3), via a `pendingFocus` ref consumed in an effect after render.
- [ ] **Step 2:** Store the blur timer in a ref; clear it in `onFocus` and on unmount.
- [ ] **Step 3:** Render the listbox only when there are result options; render status text ("Searching…", "No movies or episodes match", errors) in a sibling `<p className="activity-search-status" role="status" aria-live="polite">` inside the dropdown container. Set `aria-controls` only while the listbox is rendered.
- [ ] **Step 4: Verify** with the Task-3 Playwright scripts from the activity plan (`t3.cjs`, `rf-fix.cjs`, re-created from the plan text if missing) plus: after picking, `document.activeElement` is the clear button; after clearing, it is the search input; `[role=listbox]` never contains non-option children. Gate. **Commit** `fix(activity): keep focus and ARIA roles correct in title search`

### Task 3: Fleet widget polish (c, l, m, n, o, p, q, r)

**Files:** `apps/web/src/lib/fleet-summary.js` (+ test), `apps/web/src/pages/components/sessions/FleetOverview.jsx`, `apps/web/src/pages/css/fleet.css`, `scripts/check-fleet-ui.cjs` (only if assertions reference removed markup).

- [ ] **Step 1 failing tests** (append to `fleet-summary.test.js`):

```js
test('summary exposes playing streams separately from the active total', () => {
  const s = summarizeFleet({ ...snap, playingStreams: 2, partial: false, servers: snap.servers.map(v => ({ ...v, playingStreams: v.id === 'p' ? 1 : null })) }, 'all', '');
  assert.deepEqual([s.total, s.playing, s.paused], [3, 2, 1]);
  assert.equal(summarizeFleet(snap, 'p', '').playing, 1);
  assert.equal(summarizeFleet(snap, 'all', 'down').playing, null);
});

test('no enabled servers is its own state', () => {
  assert.equal(summarizeFleet({ servers: [{ id: 'off', enabled: false }] }, 'all', '').enabled, 0);
});
```

(`snap` gains `playingStreams: 2`; server `p` gains `playingStreams: 1`.)

- [ ] **Step 2:** Implement `playing` in `summarizeFleet` (`snapshot.playingStreams` / `selected.playingStreams`, `null` on error). Summary text becomes `<strong data-testid="fleet-total">{total}</strong> active · {playing} playing · {paused} paused · C/E servers` (m).
- [ ] **Step 3 (c):** In the single-server branch, when `enabled === 0` render `Active Sessions` + "No Silo servers are enabled." + `Manage servers` link (not in kiosk).
- [ ] **Step 4 (l):** Remove unreachable `emptyText` branches; the multi-server empty strip always reads "No Active Sessions Found".
- [ ] **Step 5 (q):** Remove the hidden `fleet-total` span from the empty strip; run `check-fleet-ui.cjs` — if an assertion needs it, change that assertion to the visible empty-strip text instead.
- [ ] **Step 6 (n):** "Last seen" uses `toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })`.
- [ ] **Step 7 (o, p):** Badge state gets a visually hidden `", "` separator (`.visually-hidden`); each non-connected pill includes a visually hidden state word ("connecting" / "unavailable") so its accessible name carries state.
- [ ] **Step 8 (r):** Merge the duplicate `.fleet-footnote` and `.server-settings input` rules (keep combined declarations, later values win).
- [ ] **Step 9:** Tests PASS; `check-fleet-ui.cjs` against :5173 PASS; gate. **Commit** `fix(fleet): clearer summary, empty and state labelling`

### Task 4: Hubs polish (s, t, u, v, w, x)

**Files:** `apps/web/src/pages/home.jsx:1271,1284,1297`, `apps/web/src/pages/integrations.jsx:804,969`, `apps/web/src/pages/components/general/PageTabs.jsx`, `apps/web/src/lib/hub-tabs.js`, `apps/web/src/pages/components/general/navbar.jsx`, `apps/web/src/lib/navdata.jsx`, `apps/web/public/locales/*/translation.json`.

- [ ] **Step 1 (s):** Point links at `/users?tab=invites` and `/server-management?tab=automation`.
- [ ] **Step 2 (t):** Tab click: skip when already selected; otherwise `setParams({ tab }, { replace: true })`.
- [ ] **Step 3 (u):** Tab bar becomes `<div role="tablist" aria-label>`; each tab gets `id="hub-tab-<id>"`, `aria-controls="hub-panel-<id>"`, roving `tabIndex` (0 on active, -1 otherwise) and Left/Right/Home/End keys that move focus and select; the content wrapper is `<div role="tabpanel" id="hub-panel-<id>" aria-labelledby="hub-tab-<id>" tabIndex={0}>` (only when the bar is shown).
- [ ] **Step 4 (v):** Suspense fallback renders the existing `Loading` component.
- [ ] **Step 5 (w):** Add `MENU_TABS.SERVER` to every locale file (`en*`: "Server", `de`: "Server", `es`: "Servidor", `pl`: "Serwer"; any other locale: "Server"), use `<Trans i18nKey="MENU_TABS.SERVER" />` for the nav text, and remove the now-unused `MENU_TABS.JELLYFIN_JOBS` keys. Run `npm run i18n:check` if present.
- [ ] **Step 6 (x):** Export `WIZARR_NAV_AVAILABLE_KEY` and `AUTOMATION_HEALTH_NAV_AVAILABLE_KEY` from `hub-tabs.js`; `navbar.jsx` imports them instead of redefining.
- [ ] **Step 7: Verify** with the hubs Playwright checks (flags off/on, redirects, active nav) plus: three clicks on the active tab leave history length unchanged; ArrowRight moves between Users/Invites; tabpanel is labelled. Gate. **Commit** `fix(nav): accessible hub tabs, direct links and translated Server label`

### Task 5: Layout and CSS (d, e, f, g, h) + ruling y

**Files:** `apps/web/src/pages/css/home.css`, `apps/web/src/pages/css/navbar.css`, `apps/web/src/pages/components/general/navbar.jsx`, `apps/web/src/pages/css/variables.css`, `apps/web/src/pages/css/library-detail.css`, `apps/web/src/App.css`.

- [ ] **Step 1 (d):** Restore upstream's `.home-widget-size-large.home-week-pulse, … .home-milestones { padding: 0.7rem 0.8rem; }`.
- [ ] **Step 2 (e):** Delete the three empty `@media` blocks and the stray comment.
- [ ] **Step 3 (f):** Replace the inline width with a class: `html.jg-nav-collapsed { --jg-sidebar-width: 4.875rem; }` in `navbar.css`; navbar toggles the class in `useLayoutEffect` (before paint) and `index.jsx` adds it synchronously from `localStorage` before `createRoot().render` so there is no flash. Verify collapsed rail width ≈ 63px, tooltips work, expand returns to 179px (Review Focus 2).
- [ ] **Step 4 (g):** `.library-detail-page { position: relative; }` and its `::before` becomes `position: absolute; inset: 0; min-height: 100%`, with the page's `min-height: calc(100dvh / var(--jg-content-scale, 1))` on desktop so the grid reaches the viewport bottom on short pages.
- [ ] **Step 5 (h):** `.app-shell-main`: replace `overflow: auto; overflow-x: hidden` with `overflow-x: clip` (and the same in the mobile rule) so the document is the scroll container and sticky headers stick. Verify Users/Settings/Stats headers stay pinned on scroll and no horizontal scroll appears anywhere (Review Focus 1).
- [ ] **Ruling (y):** Hidden-link entries `wizarr` / `automation-health` are no longer nav links; they are dropped (hub tabs are page content, not nav items). Ledger this as a ruling; no code.
- [ ] **Step 6:** Gate. **Commit** `fix(theme): sticky headers, collapsed rail and leftover layout rules`

### Task 6: Theme harness repair and full sweep (z)

**Files:** `scripts/check-universal-theme-ui.cjs`.

- [ ] **Step 1:** Run the harness; for each failing step, adapt only its Silo expectations: accept `.activity-cursor-pagination` alongside MUI pagination; for Statistics, use the Silo overview's visible content when the "Count" tab is absent (branch on the tab's existence, keep the original assertions when it exists) (Review Focus 5). Iterate until the state matrix and theme-switching phases complete.
- [ ] **Step 2:** Run the full harness (all phases, all themes) against :5173 → exit 0; confirm screenshot count > 92 and no horizontal overflow in any screenshot.
- [ ] **Step 3:** **Commit** `test(theme): run the full theme harness against Silo mode`

## Out of scope

- New features or parity items not in the inventory.
