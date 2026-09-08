# Multiple Silo servers

Open **Settings → Silo Servers** to add a named connection with its Silo URL and administrator API key. Barracks validates health and activity access before saving it. Up to 20 additional servers are supported.

The home dashboard combines live streams from all enabled servers. Paused sessions count as active. Select a server card or use **Show activity** to filter. Unavailable servers retain clearly marked last-known sessions, but those sessions are excluded from the confirmed total. A partial-total notice means at least one enabled server cannot currently be counted.

Connections can be renamed, disabled, enabled, or removed. Leaving the key blank when editing retains the saved key. The primary connection is managed separately in Media Server settings. Adding the same server under another URL is rejected. If primary configuration later changes to an already-added server, the duplicate is excluded from monitoring.

This version aggregates **live activity only**. Saved playback history, library statistics, user pages, and catalog pages still belong to the primary server. Additional-server session cards do not link into primary-server users or catalog items.

Connections negotiate v1 or v2 independently, so mixed fleets are supported. Server
settings display the detected API major and optional session-diagnostics availability.
V2 session/user collections are fully paged with per-server ID deduplication. A failed
later page or page-limit breach makes that server unavailable/partial rather than
publishing a smaller confirmed total. Sessions without catalog attribution still
count, but have no catalog link. Supported diagnostics include hardware acceleration,
tone mapping, client build/channel, source/target audio and execution/egress nodes;
denied diagnostics do not disable ordinary activity. Restart Barracks after an
upstream API-version upgrade to renegotiate cached connections.

Additional API keys are encrypted in PostgreSQL using the installation's `JWT_SECRET`. Keep that secret securely with full PostgreSQL backups: restoring the database with a different secret requires re-entering the additional-server keys. The existing in-app activity/catalog backup does not include server connections. Keys are never returned by management or activity endpoints. Management requires Settings permission; viewing activity requires Dashboard permission. Fleet updates use authenticated REST polling every five seconds.
