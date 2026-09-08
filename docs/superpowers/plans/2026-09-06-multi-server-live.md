# Multi-server live monitoring implementation plan

**Goal:** Add Silo connections and a live overview showing combined streams,
per-server health, source labels, and server filtering.

**Architecture:** Keep the current connection as the primary server. Store
additional connections in a separate PostgreSQL table with encrypted API keys.
A fleet collector polls each server independently and exposes a cached snapshot
over authenticated HTTP. Keep primary catalog/history behavior intact.
Fleet avoids the legacy websocket broadcast because it does not enforce dashboard
permissions. Browser REST polling runs every five seconds.

**Stack:** Existing Express, PostgreSQL/Knex, native Silo adapter, React, Socket.IO.

## Backend contract

- `GET /fleet`: dashboard-authorized snapshot, no secrets or server addresses.
- `GET /fleet/servers`: settings-authorized list; include URL and `hasApiKey`,
  never API keys. Primary connection is a read-only entry.
- `POST /fleet/servers`: validate name/URL/admin key, validate health and sessions,
  reject duplicate URL or upstream server ID, then persist.
- `PUT /fleet/servers/:id`: update label, URL, key (blank retains), enabled.
  Connection changes require validation; disabling does not contact the server.
- `DELETE /fleet/servers/:id`: remove an additional connection, never primary.
- Registry maximum 20 additional servers. Only settings-authorized users mutate.

Snapshot: `{updatedAt, totalActiveStreams, playingStreams, pausedStreams,
partial, servers:[{id,name,isPrimary,enabled,state,lastSuccessAt,
activeStreams,playingStreams,pausedStreams,sessions}]}`.
Connected servers contribute current counts; unavailable/pending servers have
null counts and cause `partial=true`. Disabled servers do not contribute. Retain
last known sessions as explicitly stale on failures. Scope display identities by
registry ID to prevent collisions. Never send keys or internal error messages.

## Tasks

- [x] Collector: write failing tests for two-server totals, colliding IDs,
  one-server failure/recovery, slow-server isolation, disabled/removed entries,
  stale expiry and no overlapping requests; implement pure injected collector.
  Files: `apps/api/classes/silo-fleet.js`, `apps/api/tests/silo-fleet.test.js`.
- [x] Registry/routes: migration 102, encrypted credential storage, validation,
  uniqueness checks, parameterized SQL, permissions. Unit tests plus isolated
  PostgreSQL/in-process route tests. Files: `classes/silo-server-registry.js`,
  `routes/fleet.js`, migration, tests, `server.js` startup/mount.
- [x] Frontend: shared fleet subscription; dashboard totals/server cards/filter;
  identify every stream's source; management form under Settings → Silo Servers.
  Keep extra-server media/user links from resolving into primary-server records.
  Files: new fleet component/cache/settings files, existing Sessions/settings/nav.
- [x] Review spec coverage and code quality, run all tests and production build,
  exercise two isolated fixture Silo servers including one failure and recovery,
  confirm current primary server is present, check desktop/mobile and secrets.

No live additional server is configured without user-supplied credentials.
Use isolated fixtures for verification and remove fixture connections afterward.

## Verification — 2026-09-06

- 62 tests passed, zero skipped, with isolated PostgreSQL enabled.
- Native HTTP fixture servers verified independent keys, colliding IDs, paused
  totals, partial failure and recovery. Concurrent registries admitted exactly
  20 of 21 distinct connections. Offline edits preserved encrypted credentials.
- Production Docker build deployed; app and PostgreSQL healthy. Migration 102
  confirmed required columns non-null.
- `scripts/check-fleet-ui.cjs` passed against the deployed web bundle: live primary
  connectivity, fixture totals/filtering/stale/transport failure/recovery, mobile,
  and server add/edit/disable/enable/remove. Browser fixtures never wrote live DB.
- Existing login/dashboard/history/mobile smoke passed with four live primary
  activity requests, no failures, maximum 30 ms, no browser errors.
- Review corrections: database-enforced add cap, primary identity deduplication,
  settings-only management permission, no fleet websocket broadcast, no
  extra-server avatar or user/catalog lookup into primary records.
- Successful primary identity is cached only for the current connection,
  deliberately revalidated after a configuration change.
