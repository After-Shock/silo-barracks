# JellyGlance UI Parity (Live Sessions + Activity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Barracks' Live Sessions and Activity surfaces look, size and behave like current JellyGlance (`upstream/main` `370aae3`, v1.2.11+), driven by Silo API v2 data, while keeping the Barracks colour scheme.

**Architecture:** Port upstream presentation (density tokens, session card popout, message templates, sessions widget layout, activity header/timeline) onto the existing Silo adapters. Anything upstream renders from Jellyfin-only data is either derived honestly from Silo v2 fields or omitted — never faked. Backend changes are limited to the session mapper and a Silo branch for the timeline endpoints.

**Tech Stack:** React 18 + Vite, react-bootstrap, MUI (Activity table/timeline), Express API, `node:test`.

**Spec:** This document's "Analysis" section (no separate spec). Upstream reference: `git show upstream/main:<path>` after `git fetch upstream`.

## Analysis (why this plan exists)

- Barracks forked JellyGlance at `b474638` (v1.2.3-beta.3). Upstream `main` is now **208 commits ahead** (through v1.2.11). The previous parity pass (`docs/jellyglance-parity-review.md`) compared against `upstream/BETA` `bf949ec`, which is **167 commits behind** `upstream/main` — so it measured against a stale target.
- **Biggest "feel" gap is density**, not components. Upstream sets root font to `--jg-font-size` (~13px) and, on desktop, scales most pages to `--jg-content-scale: 0.82` (`App.css`). Barracks has neither, so every page (incl. Activity) renders roughly 20–25% larger.
- **Live Sessions**: upstream `session-card.jsx` gained (a) Viewer/Client rows with avatar and platform icon in the popout, (b) transcode-reason line, (c) a transcode progress bar, (d) a Message modal with 27 grouped templates, `{user}/{device}/{title}/{time}` placeholders and a `datetime-local` picker, (e) `SessionCardDetailRow` layout for stream rows, (f) Seerr/download/Tdarr "glance strip". Barracks has richer, capability-gated controls (pause/resume/stop/terminate/message) but a bare text input for messages and none of (a)–(e).
- **Sessions widget**: upstream is a heading + card grid with a loading strip and a dedicated empty state. Barracks in Silo mode always renders `FleetOverview` (totals, server grid, filter select) — even with one server — so it never looks like JellyGlance. `kiosk` is also not passed through.
- **Activity**: upstream deltas since fork are small: design tokens in `activity.css`, header copy with an "Open Timeline view" link, and hardened localStorage reads. Barracks' Silo Activity (`silo-activity.jsx`) is structurally fine but not token-sized.
- **Timeline**: upstream promotes `/timeline` to a top-level nav item. In Barracks Silo mode it is **broken**: it calls Jellyfin SQL (`fs_get_user_activity`, `/stats/getAllUserActivity`) which Silo never populates.
- **Silo v2 data limits** (from `apps/api/tests/fixtures/silo-v2/openapi.json`): `AdminPlaybackSession` has `video_decision`, `audio_decision`, `requested_video_resolution`, `requested_video_codec`, `source_*`/`target_*` but **no transcode reasons and no transcode progress**. `AdminPlaybackHistoryEntry` has **no series name** (resolve via item detail). The mapper currently sets `TranscodingInfo.CompletionPercentage` from *playback* position, which would render a fake transcode bar once upstream's card is ported.

## Global Constraints

- Keep all `--barracks-*` colour tokens; never introduce raw hex/rgb in CSS — `npm run theme:check` must pass.
- Visible copy says "Silo"/"Barracks", never "Jellyfin"/"JellyGlance" — `npm run branding:check` must pass.
- Never show a value Silo did not supply (no fabricated zeros, reasons, or progress).
- Controls remain capability-gated through the existing `/api/session-controls/*` and `/fleet/sessions/*` endpoints; no new mutation endpoints.
- Gate for every task: `npm test && npm run lint && npm run build && npm run theme:check && npm run branding:check`.

## Review Focus

