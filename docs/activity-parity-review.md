# Activity parity review

Compared Barracks working tree with JellyGlance BETA `bf949ec` (2026-09-18).
Scope: Activity history, shared history table/details, user/item history routes,
and a limited cross-check of live-session handling. This is source inspection plus
an isolated adapter reproduction, not live-server/browser acceptance testing.
No Activity implementation changes are included in this comparison.

## Correction after checking Silo's own implementation

The original review inspected one selected history endpoint too narrowly. Its
claims must not be read as limitations of Silo Activity or of the whole v2 API.
Checked current public Silo source at `0362b6daec2bf59e1205e7d3b35525e6848a90b9`
and the **full** contract at Barracks' pinned `8eeb9f3e` revision:

- Silo `web/src/pages/AdminActivity.tsx` uses `useAdminSessions` and
  `/api/v2/admin/sessions`. It has rich source/delivered audio/video/container,
  bitrate, client, IP, route-node and playback decision data. Search, method/node/
  type filters and sorting are implemented over the fetched live sessions.
- Silo `AdminPlaybackHistory.tsx` and `hooks/queries/admin/history.ts` separately
  use `/api/v2/admin/playback-history` for finalized attempts. Its entry schema
  and query fields have not changed between the selected fixture and current main.
  Historical diagnostics limitations below apply to **that response**, not to
  current live Activity. The Silo history view polls every 15 seconds and has
  user/profile/completion/item filters and manual refresh.
- `/api/v2/admin/stats` supplies catalog/user/storage totals and active streams.
- `/api/v2/admin/stats/playback-activity` supplies time buckets, reliability and
  active-profile metrics.
- `/api/v2/admin/stats/top-activity` supplies title/profile leaderboards backed by
  existing watch-history aggregates.
- All three stats endpoints above already existed in the full pinned contract.
  Their absence from Barracks' selected fixture was not evidence of an API gap.

Therefore the next implementation should map Silo's live, finalized-history and
aggregate data sources independently. Do not remove real features just because
Barracks has not integrated their endpoints. Profile leaderboards are not account
leaderboards, and source aggregate time windows must remain explicit.

This verification used public source/contracts, not the currently deployed server.

## Summary

The table presentation is largely inherited from JellyGlance, but the Silo path is
currently a raw, read-only attempt browser placed inside a grouped-history UI.
That difference explains much of the missing functionality and misleading feel.

### Comparison

| Workflow | JellyGlance BETA | Barracks with Silo |
| --- | --- | --- |
| Row meaning | Latest playback per item/episode and user, with grouped attempts | One finalized Silo attempt per row |
| Repeat plays | Aggregate play count/time and expandable attempts | `TotalPlays = 1`; one copied child is removed by the table, so no meaningful expansion |
| Search | Visible title search applied by the history SQL query | Search input hidden; primary route implements only current-upstream-page title/user/profile search; fleet route ignores search |
| Filters | Library, playback type and column filters routed to SQL | Library/type controls hidden; column filters remain visible, mostly ignored |
| Sort | Requested field routed to SQL | Sorting controls remain enabled, but response is always newest first |
| Pagination | Page-based SQL result | Cursor API replayed from the beginning to simulate pages; total is unknown |
| Playback details | Stream/source fields captured in playback history | Click opens a modal whose body renders nothing without `MediaStreams` |
| User/profile | User display/link | Account shown; available household profile name/id are not exposed in the table |
| Completion | Existing history model | Silo supplies completion and media duration, but the table does not expose them |
| Device/client/IP | Stored Jellyfin history fields | Not in the pinned Silo admin-history schema; blanks/placeholders |
| Artwork/detail links | Primary-server item/user links | Same links/proxies even for secondary-server history |
| Excluded users | Applied to Activity SQL query | Not applied by either Silo history route |
| Refresh | Hourly poll; no dedicated refresh button | Same hourly poll; no dedicated refresh/retry button |
| Delete | Deletes Barracks-owned history rows | Correctly disabled: Silo owns retention/history |

The reference is not flawless. Its hourly refresh, request-race handling, mutable
subrows and pagination-state ownership should not be copied as desired behavior.

## Priority defects

