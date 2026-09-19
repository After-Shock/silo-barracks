# Barracks API v2 improvements — review proposal

Status: Direction approved by the user; implementation task breakdown pending. This update records the agreed scope; no application changes or deployment have been performed.

## Approved decisions

- Retain Jellyfin-provider compatibility alongside Silo v2. Branding remains Barracks, with provider-aware server terminology.
- Rely on Silo's retention for Silo playback history. Do not add durable Silo history ingestion/backfill or a second history store. Preserve existing Barracks/Jellyfin history and its collection behavior; label its source distinctly.
- Include playback controls for Barracks administrators, additionally gated by upstream permissions and per-session capabilities. No control authority is inferred from visibility.
- Deliver both primary-server polish and fleet-wide workflows. Use a shared implementation with single-server and all-server views, rather than separate feature tracks. Stage delivery for verification, not to exclude fleet support.
- History and analytics must respect each upstream's available retention/window. Cross-server history needs per-server pagination state and partial-result notices; never promise a globally complete page or comparable aggregate without verifying it.

## Objective

Make Barracks a Silo-native monitoring and analytics companion: accurate live activity, useful history, fast catalog browsing, trustworthy diagnostics, and consistent Barracks branding.

## Starting point and important qualifications

- Silo on `sullyflix-com` now runs `ghcr.io/silo-server/silo-server:apiv2`, revision `8eeb9f3e`, and was verified healthy.
- The matching published contract contains 575 paths. These are available v2 routes, **not 575 newly added features** relative to v1. Authentication, permissions, runtime capabilities, and data completeness still need checking.
- Barracks already has per-connection v1/v2 negotiation, pagination, profile-scoped catalog access, session mapping, and diagnostics. Extend these rather than replace them.
- `docs/silo-v2-status.md` describes an older pinned contract and unresolved release gates. Refresh those findings against this deployment before relying on v2 data.
- Negotiation currently persists until connection settings change or Barracks restarts. Server upgrade alone does not prove Barracks has switched to v2.
- Earlier testing found a live-playback projection gap. Verify real playback appears in admin sessions, rather than assuming a successful HTTP response means monitoring is complete.

## Principles

1. Silo owns catalog metadata, artwork, profiles, and playback truth.
2. Barracks owns monitoring preferences, alert rules, and historical analytics that genuinely need durable storage.
3. Missing, stale, partial, denied, and zero are different states; never silently equate them.
4. Every record and cache key is server-scoped; profile-sensitive reads also include profile identity.
5. Admin visibility does not imply playback-control authority.
6. Introduce read-only features first. Mutating actions require explicit local permission, upstream permission, and deliberate user interaction.

## Phase 1 — Branding and a verified v2 foundation (highest priority)

### A. Complete JellyGlance → Barracks branding migration

Audit UI titles, browser metadata, navigation, onboarding, About, login/signup, notifications, newsletters, exports, backup names, API headers, documentation, translations, package names, scripts, tests, and deployment examples.

- All current product-facing references become **Barracks**.
- Silo-specific connection labels, help text, and media links say **Silo**. Use provider-aware text wherever another backend is intentionally supported.
- Rename internal CSS identifiers, events, storage namespaces, and package identifiers with their callers/tests together.
- Migrate existing browser preferences and cached settings instead of resetting themes, layouts, privacy settings, or onboarding state.
- Preserve existing database data and Docker volumes. Do not rename Compose projects, volume identifiers, environment variables, or backup formats blindly.
- Add narrowly scoped legacy-read compatibility for old settings/backups where required; write only the new names. Document eventual removal.
- Preserve required upstream copyright, license, and attribution references. These are provenance, not current product branding.
- Add a repository check rejecting new legacy branding outside an explicit attribution/migration allowlist.

**Acceptance:** No JellyGlance branding in the normal UI or newly generated output; upgrades retain user settings, credentials, backups, and history.

### B. Verify and harden v2 integration

Endpoints: `/api/v2/system/info`, `/api/v2/openapi.json`, relevant feature capability routes.

- Pin fixtures to the deployed contract and update adapter tests.
- Show negotiated API version, server revision, last successful contact, permission failures, and contract changes in connection settings.
- Add a safe “Recheck API capabilities” action without requiring an app restart.
- Test actual play, pause, resume, seek, end, disconnect, and reconnect behavior on a designated test session.
- Verify API-key access, profile requirements, pagination, and upstream error envelopes for every feature we adopt.
- Separate interactive request priority from background catalog/history work. Bound retries and backoff, respect `Retry-After`, coalesce duplicate calls, and cancel obsolete requests.
- Do not silently fall back to v1 on permission errors or arbitrary server failures.

**Acceptance:** Real sessions and completed history are visible; a day of observation plus an intentional upstream interruption passes without false empty states or request storms.

## Phase 2 — Live activity and playback troubleshooting