1. Session with `video_decision: "transcode"` but no `requested_*` fields → reason reads "Video transcode", never an empty "()" fragment. (Task 2 test)
2. Message template whose `{time}` is filled then user edits text → edits are kept, template resets to Custom. (Task 3 test)
3. One configured server that is `unavailable` → single-server layout still shows the error + Retry, not a silent empty state. (Task 5 manual check)
4. Timeline for a user whose history contains episodes whose item detail 404s → entry falls back to `media_title`, request still succeeds. (Task 7 test)
5. Timeline history longer than the scan cap → bounded, no infinite cursor loop. (Task 7 test)

---

### Task 1: Density tokens (the global "feel")

**Files:**
- Modify: `apps/web/src/pages/css/variables.css` (top of `:root`)
- Modify: `apps/web/src/index.css` (the `html`/`body` font-size rule)
- Modify: `apps/web/src/App.css` (after `.app-shell-main` rules)
- Modify: `apps/web/src/pages/css/activity.css` (header padding/title)

**Interfaces:** Produces CSS vars `--jg-font-size`, `--jg-content-scale`, `--jg-page-pad`, `--jg-type-display`, `--jg-type-title`, `--jg-type-stat` used by Tasks 4–6.

- [ ] **Step 1: Add tokens** to the top of `:root` in `variables.css` (values copied verbatim from upstream `variables.css:2-9`):

```css
    --jg-font-size: clamp(12.5px, 0.1vw + 12.1px, 13px);
    --bs-root-font-size: var(--jg-font-size);
    --jg-content-scale: 0.82;
    --jg-page-pad: clamp(0.55rem, 0.7vw, 0.8rem);
    --jg-type-display: clamp(1.55rem, 2vw, 2rem);
    --jg-type-title: clamp(1.1rem, 1.2vw, 1.3rem);
    --jg-type-stat: clamp(1.25rem, 1.45vw, 1.55rem);
```

- [ ] **Step 2: Root font.** In `index.css`, set `html { font-size: var(--jg-font-size, 13px); background: var(--barracks-canvas); }` and add the upstream mobile override:

```css
@media (max-width: 700px) {
  html { font-size: clamp(14px, 3.6vw, 15px); }
}
```

