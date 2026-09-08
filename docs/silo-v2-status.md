# Silo API v2 implementation status

## Scope

First delivery: compatibility and live diagnostics (approved plan, Chunk 1).
Branch: `feat/silo-api-v2`; upstream contract pin:
`26661d76f451ed790cf74221538b1048a8d193d6`.

Implemented: per-connection negotiation, retained health identity, bounded transport
and safe Problem Details categories, complete session/user cursor traversal, catalog
window/seek translation, existing provider read shapes, optional capability-gated
session diagnostics, unattributed stream cards and API status in server settings.
Unknown fields remain unknown, not invented zero measurements. Mixed v1/v2 fleets
retain independent credentials, stale-state handling and confirmed totals.

The session loader at this pin rejects limits above 100 even though generated
OpenAPI advertises 200; Barracks uses 100 and tests 201 sessions over three pages.
Catalog requests require `X-Profile-Id`. Barracks reads `/api/v2/profiles` and uses
only the credential owner's unique primary profile, with bounded per-connection
caching. Missing/ambiguous profiles or upstream profile/PIN denials are not bypassed;
ordinary administrative activity reads do not require profile discovery.

Contract fixtures are synthetic, with pinned schema provenance and strict Ajv2020
validation. Runtime adapters validate consumed envelope/identity fields; they do not
require every optional OpenAPI field or reject future diagnostic strings.

## Release gates

- The configured live Silo returned discovery 404 and healthy retained v1 health
  on September 8, 2026. No production Silo upgrade, upstream mutation, or Barracks
  deployment has been performed for this change.
- V2 is exercised against synthetic native HTTP fixtures, not a running v2 Silo.
  Revalidate against the intended build on a dedicated v2 test connection before
  release. Observe the approved one-day canary and intentional test-server outage.
- API negotiation is cached until a connection URL/key change or process restart.
  Restart Barracks after upgrading an upstream server's API version.
- History backfill, fleet history storage, analytics and playback controls are
  subsequent chunks, not features of this compatibility delivery. Existing history,
  catalog and user views remain primary-only.
- Keep API-key connections on REST polling. Event tickets at this pin require an
  expiring token backed by a live login session, not an API key. No administrator
  password storage or synthesized event-session credentials were introduced.

## Verification

September 8, 2026 local verification:

- 156 automated tests passed with disposable PostgreSQL; zero failures or skips.
- Theme source audit, zero-warning frontend lint, production frontend build and
  `git diff --check` passed.
- Browser matrix: 92 desktop/mobile route-state checks, 44 Ocean/Mono themed-route
  checks and 10 state checks passed; no browser errors or unexpected mutations.
- Fleet browser fixtures passed aggregation, stale/partial totals, recovery,
  permission-safe management, API-version text and desktop/mobile diagnostics.
  Release-note onboarding is suppressed in this fleet-specific fixture to avoid
  an unrelated asynchronous modal stealing keyboard focus.
- Read-only live smoke: four successful activity polls, no activity error notice;
  existing application and database containers remain healthy.
- Spec review approved after resolving pagination bounds, missing identity,
  nullability and Problem Details handling findings.
- Final quality review approved after verifying the enforced 100-row session
  limit and profile-scoped catalog transport. Targeted recheck: 21 tests passed.

Browser checks target an isolated frontend preview with fixture-only management writes;
authenticated live checks are read-only. PostgreSQL tests use a disposable container,
never the live schema. The approved plan remains the rollout checklist; unchecked
release and later-chunk steps must not be interpreted as completed.
