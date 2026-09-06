# Silo Barracks native activity integration

Approved direction: retain JellyGlance's dashboard and PostgreSQL, and implement real
Silo user activity monitoring. Baseline: JellyGlance v1.2.3-beta.3, b474638.

The primary acceptance flow is connecting a Silo administrator API key, seeing active
users and their media, device, progress and playback state, and recording observed
playback in Barracks PostgreSQL. The current Silo main source is the contract reference;
live deployment compatibility must be verified separately.

Use a dedicated native Silo adapter with bearer authentication and bounded HTTP
requests. Translate Silo responses at this boundary into the dashboard's existing
session and catalog shapes. Keep account, profile, content and playback-session IDs
distinct. Do not use the compatibility `/Sessions` endpoint, which returns an empty
array in the inspected Silo source.

Continue using the existing authenticated Barracks login and Socket.IO delivery.
Setup validates the native admin sessions endpoint. Credentials remain on the backend.
Expose Silo connection status to distinguish an unreachable server from zero viewers.
Failed polls must not finalize sessions; overlapping polls must not race database writes.
Polling resumes after failures, and successful empty responses end observed sessions.

Use Silo branding in application identity, setup, navigation and deployment examples.
Preserve upstream license notices and historical database names. Existing integrations
that depend on Jellyfin-specific APIs must not be represented as working Silo features.

Verification: contract fixtures from Silo source; HTTP tests with a local fixture server;
activity lifecycle tests including pause/resume, disappearance, failures and overlapping
polls; frontend build; focused UI checks; fresh git diff review. A live-server test is
required before claiming production compatibility. Historical backfill and additional
server-management controls are separate from observing active playback.
