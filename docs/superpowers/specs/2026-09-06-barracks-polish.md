# Barracks visual and activity reliability pass

The requested direction is Silo Server's identity, replacing JellyGlance's
purple/teal gradient and the blue square logo while retaining the dashboard.
Reference: https://siloserver.org/ (inspected September 6, 2026).

Use Silo's warm console neutrals with restrained blue accents and a transparent
three-bar Barracks mark in blue, red, and orange. Keep contrast suitable for
the existing dark dashboard. Apply the mark to navigation, login, setup,
session placeholders, favicon, and installation icons. The new default theme
uses a Barracks storage key so existing JellyGlance defaults do not override it.
Existing saved JellyGlance theme data is left intact under its original key.

## Activity findings and changes

The reported popup was not captured in historical server logs. Regression tests
did reproduce these failure paths:

- Concurrent consumers issued duplicate browser and upstream session requests.
- Optional health and episode details could add sequential eight-second waits.
- Missing container/codec/subtitle fields could throw while displaying sessions.
- A failed older REST request could overwrite a newer successful socket status.
- Loading the history page crashed inside MUI's breakpoint handling: the lockfile
  mixed Material UI 6, 7, and 9. Pin Material, System, and icons to 7.3.11, the
  supported common version for the installed Lab, MUI X, and table packages.
  Root overrides keep transitive consumers on those same versions. Exclude
  nested `node_modules` from Docker context so local dependencies cannot
  overwrite the clean container installation.

Share in-flight requests. Limit each required session request to five seconds
and retry transient gateway/network failures once, after 150ms. Do not retry
denied credentials, redirects, or malformed responses. Run optional metadata
lookups in parallel with a 1.5-second limit. Publish usable sessions without
waiting for optional history status. Preserve the last good snapshot and do
not overwrite a newer successful status with an older failure. Log sanitized
elapsed time/status for failed REST refreshes, never credentials or upstream URLs.

## Verification

Run the API suite against isolated PostgreSQL and the browser session-cache
regressions. Build the production container. Check login, dashboard, history,
and mobile layout with local Chromium. The optional smoke script
`scripts/check-barracks-ui.cjs` obtains a five-minute local test token in memory,
runs 16 live session polls, and saves screenshots to `BARRACKS_QA_DIR`.
`BARRACKS_PLAYWRIGHT` and `BARRACKS_CHROMIUM` may point to local installations.
No user password or Silo administrator key is printed or stored by that script.

External outages remain possible; the UI must report them accurately. Passing
checks are evidence for the tested paths, not a guarantee of zero future errors.

The full API/browser-unit suite passed 40/40 with isolated PostgreSQL. A live
80-second run completed 16 session polls with no failures or connection notices
(maximum response 25ms). History-page verification then exposed the separate
MUI version mismatch above, requiring a corrected build and another UI check.
The corrected history page loaded successfully on desktop and mobile with no
browser errors. Mobile inspection also caught an intrinsic grid-width overflow;
constrain the history grid column to the viewport and keep the wide table in
its own scrolling container. The inherited 80% zoom also combined with a 125%
body width to make the body wider than the mobile viewport; use `125vw` for
the intended inverse-zoom width. The smoke check asserts mobile controls fit.
