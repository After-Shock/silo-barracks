# Silo Activity Implementation Plan

> **For agentic workers:** Use subagent-driven-development for bounded implementation
> and independent review. Commands assume the repository root.

**Goal:** Show active Silo user playback in Silo Barracks and retain observed activity
in its existing PostgreSQL analytics database.

**Architecture:** Native Silo HTTP adapter normalizes server contracts into the existing
dashboard interface. Existing Barracks authentication protects browser access. The
poller separates failed requests from successful empty lists and publishes connection
status alongside sessions.

**Tech Stack:** Node.js 22, CommonJS Express backend, React/Vite, PostgreSQL, node:test.

**Contract reference:** Silo commit `2dedf3ff26e488dce37d5ef81d7cdce2d9ec80e5`.
`GET /api/v1/admin/sessions` returns a flat array and requires an administrator
`Authorization: Bearer sa_...` key. Map seconds to 10,000,000 ticks and kbps to
1,000 bps. Map absent media/codec fields safely for session-cache and session-card.
Support native sessions, health, users, libraries, catalog/details and artwork;
disable Jellyfin Quick Connect, plugin SQL import and Jellyfin management routes
in Silo mode. Preserve explicit legacy provider selection.

**Persistence/status:** A dedicated Silo poller retains session identity in watchdog
`Id`, a deterministic server/session history `ActivityId`, and profile identity/name
in `PlayState` JSON. Never merge separate sessions by user/device/media. Persist
snapshots transactionally through an injectable store and guard each poll with a
single-flight lock. A `session-status` event uses `connected`, `unavailable`, or
`unconfigured`; unavailable does not emit an empty sessions array, and the browser
retains cached sessions with a stale-data notice. Do not count unknown downtime as
watched time. A successful empty list means no active viewers.

## Chunk 1: Native activity and application integration

### Task 1: Native adapter

- [ ] Inspect Silo handlers and record the exact source commit and response contracts.
- [ ] Create `apps/api/classes/silo-api.js` and focused modules under
      `apps/api/classes/silo/` for HTTP requests and response mapping.
- [ ] Write tests under `apps/api/tests/` before implementation. Cover native bearer
      authentication, URL normalization, validation, sessions, profiles, media types,
      progress units, transcode metadata, malformed responses and request failures.
- [ ] Implement methods needed by the existing API loader and catalog synchronization;
      unsupported Jellyfin plugin features must be explicit.
- [ ] Run `node --test apps/api/tests/*.test.js`; verify failure first and then success.

### Task 2: Setup and display

- [ ] Make Silo the default provider in `apps/api/classes/api-loader.js`; preserve
      explicit legacy provider selection.
- [ ] Update `apps/api/classes/config.js`, setup/settings forms and API setup responses
      for Silo URL and administrator key. Preserve stored schema compatibility.
- [ ] Route native image/catalog access through the adapter where required.
- [ ] Update application name, navigation, setup text, package metadata and a local
      Docker Compose example. Preserve license/attribution and lockfile consistency.
      Include document title, manifest, primary locale labels, login/setup wordmarks,
      public app icon and README identity. Use a simple vector mark and text wordmark.

### Task 3: Reliable observed history

- [ ] Add lifecycle regression tests for `apps/api/tasks/ActivityMonitor.js` before
      changing behavior: failed poll, overlap, pause/resume, valid empty response,
      session replacement and household profile separation.
- [ ] Await database writes, avoid poll overlap and preserve active records on failures.
- [ ] Publish a sanitized session-status event; show unavailable/stale state in
      `apps/web/src/pages/components/sessions/sessions.jsx` and session cache consumers.

### Task 4: Verification and handoff

- [ ] Run contract/lifecycle tests and frontend build. Review changed JS with ESLint
      where applicable; distinguish pre-existing failures from regressions.
- [ ] Exercise setup and live activity against a local fixture server and isolated
      PostgreSQL if available. Never use an existing production database for tests.
      A fixture server is not a live Silo deployment: missing live-server verification
      explicitly blocks any claim of production compatibility.
- [ ] Obtain independent spec compliance and code quality reviews; resolve findings.
- [ ] Document exact setup and verification in `docs/silo-barracks.md`, including
      which features are implemented and which still need live-server validation.
- [ ] Review `git diff --check`, final diff and status; report verified results and
      any remaining limitations accurately.