### P0 — wrong-server context and request races

`apps/web/src/pages/components/activity/activity-table.jsx` uses:

- `/libraries/item/:id` and `/users/:id` links;
- primary-server `/proxy/Items/Images/Primary` and `/proxy/Users/Images/Primary`.

`apps/api/classes/silo-fleet.js:playbackHistoryPage` adds server identity only at
the response envelope. Activity does not pass that identity into the table.
IDs can overlap between servers, so a secondary-server row can display or open a
primary-server item/account. The live `session-card.jsx` already avoids this by
suppressing primary-only links for additional servers; history does not.

`activity.jsx` also has no abort controller or request-generation guard. Switching
servers leaves old rows visible under the new selection while loading. A slower
previous request can overwrite a newer response. Failed server switches retain
old rows without identifying their source. Fix this before adding more controls.

### P1 — pagination is not a faithful cursor implementation

`SiloAPI.getPlaybackHistoryPage` traverses pages 1 through N for every request.
Reading pages 1–10 costs 55 upstream requests, not ten. There is no shared deadline
for that traversal or repeated-cursor detection. The page number is clamped to 100,
but the result still advertises page 101 when upstream has more history.

Isolated reproduction against the actual adapter with stubbed upstream responses:

| Requested page | Returned page | Advertised pages | Upstream requests |
| --- | --- | --- | --- |
| 1 | 1 | 2 | 1 |
| 2 | 2 | 3 | 2 |
| 100 | 100 | 101 | 100 |
| 101 | 100 | 101 | 100 |

The table shows numbered pages and a Last button, although there is no known last
page. Its internal pagination is separate from the parent `currentPage`; resetting
the parent on server change does not reset the table, and changing page size resets
the table without necessarily resetting the parent request page.

Preferred fix: cursor-based Previous/Next, a visited-cursor stack scoped by server,
page size and filters, plus a complete reset on query changes. Validate cursors and
apply a total request budget. Do not pretend `has_more` is a total page count.

### P1 — visible controls that do not change results

The table enables manual sorting and filtering for Silo. The primary API path only
maps exact `UserId` and `Completed` filters, neither of which has a dedicated UI
control. The normal username/title/date/duration/play-method column filters are
ignored. The fleet route instead expects `user_id`, `profile_id`, `media_item_id`
and `completed`, while Activity sends a JSON `filters` parameter.

Consequently, the same UI has different backend behavior for primary and secondary
servers. Unsupported query options should never silently succeed unchanged.

Search cannot be restored honestly by revealing the existing input: matching only
one upstream page yields false empty results even if later pages contain matches.

### P1 — empty detail dialog despite useful data being available

`StreamDetails` in `stream_info.jsx` returns null without `data.MediaStreams`.
Silo's adapter never supplies that field for history. Playback-method pills still
open that dialog, resulting in an empty body.

A Silo-specific attempt detail should show what is actually available: account,
profile, item, session ID, started/ended timestamps, watched seconds, media duration,
completion and playback method. Explain that historical codec/device/IP diagnostics
are unavailable; do not substitute a current live session's diagnostics.

The adapter uses the ended timestamp as the main Date, so start/end should be
explicitly labeled rather than appearing to be interchangeable with Jellyfin dates.

### P1 — broken continuity into user/item history

`/api/getUserHistory` and `/api/getItemHistory` still query
`jf_playback_activity_with_metadata`; `/api/getLibraryHistory` does likewise.
They do not branch to Silo history. Silo history is intentionally not inserted into
those tables, so these routes cannot provide the same activity as the main page.
Silo already supports account/item history filters, so user/item history are
adapter work. Library history requires additional item/library attribution.

### P2 — missing metadata, recovery and robustness

- Episode rows have `EpisodeId`, but no `SeriesName`. The table labels media using
  `SeriesName ? 'Episode' : title ? 'Movie' : 'Media'`, so named Silo episodes are
  displayed as Movies. Preserve and render Silo's media type.
- Profile and completion data are mapped but not surfaced; useful Silo-native
  information is discarded while unsupported device/client columns occupy space.
- Silo still loads primary libraries even though its library filter is hidden.
  Catalog/profile failures can produce a filters warning unrelated to admin history.
