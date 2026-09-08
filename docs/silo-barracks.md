# Silo Barracks integration notes

## Connection

Use the Silo native HTTP listener, not its Jellyfin compatibility listener.
Both `https://silo.example.com` and `https://silo.example.com/api/v1` are accepted;
reverse-proxy prefixes are preserved. An administrator-owned `sa_` API key is
sent as a bearer credential by the backend. Setup checks health and the protected
native session list. Barracks login is separate: choose local login or OIDC.

`MEDIA_SERVER_PROVIDER` defaults to `silo`. Explicit `jellyfin` or `emby` selects
the inherited adapter. Legacy provider UI paths have not received end-to-end
regression testing in this fork. `IS_EMBY_API=true` remains a legacy alias.

`SILO_URL` and `SILO_API_KEY` override saved connection settings. Empty optional
Compose variables do not override saved values. Existing `JF_HOST`/`JF_API_KEY`
database columns and historical `jf_` table names are retained; the names are
storage compatibility details, not the protocol being used.

The supplied Compose configuration is for this **new project** and uses dedicated
named volumes and a `silo_barracks` database. It does not mount or migrate another
JellyGlance installation. If migrating existing data, first back it up and explicitly
configure its database/volume; do not assume the new Compose file discovers it.

## Live activity and history

The adapter consumes `GET /api/v1/admin/sessions`. The inspected Silo compatibility
`/Sessions` returns an empty array and is intentionally not used. Native account ID,
profile ID/name, session ID, content ID, pause state, progress and stream details
are translated for the existing dashboard. Silo does not supply a stable physical
device ID in this response, so the adapter labels its fallback as session-derived.

Five-second polling is the default. `SILO_POLL_INTERVAL_MS` is bounded from 1,000 to
60,000 ms. A slow poll cannot overlap the next one. The browser receives sessions
over the existing authenticated Socket.IO connection and retries REST every 15 seconds.
Unavailable requests retain the last good cards with a stale-data notice; successful
empty lists show no active sessions.
If PostgreSQL fails while Silo remains reachable, fresh live cards still display;
a separate storage warning explains that playback history could not be saved.

Observed history uses actual session identity. Separate sessions are never merged
by account, device label or media title. Profiles remain attached in `PlayState` JSON
and shown on active cards; inherited aggregate statistics are account-level.

Snapshot updates and finalization use one PostgreSQL transaction. Progress and profile
metadata survive restart. Unknown intervals after a failed poll or process restart
are excluded from watched time. Counts are polling-based estimates, not authoritative
Silo history. History starts at first observation; sessions entirely between polls can
be missed. Use one monitor instance per database. Historical Silo backfill, profile-level
aggregate reports and native remote playback controls are not implemented.

## Supported surface and limits

Native users, libraries, paginated catalog, season/episode traversal, detail metadata
and artwork resolution are implemented. Initial catalog synchronization can be network
heavy because Silo exposes versions and episode structure through separate requests.
Required sync failures propagate instead of masquerading as empty catalogs. Optional
artwork/stream-detail failures do not hide valid active sessions.

Jellyfin Quick Connect, management routes and Playback Reporting plugin SQL import
are disabled in Silo mode. Other inherited media-service integrations and legacy backup
imports need separate validation before use. The original bundled release notes and
upstream documentation describe JellyGlance, not a Silo feature guarantee.

## Verification

The API reference is Silo source commit `2dedf3ff26e488dce37d5ef81d7cdce2d9ec80e5`.
`npm test` runs transport, contract, provider and lifecycle tests. To include real
PostgreSQL persistence/rollback checks, set `SILO_TEST_DATABASE_URL` to an isolated
test database. Tests create and delete only their own temporary schema.

For manual local testing, `node apps/api/tests/fixtures/silo-server.cjs` exposes a
contract fixture at `127.0.0.1:4100`, with test key `sa_fixture_only`. Its server
identity says “Silo contract fixture.” Do not point a production Barracks database
at it. On an isolated Barracks instance, test setup and login, then switch the fixture
using `POST /__test/state?value=paused`, `playing`, `unavailable`, or `empty`.
Verify the active card, pause state, outage notice, recovery and final history row.

Development verification passed 33 automated tests with PostgreSQL enabled (no skips),
the production web build, changed-frontend-file lint, and a headless-browser check of
login, account/profile activity, outage retention, successful empty recovery and sync
notifications. The Compose configuration also validates.
They are not a live Silo deployment check. Before claiming production compatibility,
connect the intended deployed Silo version and test native and compatibility-client
playback, pause/resume, transcoding, stop, reconnect, catalog sync and key rotation.

The local build passed on Node 22.22.1, but upstream release-tool dependencies warn
that they require a newer patch version. Use a current Node 22 image as in Dockerfile.
Existing Vite warnings about env.js and large chunks predate this integration.