- [ ] **Step 3: Desktop content scale.** Append to `App.css` (upstream `App.css:18-29`, using Barracks' existing exclusion list from `App.css:24` so full-bleed pages are untouched):

```css
@media (min-width: 901px) and (hover: hover) {
  .app-shell-main > *:not(:is(.about-page, .downloads-page, .integrations-page, .libraries, .repair-hub, .settings, .transcodes-page, .watch-stats, .user-profile-page, .Home)) {
    transform: scale(var(--jg-content-scale, 0.82));
    transform-origin: top left;
    width: calc(100% / var(--jg-content-scale, 0.82)) !important;
  }
}
```

- [ ] **Step 4: Activity header tokens.** In `activity.css` replace the three literal values upstream replaced: page padding → `var(--jg-page-pad) clamp(0.6rem, 1.2vw, 1rem) 1.4rem`; header `margin-bottom: 1.1rem; padding: 1rem;`; title `font-size: var(--jg-type-display);`. Add `color-scheme: dark;` to `.activity-table-shell` in `css/activity/activity-table.css`.

- [ ] **Step 5: Verify.** Run the gate. Then `npm run dev -w @jellyglance/web`, open `/activity` and `/` at 1440×900 beside a JellyGlance screenshot (`git show upstream/main:site/public/screenshots/Activity.png > /tmp/a.png` if present, else the README screenshot). Check modals (MUI/Bootstrap portals render outside `.app-shell-main`, so they are not double-scaled) and MUI table column menus still position correctly.

- [ ] **Step 6: Commit** `feat(theme): adopt JellyGlance density tokens`

---

### Task 2: Honest transcode reasons in the Silo session mapper

**Files:**
- Modify: `apps/api/classes/silo/mappers.js:70-82` (`transcoding` object)
- Test: `apps/api/tests/silo-session-diagnostics.test.js`

**Interfaces:** Produces `session.TranscodingInfo.TranscodeReasons: string[]` (human-readable, may be empty) and removes `TranscodingInfo.CompletionPercentage`. Task 4 consumes both.

- [ ] **Step 1: Failing tests** — append:

```js
test('transcode reasons are derived only from Silo decisions and requested targets', () => {
  const s = sessionToJellyfin({ session_id: 's', user_id: 'u', effective_play_method: 'transcode',
    video_decision: 'transcode', audio_decision: 'direct', source_video_resolution: '2160p',
    requested_video_resolution: '1080p', source_video_codec: 'hevc', requested_video_codec: 'h264',
    file_duration: 100, position_seconds: 50 }, null, 'server');
  assert.deepEqual(s.TranscodingInfo.TranscodeReasons, ['Video transcode (2160p → 1080p, hevc → h264)']);
  assert.equal(s.TranscodingInfo.CompletionPercentage, undefined);
  const bare = sessionToJellyfin({ session_id: 'b', user_id: 'u', effective_play_method: 'transcode',
    video_decision: 'transcode', audio_decision: 'transcode' }, null, 'server');
  assert.deepEqual(bare.TranscodingInfo.TranscodeReasons, ['Video transcode', 'Audio transcode']);
  const direct = sessionToJellyfin({ session_id: 'd', user_id: 'u', effective_play_method: 'direct' }, null, 'server');
  assert.equal(direct.TranscodingInfo, null);
});
```

- [ ] **Step 2:** `node --test apps/api/tests/silo-session-diagnostics.test.js` → FAIL (reasons `[]`, CompletionPercentage defined).

- [ ] **Step 3: Implement.** Add above `sessionToJellyfin`:

```js
function transcodeReasons(row) {
  const change = (from, to) => (from && to && String(from) !== String(to) ? `${from} → ${to}` : '');
  const reasons = [];
  if (String(row.video_decision || '').toLowerCase() === 'transcode') {
    const detail = [change(row.source_video_resolution, row.requested_video_resolution),
      change(row.source_video_codec, row.requested_video_codec)].filter(Boolean).join(', ');
    reasons.push(detail ? `Video transcode (${detail})` : 'Video transcode');
  }
  if (String(row.audio_decision || '').toLowerCase() === 'transcode') reasons.push('Audio transcode');
  return reasons;
}
```

In the `transcoding` object delete the `CompletionPercentage:` line (Silo has no transcode progress; it was playback position) and set `TranscodeReasons: transcodeReasons(row),`.

- [ ] **Step 4:** Run the test file → PASS; run `npm test` → all PASS.
- [ ] **Step 5: Commit** `fix(silo): derive transcode reasons and drop fake transcode progress`

---

### Task 3: Session message templates module

**Files:**
- Create: `apps/web/src/lib/session-messages.js`
- Test: `apps/web/src/lib/session-messages.test.js`

**Interfaces:** Produces `SESSION_MESSAGE_TEMPLATES` (array of `{id,label,emoji,group,text,needsTime?,defaultMinutes?,defaultTonight?}`), `SESSION_MESSAGE_TEMPLATE_GROUPS: string[]`, `defaultMessageDateTime(minutesAhead=15): string` (`YYYY-MM-DDTHH:mm`), `timeForTemplate(template): string`, `formatMessageTime(value, twelveHour=false): string`, `applySessionMessageTemplate(template, session, title, timeValue, twelveHour=false): string`.

- [ ] **Step 1: Failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_MESSAGE_TEMPLATES, SESSION_MESSAGE_TEMPLATE_GROUPS, applySessionMessageTemplate,
  defaultMessageDateTime, timeForTemplate } from './session-messages.js';

test('templates fill placeholders with safe fallbacks', () => {
  const t = SESSION_MESSAGE_TEMPLATES.find(x => x.id === 'checkin').text;
  assert.equal(applySessionMessageTemplate(t, { UserName: 'Sam', DeviceName: 'TV' }, 'Heat', ''),
    'Hi Sam on TV — can you check in when you get a moment?');
  assert.equal(applySessionMessageTemplate('{user} {device}', {}, '', ''), 'there your device');
});