- Initial history failure has no Retry action; successful history waits an hour
  for automatic refresh. Backup/import handlers clear data without reliably
  triggering a new fetch if the other dependencies remain unchanged.
- Persisted library filter JSON and the table's `12hr` JSON are parsed without
  protection. BETA includes safer preference readers missing from this fork.
- `getSubRows` mutates `row.results` with `pop()`; this is inherited upstream.
- Zero watched seconds render as an empty duration string; fractional seconds are
  not rounded for display.

## What the selected finalized-history endpoint supports

`apps/api/tests/fixtures/silo-v2/openapi.json`:
`GET /api/v2/admin/playback-history` supports `limit`, `cursor`, `user_id`,
`profile_id`, `media_item_id`, and `completed` (`all`, `true`, `false`).

`AdminPlaybackHistoryEntry` includes attempt/account/profile/item/file IDs, names,
media type, playback method, started/ended timestamps, watched seconds, optional
media duration, and completion. It does **not** include historical client/device/IP,
stream codecs/bitrates, library ID, series/season/episode numbering, total counts,
arbitrary search, date-range queries, or user-selectable sorting.

These findings concern this one endpoint, not the complete Silo API. Other
endpoints already expose rich live diagnostics and aggregates, as corrected above.
Check the live server contract and Silo's own consumers before concluding that a
feature requires new upstream support.

## Implementation status and remaining order

Implemented in the first contract-backed Activity pass:

- Distinct **Live sessions** and **Playback history** views. Live uses the existing
  v2 fleet/session diagnostics and controls; finalized history uses its own API.
- One-request opaque-cursor Previous/Next navigation, synchronized resets, cursor
  validation, request cancellation/generation protection, Refresh and Retry.
- Per-row fleet server identity; secondary-server links target only explicit
  fleet-scoped detail routes, and artwork is never borrowed from the primary.
- Native account/profile/completion/item filters on both primary and fleet history;
  misleading generic table sort/filter controls are disabled for Silo history.
- Silo media type, household profile, completion status and a real finalized-
  attempt details panel. Unsupported historical stream fields are not fabricated.
- Primary-server user/item history routes now read Silo history and are read-only;
  embedded drill-downs use the shared opaque-cursor navigator.
- Preference parsing and non-mutating child-row handling were hardened.

Remaining work:

Library attribution is now implemented for the primary server without title/path
heuristics: each retained history item's v2 `admin/items/{id}/files` ownership is
resolved to explicit `library_id` values, cached briefly, and filtered through a
bounded continuation cursor. Deleted catalog items are left unattributed rather
than guessed. Library Activity uses read-only Previous/Next cursor navigation,
request cancellation, Refresh/Restart, and no unsupported search/sort controls.
The consumed admin-file operation and schemas are pinned in the contract fixture.
A live cold-cache probe found that sparse libraries could exhaust the request
budget while trying to fill one display page. Each request now scans one bounded
25-attempt ownership slice and returns a replayable continuation; complete traversal
therefore remains explicit without one request walking the entire retained log.
Empty intermediate slices say to continue rather than claiming no retained matches.

User and item drill-downs now share the read-only cursor navigator, including
cancellation, replayable Previous/Next state, page-size resets and Retry. Secondary
server history rows link only to explicit `/silo-fleet/:serverId/...` detail pages;
those pages fetch item/account identity and history through the selected fleet
client, so overlapping IDs cannot resolve against the primary server. Primary
Silo item pages no longer render Jellyfin SQL playback totals.

Primary history account links now open a native Silo account page with explicit
account identity, household profiles and cursor-paged attempts. They no longer
enter the Jellyfin-oriented profile route.

Secondary servers now also have explicit fleet library list/detail routes. The
pages use the selected fleet client for native summaries, searchable catalog
paging, item links and retention-managed cursor history; they never reuse the
primary `/libraries/...` routes.

The complete pinned `listAdminPlaybackHistory` contract was audited again after
these changes. Its only server-side selectors are `user_id`, `profile_id`,
`media_item_id`, and `completed`; ordering is fixed newest-ended-first and paging
uses an opaque live-log cursor. It has no global text search, date range, arbitrary
sort, or grouping parameters. Barracks therefore does not present page-local
search/sort as global, and does not add an expensive bounded read-through mode
that could be mistaken for complete retention history.

