# JellyGlance BETA functional parity — first pass

Compared against Nerdy-Technician/JellyGlance BETA at `bf949ec` on 2026-09-18.
This is a source-level comparison, not a completed live UX acceptance test.
Existing local work and Silo branding are preserved.

## Main finding

Much of the Home presentation already follows JellyGlance. The underlying data
contract does not: `/stats/getHomeDashboard` used Jellyfin SQL history, while Silo
intentionally uses its own read-only, retention-managed admin history. Copying
more frontend components would not fix empty or misleading Home statistics.

## Implemented

- Route Silo Home and Statistics overview analytics to native v2 dashboard stats,
  playback-activity and top-activity endpoints, without writing Silo history into
  Jellyfin tables.
- Populate declared-window playback starts/reliability, active profiles, peak UTC
  hours, catalog/storage totals, and title/profile leaderboards. Preserve Silo's
  account/profile distinction and endpoint window limits.
- Omit unconnected analytics widgets rather than reporting fabricated zeros;
  preserve their saved layout and identify unavailable widgets in the editor.
- Show refresh errors with Retry and indicate when the last-loaded data is shown.
  Do not keep analytics skeletons on screen after an initial load failure.
- Do not declare backups missing until operations health has loaded.

Silo catalog/storage counts are native. Library health/concentration, milestones,
daily comparisons, recommendations, season gaps and automation history remain
omitted until they have verified native sources. A notice explains omissions.
Quiet-user inference is not derived from a bounded activity response.

## Correction: use the complete Silo v2 surface

A subsequent review of Silo's own frontend and full contract found existing
`/api/v2/admin/stats`, `/admin/stats/playback-activity` and
`/admin/stats/top-activity` endpoints. These provide catalog/storage totals,
playback buckets/reliability, and title/profile leaderboards. They existed even at
the pinned revision, but were not included in the selected Barracks fixture.
Home and the Statistics overview now consume these native endpoints instead of
sampling finalized history. Their UI declares the aggregate time windows, treats
profiles separately from accounts, and does not fabricate unavailable historical
client/library rankings. Remaining omitted widgets need equally explicit native
sources before they are enabled.
See `activity-parity-review.md` for source verification and the distinction between
Silo's rich live Activity and its separate finalized Playback History.

## Parity work status

1. **Statistics — complete for verified contracts:** Silo sees only the native
   Overview. Jellyfin SQL count/duration tabs and unsupported client/library
   rankings are hidden.
2. **User and item drill-down — complete:** native account/profile and item
   history use read-only cursor paging. Primary and fleet IDs have distinct routes;
   Jellyfin wrap-up, last-played and genre totals are not shown as Silo facts.
3. **Catalog analytics — complete for verified contracts:** native catalog/storage
   totals retain exact/approximate semantics. Primary and secondary libraries have
   provider-scoped catalog and activity views.
4. **History exploration — contract-limited:** the complete pinned endpoint has no
   global text search, date range, arbitrary sort or grouping. Barracks exposes
   only its supported account/profile/item/completion filters and fixed ordering.
5. **Upstream additions — intentionally deferred:** Maintainerr is not rendered as
   a dead navigation item because this repository has no matching integration
   backend/settings contract.
6. **Interaction/playback acceptance — baseline complete:** the attached Silo was
   verified with a real stream, pause/resume, Barracks reconnect, finalization, and
   desktop/mobile headless Chrome, message, stop, durable terminate, and stale-
   target rejection. Remaining denied-authority, rate-limit and multi-server outage
   cases are listed in `activity-parity-review.md` and `silo-v2-status.md`.

## Validation

Unit tests cover aggregate semantics, exclusions, duplicate sessions, malformed
responses, cursor loops, bounded sampling and upstream failures. An HTTP fixture
checks the adapter uses admin history without catalog/profile access. Full test suite, production frontend build, zero-warning frontend lint, branding
audit, theme-color audit and contract validation pass locally. Baseline live Silo
playback and browser interaction verification passed on September 19, 2026; the
remaining credential, rate-limit and fleet failure-mode cases are explicitly documented.