test('time-based templates get a future local datetime', () => {
  assert.match(defaultMessageDateTime(10), /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
  assert.ok(new Date(timeForTemplate({ defaultTonight: true })).getTime() > Date.now());
});

test('copy is Silo-branded and groups are ordered by first appearance', () => {
  assert.ok(!JSON.stringify(SESSION_MESSAGE_TEMPLATES).includes('Jellyfin'));
  assert.deepEqual(SESSION_MESSAGE_TEMPLATE_GROUPS, ['Write your own', 'Playback', 'Household', 'Server', 'Maintenance']);
});
```

- [ ] **Step 2:** `node --test apps/web/src/lib/session-messages.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement.** Copy the helpers and template list from upstream (`git show upstream/main:apps/web/src/pages/components/sessions/session-card.jsx`, the block from `function defaultMessageDateTime` through `SESSION_MESSAGE_TEMPLATE_GROUPS`) into the new file, then make exactly these changes:
  - `export` each of the six names listed in Interfaces.
  - `formatMessageTime(value, twelveHour = false)` takes the flag as a parameter instead of reading `localStorage` (keeps the module pure/testable); pass it through `applySessionMessageTemplate(template, session, title, timeValue, twelveHour = false)`.
  - Add `export function timeForTemplate(template) { return template?.defaultTonight ? tonightMessageDateTime() : defaultMessageDateTime(Number(template?.defaultMinutes || 15)); }`.
  - Template `restart`: label `"Restarting server"`, text `"The server is restarting at {time}. Playback on {device} will drop — pause before then."`.

- [ ] **Step 4:** Test → PASS. `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(sessions): add message template helpers`

---

### Task 4: Session card and popout parity

**Files:**
- Modify: `apps/web/src/pages/components/sessions/session-card.jsx`
- Modify: `apps/web/src/pages/css/sessions.css`

**Interfaces:** Consumes Task 2 `TranscodingInfo.TranscodeReasons`, Task 3 exports. Keeps props `canControl`, `hideIpAddress`; adds optional `kiosk` (boolean — when true, controls hidden). `runControl(action, text?)` gains an optional message text argument.

- [ ] **Step 1: Transcode reason.** Add upstream `formatTranscodeReasons(session)` (verbatim from upstream `session-card.jsx`) at top of file. In the popout hero copy, after the status row, render `{transcodeReason ? <p className="session-popout-reason">{transcodeReason}</p> : null}`; in `.session-popout-grid` add `{transcodeReason ? <SessionDetailItem label="Transcode reason" value={transcodeReason} wide /> : null}`. Do **not** port the transcode progress bar (`session-transcode-progress`/`progress-transcode`): Silo supplies no transcode progress.

- [ ] **Step 2: Viewer/Client rows.** Replace the existing user/client `SessionDetailItem`s in `.session-popout-grid` with upstream's `session-popout-viewer` and `session-popout-client` blocks (avatar via existing `/proxy/Users/Images/Primary` URL builder already used by this card — reuse whatever helper this file uses for the fleet vs primary avatar, do not hardcode primary; `PlatformIcon` is already imported). Show `ProfileName` after the username when present: `<strong>{session.UserName}{session.ProfileName ? ` · ${session.ProfileName}` : ""}</strong>`.

- [ ] **Step 3: Card stream rows.** Add upstream `SessionCardDetailRow` component and convert the Container/Video/Audio/Subtitles rows in the card body to it (upstream JSX, with `short` on each).

- [ ] **Step 4: Message modal.** Keep the capability-gated `session-controls` section and its Pause/Resume/Stop/Terminate buttons. Replace the inline `session-control-message` `FormControl` with a single `Message` button (`className="session-command is-message"`, `ChatSmile2LineIcon`) that opens a second `<Modal contentClassName="session-message-modal">` ported from upstream (template picker, `datetime-local` when `needsTime`, textarea, Cancel/Send footer). Wire Send to `runControl("message", messageText.trim())`, and change `runControl` so `payload = action === "message" ? { message: text ?? controlMessage, title: "Barracks administrator" } : {}`. Read `twelveHour` once with `try { JSON.parse(localStorage.getItem("12hr")) } catch { false }` and pass it to the Task 3 helpers. On success close the message modal and reset template to `custom`. Hint copy: "It shows as an on-screen notice on their Silo client." Textarea `maxLength={2048}`.

- [ ] **Step 5: Kiosk.** `const canControl = Boolean(props.canControl) && !props.kiosk;` and use it everywhere `props.canControl` is read.

- [ ] **Step 6: CSS.** Copy these selector blocks from `git show upstream/main:apps/web/src/pages/css/sessions.css` into `sessions.css`: `.session-details-value-short`, `.session-popout-reason`, `.session-popout-viewer*`, `.session-popout-client*`, `.session-popout-actions`, `.session-command*`, `.session-action-error`, `.session-message-*`. Replace every literal colour with the nearest `--barracks-*` token (see `variables.css`); run `npm run theme:check` until clean.

- [ ] **Step 7: Verify.** Gate passes. Manual: start a Silo transcode, open the popout — reason line shows, Message → pick "Bedtime" → change time → text updates → edit text → template shows Custom → Send → Silo client shows notice. Stop still confirms. Kiosk URL (`/kiosk`) shows no controls.

- [ ] **Step 8: Commit** `feat(sessions): port JellyGlance popout, detail rows and message templates`

---

### Task 5: Sessions widget matches JellyGlance for single-server installs

**Files:**
- Modify: `apps/web/src/pages/components/sessions/FleetOverview.jsx`
- Modify: `apps/web/src/pages/components/sessions/sessions.jsx:171` (pass `kiosk`)
- Modify: `apps/web/src/pages/css/fleet.css` (only if needed)

**Interfaces:** `FleetOverview({ surface, canControl })` unchanged externally; passes `kiosk={surface === "kiosk"}` to `SessionCard`.

- [ ] **Step 1: Single-server branch.** When `servers.filter(s => s.enabled).length <= 1`, render the upstream widget shape instead of the fleet header/totals/grid/select:

```jsx
if (enabledServers.length <= 1) {
  if (!snapshot && !error) return <div className="sessions-widget sessions-widget-loading">
    <h1 className="my-3">Active Sessions</h1>
    <div className="sessions-loading-strip" aria-hidden="true"><span /><span /></div></div>;
  return <div className="sessions-widget">
    <h1 className="my-3">Active Sessions</h1>
    {error && <p role="status" className="fleet-notice">{error} <button onClick={refresh}>Retry</button></p>}
    {!error && streams.length === 0
      ? <div className="sessions-empty-state">No Active Sessions Found</div>
      : <div className="sessions-container">{streams.map(({ server, session }) =>
          <ErrorBoundary key={`${server.id}:${session.Id}`}><SessionCard data={{ session: { ...session, FleetServerId: server.id } }}
            hideIpAddress={shouldHideActiveSessionIp(surface, privacy)} kiosk={surface === 'kiosk'}
            canControl={canControl && server.state === 'connected' && !session.stale} /></ErrorBoundary>)}</div>}
  </div>;
}
```

(`enabledServers`/`streams` computed above the branch; `streams` for single-server = that server's sessions.) Confirm `.sessions-loading-strip`, `.sessions-empty-state`, `.sessions-container` exist in `sessions.css`; if not, copy them from upstream `sessions.css` with tokenised colours.

- [ ] **Step 2: Multi-server.** Keep the fleet layout but render the streams list inside `<div className="sessions-container">` (card grid identical to upstream) and pass `kiosk` to `SessionCard`.

- [ ] **Step 3: Verify.** Gate passes. Manual: one server → page matches JellyGlance Home "Active Sessions" block; stop the Silo container → error + Retry appears (Review Focus #3); two servers → fleet totals remain.

- [ ] **Step 4: Commit** `feat(sessions): use JellyGlance session widget layout for single-server installs`

---

### Task 6: Activity page header parity

**Files:**
- Modify: `apps/web/src/pages/silo-activity.jsx:108-117`

- [ ] **Step 1:** Header copy → `<span>Review watch history, playback method, device, and session details. <Link to="/timeline">Open Timeline view</Link>.</span>` (keep the Live/History tabs; `Link` already imported). Keep `view` default `"history"` so the page opens on the table like JellyGlance.
- [ ] **Step 2:** Gate passes; visually compare `/activity` against upstream Activity screenshot at desktop and 390px.
- [ ] **Step 3: Commit** `feat(activity): align header with JellyGlance`

(Task 6 is intentionally tiny and depends on Task 8 for the link to lead somewhere useful; land Task 8 in the same PR.)

---

### Task 7: Silo timeline backend

**Files:**
- Create: `apps/api/classes/silo/timeline.js`
- Modify: `apps/api/routes/api.js` (`/getActivityTimeLine` ~line 6266) and the `/stats/getAllUserActivity` route (find with `grep -n getAllUserActivity apps/api/routes/*.js`)
- Test: `apps/api/tests/silo-timeline.test.js`

**Interfaces:** Produces `historyToTimeline(rows, seriesById): TimelineRow[]` where `TimelineRow = { UserName, Title, EpisodeCount, FirstActivityDate, LastActivityDate, TotalPlaybackDuration, SeasonName, MediaType: 'movies'|'tvshows', NowPlayingItemId }` (same columns as SQL `fs_get_user_activity`), ordered by `LastActivityDate` desc. `rows` are `getPlaybackHistoryPage().results`; `seriesById` is `Map<itemId, { seriesTitle, seasonName, seriesId }>`.

- [ ] **Step 1: Failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { historyToTimeline } = require('../classes/silo/timeline');

const ep = (id, at, secs) => ({ NowPlayingItemId: id, SiloMediaType: 'episode', NowPlayingItemName: `Ep ${id}`,
  UserName: 'sam', ActivityDateInserted: at, PlaybackDuration: secs });

test('episodes group by series+season; movies stay single; newest first', () => {
  const rows = [ep('e2', '2026-09-02T00:00:00Z', 60), ep('e1', '2026-09-01T00:00:00Z', 40),
    { NowPlayingItemId: 'm', SiloMediaType: 'movie', NowPlayingItemName: 'Heat', UserName: 'sam',
      ActivityDateInserted: '2026-09-03T00:00:00Z', PlaybackDuration: 100 }];
  const series = new Map([['e1', { seriesTitle: 'Show', seasonName: 'Season 1', seriesId: 's' }],
    ['e2', { seriesTitle: 'Show', seasonName: 'Season 1', seriesId: 's' }]]);
  const out = historyToTimeline(rows, series);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map(r => r.Title), ['Heat', 'Show']);
  assert.equal(out[1].EpisodeCount, 2);
  assert.equal(out[1].TotalPlaybackDuration, 100);
  assert.equal(out[1].FirstActivityDate, '2026-09-01T00:00:00Z');
  assert.equal(out[1].MediaType, 'tvshows');
  assert.equal(out[1].NowPlayingItemId, 's');
});

test('episode without resolvable series falls back to its own title', () => {
  const out = historyToTimeline([ep('x', '2026-09-01T00:00:00Z', 5)], new Map());
  assert.equal(out[0].Title, 'Ep x');
  assert.equal(out[0].SeasonName, null);
});
```

- [ ] **Step 2:** `node --test apps/api/tests/silo-timeline.test.js` → FAIL.

- [ ] **Step 3: Implement** `timeline.js`:

```js
function historyToTimeline(rows, seriesById) {
  const groups = new Map();
  for (const row of rows) {
    const isEpisode = row.SiloMediaType === 'episode';
    const series = isEpisode ? seriesById.get(row.NowPlayingItemId) : null;
    const title = series?.seriesTitle || row.NowPlayingItemName || '';
    const key = series ? `s:${series.seriesId}:${series.seasonName}` : `i:${row.NowPlayingItemId}`;
    const at = row.ActivityDateInserted;
    const g = groups.get(key) || { UserName: row.UserName, Title: title, episodes: new Set(),
      FirstActivityDate: at, LastActivityDate: at, TotalPlaybackDuration: 0,
      SeasonName: series?.seasonName || null, MediaType: series ? 'tvshows' : 'movies',
      NowPlayingItemId: series?.seriesId || row.NowPlayingItemId };
    if (isEpisode) g.episodes.add(row.NowPlayingItemId);
    if (at < g.FirstActivityDate) g.FirstActivityDate = at;
    if (at > g.LastActivityDate) g.LastActivityDate = at;
    g.TotalPlaybackDuration += Number(row.PlaybackDuration) || 0;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map(({ episodes, ...g }) => ({ ...g, EpisodeCount: episodes.size }))
    .sort((a, b) => (a.LastActivityDate < b.LastActivityDate ? 1 : -1));
}
module.exports = { historyToTimeline };
```

- [ ] **Step 4:** Test → PASS.

- [ ] **Step 5: Route branch.** At the top of `/getActivityTimeLine` (after validation), add:

```js
if (API.isSilo) {
  // ponytail: scans newest 500 attempts and resolves ≤100 episode details; raise if users need deeper timelines
  const rows = [];
  let cursor;
  for (let i = 0; i < 5; i++) {
    const page = await API.getPlaybackHistoryPage({ limit: 100, cursor, userId });
    rows.push(...page.results);
    if (!page.hasMore || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  const episodeIds = [...new Set(rows.filter(r => r.SiloMediaType === 'episode').map(r => r.NowPlayingItemId))].slice(0, 100);
  const seriesById = new Map();
  for (const id of episodeIds) {
    try {
      const d = await API._detail(id);
      if (d?.series_id) seriesById.set(id, { seriesTitle: d.series_title || '', seriesId: String(d.series_id),
        seasonName: d.season_number != null ? `Season ${d.season_number}` : null });
    } catch {}
  }
  return res.send(historyToTimeline(rows, seriesById));
}
```

Silo mode ignores the `libraries` filter (history entries carry no library id); the Timeline UI hides it (Task 8). For the timeline users route, add `if (API.isSilo) return res.send((await API.getPlaybackHistoryUsers()).map(u => ({ UserId: u.Id, UserName: u.Name })));` — match the exact field names the existing route returns (check its SQL `SELECT`).

- [ ] **Step 6: Bound test** — add to `silo-timeline.test.js` a route-level test only if `apps/api/tests/fleet-routes.test.js` already has an Express harness you can reuse; otherwise assert the bound by extracting the loop into `collectTimelineRows(api, userId)` in `timeline.js` and testing it with a fake `api` whose `getPlaybackHistoryPage` always returns `hasMore: true` (expect exactly 5 calls and 500 rows).

- [ ] **Step 7:** `npm test` → PASS. **Commit** `feat(silo): serve activity timeline from playback history`

---

### Task 8: Timeline page + nav entry in Silo mode

**Files:**
- Modify: `apps/web/src/pages/activity_time_line.jsx`
- Modify: `apps/web/src/lib/navdata.jsx` (add Timeline after Activity, same shape as upstream `navdata.jsx:60-75`)

- [ ] **Step 1:** In `activity_time_line.jsx`, when `config.IS_SILO`, hide the library-filter control and send `libraries: []` (backend ignores it). Harden the stored-preference reads with upstream's `readStoredLibraries()` helper (verbatim).
- [ ] **Step 2:** Add the Timeline nav item (icon `TimeLineIcon` or whatever upstream uses in `navdata.jsx`).
- [ ] **Step 3:** Gate passes. Manual: `/timeline` → pick a user with watched episodes → series grouped by season, movie entries single, clicking an entry opens the item page.
- [ ] **Step 4: Commit** `feat(timeline): enable timeline for Silo and add nav entry`

---

## Not in this plan (deliberately)

- **Glance strip** (Seerr/download/Tdarr chips on session cards): depends on upstream's `session-glance-cache` + integration stitching that Barracks doesn't run. Add when those integrations are validated against Silo.
- **Transcode progress bar**: Silo v2 has no transcode progress field. Add if Silo exposes one.
- **Follow-up plans** (one each, same method): (1) nav restructure into hubs — `server-hub`, `statistics-hub`, `users-hub` with `PageTabs`, folding Wizarr/Automation Health; (2) Home command-center refresh (`home.jsx`/`home.css`, +334/-538 lines upstream); (3) Settings center (search, sidebar, +1.6k CSS lines); (4) `/me` "My Glance" page — needs a Silo profile-scoped source first.
