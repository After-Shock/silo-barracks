# Silo API v2 implementation status

## Pinned compatibility contract and attached runtime

Barracks is pinned for compatibility tests to Silo revision
`8eeb9f3e623725ef2b3a267853d3e3fcd27d08cf` (`server_version: 8eeb9f3e`).
That source contract has digest
`774f49bd02d1b9465b2591013242eeb2aa41042c5303108ffc3ab39fd27c64eb`.
The selected fixture includes the read APIs consumed by Barracks plus the
administrator playback capability and mutation endpoints.

The attached runtime tested on September 19, 2026 reports server version
`0362b6da`. Its live `/api/v2/openapi.json` contains 577 paths and has digest
`e46579ccd64acf055bc60d644e5e8d93d3d03b73fee018b288dbff8fde3b0e58`.
All 28 pinned operations consumed by Barracks remain present with unchanged
operation IDs. The runtime accepts session limits through 200 and rejects 201 with
422; Barracks retains its conservative 100-item traversal size.

## Implemented behavior

- Per-connection v1/v2 negotiation, retained server identity, bounded requests,
  safe Problem Details mapping, and independent mixed-version fleet failures.
- Complete cursor traversal for sessions and users. Barracks deliberately requests
  at most 100 sessions because the deployed runtime rejects larger limits even
  where older generated contracts advertised 200.
- Profile-scoped v2 catalog, library, item, season, episode, artwork, and recently
  added reads. Barracks uses only the API-key owner's unique primary profile and
  does not bypass missing, ambiguous, PIN-locked, or denied profiles.
- Live session diagnostics with unknown and unavailable values preserved rather
  than converted to zero.
- Silo playback history is read directly from `/api/v2/admin/playback-history` and
  shown as retention-managed, read-only activity. Silo sessions are not copied into
  Barracks' durable Jellyfin history tables.
- Administrator pause, resume, stop, terminate, and message controls. Barracks
  requires an Owner/Admin with settings permission, checks upstream command
  capabilities, verifies that the targeted session is still current, scopes every
  mutation to one server/session, uses UUID command IDs and monotonic per-session
  sequences, confirms disruptive actions in the UI, and records best-effort audit
  events. A failed audit write never changes the result of an upstream command.
- Primary-server and fleet live-session views use the same cards and controls;
  stale and partial fleet states remain explicit.

Catalog requests that need profile context send `X-Profile-Id`. Administrative
session and history reads remain independent of catalog profile discovery.
API-key connections continue to use REST polling because event tickets require a
live login-session token; Barracks does not store administrator passwords or invent
session credentials.

## Verification and remaining live checks

On September 12, 2026 the `ghcr.io/silo-server/silo-server:apiv2` deployment was
healthy and exposed v2 discovery and the contract above. Local contract validation,
adapter/fleet tests, branding and theme audits, zero-warning frontend lint, and the
production build pass against this revision.

On September 19, 2026 attached production Silo sessions were discovered with live
position/transcode diagnostics. Capability-checked pause/resume, message and stop
returned 202; state transitions and finalization were observed. Terminate returned
200 with playback authority revoked, durable stopped state, client notification
and dispatched delivery. It does not revoke the account login, and the administrator
web player correctly remained authenticated. A repeated stale Barracks command was
rejected with 409. Restarting Barracks preserved a player and rediscovered the same
session after a clean reconnect. Normal shutdown and destructive commands finalized
the matching sessions in Silo history; live-only diagnostics were not copied into
retained attempts. Headless desktop and mobile Chrome checks covered Activity,
history paging, account/profile and item navigation, keyboard focus, and horizontal
overflow.

Safe direct API probes also verified discovery, sessions/capabilities, two-page
history traversal without duplicate IDs, fixed newest-first ordering, native
account/profile/item/completion filters, 12 libraries, and all three dashboard
aggregate calls. Invalid parameter boundaries returned 422 Problem Details and
missing authentication returned 401. No rate-limit headers were advertised on
normal responses, so Barracks did not manufacture rate-limit state.

A cold sparse-library probe exposed request-deadline exhaustion while Barracks
tried to fill a display page through too much retained history. Library history is
now bounded to one 25-attempt ownership slice per request and resumes through its
continuation. All 12 live libraries returned without failure (slowest cold request
2.4 seconds), and a five-page empty traversal completed without timeout. Empty
intermediate slices explicitly invite the operator to continue instead of claiming
that the complete retained history has no matches.

Invalid Barracks authentication, insufficient Barracks role, unsupported actions,
an invalid Silo key, and a temporary partial-fleet outage were also exercised. The
primary remained available, the unavailable member was visible in the browser,
and cleanup restored the healthy fleet. A real invalid cursor now produces an
actionable restart-first-page response instead of a generic upstream 400.

Before broad rollout, test primary-key/profile revocation, an actual upstream 429,
unsupported capabilities from a real limited player, prolonged operation with two
healthy physical Silo servers, and intentional network-loss recovery.

A subsequent live quality change kept one session identity stable while output
moved from height 800 at 10 Mbps to 720p at 4 Mbps. Barracks displayed the exact
selected-source/output path (`H264-1080p → H264-720p`, `11.3 Mbps → 4.0 Mbps`),
EAC3-to-AAC audio conversion, and VAAPI hardware acceleration without horizontal
overflow. The server's effective `allow_4k_transcode` value was already `false`;
Silo selected the available 1080p source for the requested 720p transcode instead
of transcoding a 4K source. Barracks observes this policy outcome but does not
invent or override Silo playback policy. Capability
visibility must not be treated as mutation authority; Silo's response to each
command remains authoritative.