Endpoints: `/api/v2/admin/sessions`, `/summary`, `/capabilities`, `/command-capabilities`; `/api/v2/admin/node-sessions`; `/api/v2/admin/system/resources`; `/api/v2/admin/stats/timeseries`.

### Recommended improvements

- Correct session position against each server observation; keep client-side ticks only between observations. Pause and buffering must not create fictitious progress.
- Keep ETA visible; show unknown duration explicitly and account for playback speed only when supplied reliably.
- Display account and household profile separately, plus originating Silo server/node.
- Show available client/device version, stream method, resolution, codecs, bitrate, transcoding reason, and source/output details in an expandable diagnostics panel.
- Preserve unknown fields instead of rendering zero measurements or invented reasons.
- Add clear playback-state badges, last-updated timestamps, reconnecting notices, and stale/partial fleet totals.
- Add filters for server, profile, playback method, and state; retain selection across refreshes.
- Improve mobile cards and offer a compact desktop table with configurable columns.
- Add redacted “Copy diagnostics” for support, excluding credentials, sensitive paths, and IP addresses by default.
- Keep the observed client IP honest. Mark proxy/private addresses; fixing real-IP forwarding belongs to Silo/proxy configuration, not Barracks guessing.

### Approved administrator playback controls

Capability-gated pause, resume, stop, terminate, and message actions using the corresponding `/api/v2/admin/sessions/{session_id}/...` routes.

- Hide or explain unavailable controls; observation alone grants no authority.
- Confirm destructive actions and show per-action pending/success/failure states.
- Prevent duplicate submissions, log local actor/server/session/action/result, and never replay stale commands after reconnect.
- Do not automatically retry a mutation unless the contract explicitly makes that retry safe.

### Realtime feasibility check

Inspect `/api/v2/events/capabilities` and ticket authentication before proposing WebSocket transport. Previous contract testing required a live login-session token, not an API key. Keep adaptive REST polling if API keys remain unsupported; do not store an admin password or fabricate session credentials to obtain events.

**Acceptance:** Seeking, pausing, reconnecting, and concurrent multi-server sessions do not misattribute playback or drift indefinitely; unauthorized users cannot invoke controls.

## Phase 3 — Silo-native history and reliable analytics

Endpoints: `/api/v2/admin/playback-history`, `/api/v2/admin/stats`, `/playback-activity`, `/top-activity`, `/timeseries`, `/downloads`.

### Recommended improvements

- Read finalized playback attempts directly from Silo, with server/account/profile/title/completion filters supported by the contract.
- Explain that finalized attempts, current sessions, completed watches, and watch-history leaderboards have different meanings.
- Add completion state, playback method, duration, and end/failure information only where available; distinguish absent diagnostics from successful playback.
- Use Silo's aggregate endpoints for recent playback-method breakdowns, reliability, active-profile counts, title/profile leaderboards, and stream/egress charts.
- Label each statistic's time window, timezone, source, refresh age, and retention limits.
- Avoid claiming arbitrary date filters or unlimited history when the upstream endpoint only supports bounded windows.
- Combine fleet results only where metric definitions and time buckets match; otherwise retain server-level views.
- If durable history is approved, import incrementally with server-scoped stable IDs, overlap/deduplication, resumable cursors/checkpoints, bounded batches, and restart recovery.
- Keep old Barracks history, but do not double-count it with newly imported Silo attempts. Explicitly label legacy sources until reconciliation is proven.
- Make storage usage and retention configurable, with preview before deleting historical data.

**Approved storage policy:** Read Silo history on demand and rely on Silo retention. Durable Silo import/backfill and related retention management discussed above are out of scope. Preserve existing Barracks/Jellyfin historical data and collection behavior. Use bounded ephemeral caching only for Silo reads; audit current session tracking and sync writers so Silo sessions do not silently continue creating a duplicate durable history store. Explain upstream retention limits rather than offering unavailable historical ranges.

**Acceptance:** Sampled dashboard totals reconcile to their documented Silo sources; repeated imports cannot duplicate records; partial fleet outages never appear as zero activity.

## Phase 4 — Catalog, artwork, and profile quality of life

Endpoints: `/api/v2/catalog`, `/query`, `/filters`, `/filters/search`, item/season/episode routes; `/api/v2/libraries`; `/api/v2/home/sections`; library section routes; `/api/v2/recommendations/recently-added`; `/api/v2/images/capabilities`; profile/user routes.

### Recommended improvements

