# Silo API v2 implementation status

## Deployed contract

Barracks is pinned to Silo revision
`8eeb9f3e623725ef2b3a267853d3e3fcd27d08cf` (`server_version: 8eeb9f3e`).
The deployed `/api/v2/openapi.json` contains 575 paths and has contract digest
`774f49bd02d1b9465b2591013242eeb2aa41042c5303108ffc3ab39fd27c64eb`.
The selected contract fixture includes the read APIs consumed by Barracks plus the
administrator playback capability and mutation endpoints.

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

Invalid Barracks authentication, insufficient Barracks role, unsupported actions,
an invalid Silo key, and a temporary partial-fleet outage were also exercised. The
primary remained available, the unavailable member was visible in the browser,
and cleanup restored the healthy fleet. A real invalid cursor now produces an
actionable restart-first-page response instead of a generic upstream 400.

Before broad rollout, test primary-key/profile revocation, an actual upstream 429,
unsupported capabilities from a real limited player, prolonged operation with two
healthy physical Silo servers, and intentional network-loss recovery. Capability
visibility must not be treated as mutation authority; Silo's response to each
command remains authoritative.
