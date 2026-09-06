# Silo Barracks

Silo Barracks is a dashboard for active **Silo Server** viewers and observed playback
history. It keeps JellyGlance's React dashboard and PostgreSQL analytics, with a
native Silo API adapter.

Based on JellyGlance `v1.2.3-beta.3` (`b474638`). The initial Silo contract reference
is `After-Shock/silo-server` commit `2dedf3ff26e488dce37d5ef81d7cdce2d9ec80e5`.

## Run locally with Docker

1. Copy `.env.example` to `.env` and replace the database password and JWT secret.
2. Run `docker compose up --build -d`.
3. Open `http://localhost:3000`, enter the **native Silo server URL** and an
   administrator API key (`sa_…`), then create a local dashboard login or configure OIDC.

The Silo URL may be the server root or end in `/api/v1`. It must be reachable from
the Barracks container; `localhost` inside Docker refers to that container.
Silo's separate Jellyfin compatibility listener is not the correct endpoint.
Optional `SILO_URL` and `SILO_API_KEY` in `.env` override saved connection settings.

Barracks polls native `/api/v1/admin/sessions` every five seconds by default.
Use `SILO_POLL_INTERVAL_MS` to adjust this. PostgreSQL, config and backups use
dedicated named Docker volumes.

## What is supported

- Active accounts and household profiles, title, client, progress and pause state.
- Source/transcode stream information when supplied by Silo.
- Native users, libraries, catalog, seasons/episodes and artwork access.
- Observed playback history in PostgreSQL, with separate playback-session identity.
- Connection failures shown separately from a successful “no active sessions” result.

Unknown intervals during outages or restarts are not counted as watched time.
History begins when Barracks observes a session; existing Silo history backfill is
not implemented. Keep one Barracks monitor instance per database.

Jellyfin Quick Connect, Jellyfin server management and Playback Reporting plugin
SQL import are not Silo features. The fork retains other upstream integration code,
but those integrations have not been validated against your services.

## Development and verification

```sh
npm ci
npm test
npm run build
```

Set `SILO_TEST_DATABASE_URL` to an **isolated disposable PostgreSQL database** to
also execute the database integration test. The test creates and removes its own
temporary schema. Without this variable, that one test is skipped.

See [integration notes](docs/silo-barracks.md) for configuration, limitations and
the manual end-to-end verification fixture. Contract tests and a fixture server
do not establish compatibility with a deployed Silo version; a live-server check
is required before production use.

## Upstream attribution

Derived from [JellyGlance](https://github.com/Nerdy-Technician/JellyGlance), by
Nerdy-Technician and contributors, with earlier Jellystat contributions.
Original license notices are preserved in [LICENSE](LICENSE). The upstream beta
contains MIT license text and GPL-3.0 package metadata; this fork preserves both
rather than silently asserting a new license. Silo icons are reused from the
Silo Server repository. [Original upstream README](docs/upstream-jellyglance.md).