- Finish replacing DB-dependent browsing paths with paginated Silo metadata reads; eliminate full-library downloads merely to render one page.
- Preserve upstream search/filter/sort behavior and cursor/window semantics. Discover supported filter values rather than inventing them.
- Prefer lightweight counts/aggregates when available; label unavailable totals rather than scanning the catalog automatically.
- Use Silo-native recently-added sections where they fit the intended shelf, retaining actual library identity and profile visibility. Define whether TV shelves represent series or episodes.
- Use item detail and hierarchy endpoints for seasons/episodes, available versions, cast, recommendations, and metadata where appropriate.
- Keep “Open in Silo” links correct and server-specific.
- Resolve artwork URLs from metadata, use advertised sizes, lazy-load images, and provide useful accessible fallbacks.
- Show uploaded/preset avatars when returned by Silo. The profile avatar route in this contract is upload/delete, **not a GET image endpoint**; read image URLs from profile metadata.
- Secure artwork delivery: audit the current public image proxy, prevent arbitrary URL fetching/SSRF, and avoid exposing restricted catalog/profile images through guessable unauthenticated URLs. Evaluate short-lived scoped image links or same-origin authenticated delivery.
- Use bounded short-lived metadata caches, invalidate on relevant connection changes, and avoid indefinite sessionStorage staleness.

**Acceptance:** Browse and Recently Added work without a catalog sync; restricted profile content remains restricted; images load without exposing upstream credentials.

## Phase 5 — Operational dashboard and actionable alerts

Endpoints: `/api/v2/admin/server/status`, `/system/build`, `/system/resources`, `/system/hw-accel`, `/nodes`, `/tasks`, `/tasks/{key}/history`, `/metrics`, `/rate-limits/status`, `/logs/app`, `/logs/audit`.

### Recommended improvements

- Add one server-health view covering connectivity, resources, nodes, hardware acceleration, scheduled tasks, and observed rate-limit pressure.
- Make task history read-only initially; link to Silo for full administration.
- Provide alerts for sustained server outages, repeated task failures, persistent transcoding pressure, and playback failures where supported telemetry exists.
- Debounce and deduplicate notifications, support quiet hours, test delivery, and issue recovery notices.
- Show API permission problems separately from server outages.
- Keep any log viewer admin-only, bounded, searchable within supported upstream limits, and redacted; do not mirror all Silo logs into Barracks.
- Offer a read-only downloads/requests overview if those are actively used, with deep links to Silo rather than duplicating the entire administration interface.

**Acceptance:** Alerts are actionable and do not repeat on every poll; denied capabilities do not create false outage notifications.

## Cross-cutting polish (delivered with every phase)

- Consistent loading skeletons, no-data explanations, error/retry states, and stale-data badges.
- Search/filter persistence, reset filters, sortable tables, pagination, and sensible mobile layouts.
- Keyboard navigation, visible focus, accessible contrast, descriptive labels, and reduced-motion support.
- Consistent units, timezone handling, relative/absolute time tooltips, and unknown-value rendering.
- CSV exports respect filters, permissions, and privacy settings; default to redacting IP/device identifiers.
- Connection settings explain required scopes and unsupported features before enabling them.
- Clear freshness indicators and manual refresh that does not bypass request-rate safeguards.
- Tests for branding migration, expired cursors, profile restrictions, key revocation, 429s, timeouts, duplicate history, and mixed v1/v2 fleets.

## Features to defer

- Full catalog mirroring or mandatory library sync.
- Rebuilding Silo's plugin, policy, subtitle, collection-authoring, invitation, or library-management UI.
- Automatic remote playback commands or automated server restarts.
- WebSocket support until service-credential compatibility is demonstrated.
- Rich geo-location or “real client IP” features based on proxy addresses.
- Predictions, bandwidth costs, or playback-quality scores without sufficient trustworthy measurements.

## Delivery and release approach

1. Approve priorities and the decisions below.
2. Produce implementation-sized tasks and contract/permission checks for the first phase.
3. Test locally against synthetic fixtures and disposable databases; avoid live mutation tests without explicit approval.
4. Back up before schema or identity/storage migrations; ship additive migrations and feature flags where useful.
5. Deploy one phase at a time, verify container health and key desktop/mobile flows, observe errors/request volume, and report completed vs deferred scope.
6. Keep the previous image/configuration available. Treat database rollback separately from image rollback; never assume migrated data can be safely downgraded.

## Suggested approval scope

- **First release:** Phase 1 branding migration + v2 verification, followed by Phase 2 activity improvements and administrator controls after permission testing. Cover both single-server and fleet views; preserve Jellyfin behavior.
- **Second release:** Phase 3 upstream-retained Silo history/analytics and Phase 4 catalog/artwork polish for both single-server and fleet views, with schema-validated endpoint integration and explicit mixed-provider semantics.
- **Third release:** Phase 5 health/alerts and remaining quality-of-life improvements.
- Each release must test a single Silo server, multiple Silo servers, Jellyfin alone, and a mixed Silo/Jellyfin fleet. Mutations target exactly one authorized server/session; no fleet-wide broadcast controls are implied.

## Remaining review item

Which alerts/delivery channels are useful first? Recommended defaults: server outage/recovery and repeated scheduled-task failures. Channel selection remains open.

## Next planning step

Break the approved releases into implementation-sized tasks, starting with branding/storage compatibility, live v2 contract verification, shared server-scoped views, and authorization tests for administrator controls. Do not add Silo history persistence as a shortcut for fleet aggregation.