## Live acceptance — 2026-09-19

A real Chrome 153 playback session on the attached Silo deployment was exercised
against the production Barracks container:

- Barracks discovered one playing session with account, profile, player, position,
  bitrate, direct H.264 video, AAC audio conversion and DirectStream diagnostics.
- Silo advertised sequenced `pause`, `resume`, `stop`, and `message` commands plus
  durable `terminate`. Pause/resume each returned 202, both state changes were
  observed, position advanced after resume, and the session identity remained
  stable. A player message returned 202 without interrupting playback. Stop
  returned 202, removed the session, and finalized the matching retained attempt.
- Restarting only Barracks did not disturb playback. After startup it reconnected
  without partial state and rediscovered the same playing session.
- Terminate returned 200 with `authority_revoked: true`, durable `stopped` state,
  client notification and dispatched delivery. It removed and finalized the exact
  session while leaving Silo connected. The web player remained logged into its
  administrator account, as expected: termination revokes playback-session
  authority, not account authentication. Reusing the stale Barracks target was
  safely rejected with 409 rather than affecting another session.
- Normal player shutdown and both destructive commands produced finalized records
  with matching session, item, account and profile IDs plus media file, method,
  start/end, duration, runtime and completion fields. Live-only codec/bitrate
  diagnostics were not copied into finalized records.
- Headless Chrome verified desktop Activity, a 25-row history page, retention
  labeling, Previous/Next controls, primary account/profile and item/back routes,
  and no Jellyfin SQL totals on the Silo item page. At 390 × 844 there was no
  horizontal document overflow and keyboard Tab reached a button.
- Failure-mode checks rejected an invalid Barracks token with 401, a Viewer control
  attempt with 403, an unsupported action with 400, and an invalid Silo key with
  the upstream `invalid_token` 401 Problem Details response. A temporary invalid-key
  fleet member made the snapshot explicitly partial/unavailable while the primary
  stayed connected. Headless Chrome displayed that unavailable server without a
  fatal alert or horizontal overflow; removal restored a healthy fleet and left no
  temporary registry row.
- A live quality transition retained the same session while changing output from
  height 800/10 Mbps to 720p/4 Mbps. The card showed selected 1080p source versus
  720p output, video/audio conversion, bitrate change and VAAPI acceleration. Silo's
  effective `allow_4k_transcode=false` policy selected the non-4K source; Barracks
  did not mislabel the session as a 4K transcode or attempt to override that policy.
- A real invalid history cursor returned 400. Barracks now translates its
  `invalid_cursor` category into an actionable restart-from-first-page message on
  primary, item/account and fleet history routes.

Four healthy physical Silo connections were subsequently exercised together.
Every server returned independently scoped history and account collections while
account ID `1` overlapped on all four. Three servers then streamed simultaneously:
combined totals were 3 active/3 playing, per-server counts summed exactly, every
fleet session ID was unique, and all rows retained their registry scope. Desktop
and 390px mobile views rendered three correctly labeled cards and titles without
alerts or horizontal overflow. All active servers independently advertised the
same supported command set, but no command was sent during this observation.

Rapid primary/secondary/primary/secondary browser changes settled on the final
server without stale rows; secondary account, item and library links retained the
selected registry ID. Disabling and re-enabling one secondary left the primary
stream/count intact and restored the secondary to connected state. Restarting only
Barracks while all three streams played rediscovered the same three fleet session
IDs, positions and per-server counts without partial state or player interruption.

This pass also found that frontend `/fleet/...` deep links collided with the
authenticated backend `/fleet` API mount on a full refresh. Fleet pages now use
`/silo-fleet/:serverId/...` while requests remain under `/fleet/...`. Direct reloads
of a secondary account, item and 12-library page then succeeded without errors or
lost authentication.

Account/profile-authority revocation, an actual upstream 429, and primary-key
revocation still require dedicated expendable infrastructure. Cursor loops/expiry,
failed refreshes, empty results, filter/page-size resets and malformed preferences
also remain covered by automated contract and state tests.
