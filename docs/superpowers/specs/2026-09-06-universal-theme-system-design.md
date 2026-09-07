# Universal Barracks Theme System Design

**Date:** 2026-09-06

## Goal

Make the Barracks visual language consistent across every screen reachable from
the main sidebar while preserving selectable themes. The chosen direction is a
warm Barracks foundation with controlled blue, coral, and orange section accents.
Decorative JellyGlance purple/teal gradients must not remain in application-owned
UI.

## Scope

The audit covers every unconditional and conditional main-navigation destination:
Home and Kiosk, Recently Added, Libraries and nested item views, Users and
profiles, Activity and Timeline, Calendar, Requests, Downloads, Active
Transcodes, Invites/Wizarr, Automation Health, Statistics, Server Management,
Settings, Integrations, and About. It includes every Settings subsection:
General, Security, Kiosk, Libraries, Activity Monitor, Authorised Devices,
Plugins, Integrations, Silo Servers, API Keys, Webhooks, Notifications,
Newsletter, Tasks, Backup, Imports, Health, Repair, and Logs. Provider- or
integration-dependent screens are tested with fixture availability enabled.
All routes include their responsive/mobile presentations and components reached from
those screens: dialogs, menus, tooltips, forms, tables, pagination, charts,
loading states, empty states, warnings, and errors.

Provider/integration logos, media artwork, and colors needed to distinguish real
data series are allowed to retain meaningful colors. This work changes styling
and shared presentation primitives only; it does not change page features, data
contracts, navigation, permissions, or backend behavior.

## Visual Direction

All themes share the Barracks visual grammar:

- Dark, warm foundations with clearly separated surface levels.
- Default semantic accents are steel blue `#6f9bcf` for focus and primary action,
  coral `#ff6f63` for live/active emphasis, and orange `#ffa64f` for warnings or
  paused states. Success is `#70b981`; danger/error is `#e45f55`. All are paired
  with text or icons rather than used as the only state indicator.
- Section accents may use coordinated theme colors, but broad decorative
  purple/teal gradients are prohibited.
- Compact operational typography, readable contrast, deliberate borders, and
  modest corner radii.
- Selected, hover, focus, disabled, loading, empty, success, warning, danger,
  and unavailable states remain visibly distinct.

Alternate themes may change hues, but each must define the same semantic roles
and preserve contrast and state meaning. Theme selection remains available,
updates the complete visible interface immediately, and persists across reloads.

## Architecture

### 1. Semantic theme contract

`apps/web/src/lib/theme.js` owns theme validation, derivation, persistence, and
application. Presets and custom themes retain the four public six-digit hex
inputs `primary`, `secondary`, `background`, and `surface`. The resolver returns
a plain object of CSS color strings keyed by the following stable contract, then
`applyTheme` writes the equivalent CSS properties:

| Resolver key | CSS property | Role |
| --- | --- | --- |
| `canvas` | `--barracks-canvas` | Page background |
| `nav` | `--barracks-nav` | Desktop/mobile navigation |
| `surfaceRaised` | `--barracks-surface-raised` | Cards/dialogs |
| `surfaceInset` | `--barracks-surface-inset` | Tables/code/inset regions |
| `surfaceInteractive` | `--barracks-surface-interactive` | Inputs/menus/hover targets |
| `overlay` | `--barracks-overlay` | Popovers/tooltips |
| `borderSubtle`, `borderStrong` | `--barracks-border-subtle`, `--barracks-border-strong` | Boundaries |
| `text`, `textMuted`, `textInverse` | `--barracks-text`, `--barracks-text-muted`, `--barracks-text-inverse` | Typography |
| `focus`, `focusLight`, `focusDark`, `action`, `accentSecondary` | `--barracks-focus`, `--barracks-focus-light`, `--barracks-focus-dark`, `--barracks-action`, `--barracks-accent-secondary` | Keyboard focus/actions/theme personality |
| `live`, `success`, `warning`, `danger`, `unavailable` | matching `--barracks-state-*` properties | Status semantics |
| `chartGrid`, `chartTooltip` | matching `--barracks-chart-*` properties | Chart structure |
| `chart1` through `chart6` | `--barracks-chart-1` through `--barracks-chart-6` | Ordered series palette |
| `scrim`, `shadow` | `--barracks-scrim`, `--barracks-shadow` | Layer depth |

RGB companions `--barracks-action-rgb`, `--barracks-accent-secondary-rgb`, and
`--barracks-surface-raised-rgb` contain comma-separated decimal channels for
opacity consumers. Legacy aliases `--primary-color`, `--primary-rgb`,
`--primary-light-color`, `--primary-light-rgb`, `--primary-dark-color`,
`--secondary-color`, `--secondary-rgb`, `--background-color`,
`--secondary-background-color`, `--tertiary-background-color`, `--surface-color`,
`--surface-border-color`, `--text-color`, `--muted-text-color`, and
`--subtle-text-color` remain mapped to resolved semantic values during this
migration so unchanged third-party/library rules do not break. New or migrated
application styles use only `--barracks-*` names.

Derivation is deterministic: `canvas` uses `background`; `nav` and
`surfaceRaised` use `surface`; inset/interactive/overlay and borders are fixed
linear RGB mixes of `surface`, `background`, and the chosen text color; focus and
action use `primary`; theme personality uses `secondary`; state colors use the
accessible fixed status values above; chart series are `[primary, live, warning,
secondary, success, danger]`. The resolver and storage adapter are exported pure
units and can be tested without rendering React.

Non-text contrast uses WCAG's 3:1 threshold. Primary/action and each state/chart
candidate are mixed toward whichever of warm light or near-black reaches 3:1
against its specified surface with the smallest change; action text is then
chosen at 4.5:1. `borderStrong` reaches 3:1 against its associated interactive
surface and is used for controls and meaningful boundaries; `borderSubtle` is
decorative only. Charts resolve series against `surfaceInset`, and retain labels,
legends, markers, or existing patterns so color is not their sole distinction.
Focus never relies on a single custom color: every focus-visible rule renders
the adjusted `focus` ring together with one-pixel `focusLight` (`#f5f0e7`) and
`focusDark` (`#10100f`) boundaries. This light/dark pair ensures at least one
visible 3:1 boundary even for degenerate custom palettes with opposing canvas
and surface colors.

For each background/surface, the resolver chooses the higher-contrast of warm
light `#f5f0e7` and near-black `#10100f` for normal text. Muted text is mixed
toward the background only until it still meets 4.5:1. Action/state text chooses
black or white based on the same WCAG relative-luminance calculation. If a custom
foreground role cannot meet 4.5:1, the resolver substitutes the higher-contrast
choice. Thus arbitrary valid custom inputs remain accepted without making normal
text unreadable. Missing or malformed fields fall back individually to the
corresponding default input. Theme application is atomic from the UI's
perspective: all properties are calculated before any are written to the root.

### 2. Framework compatibility layer

A new `apps/web/src/pages/css/framework-theme.css` stylesheet maps the semantic contract onto shared
HTML controls and third-party component surfaces used by the product, including
Bootstrap and MUI cards, modals, menus, inputs, buttons, tables, tooltips,
pagination, tabs, chips, and popovers. It may target documented Bootstrap/MUI
public classes and CSS variables but may not depend on generated class names.
Charts do not depend on this stylesheet: `getThemeTokens()` from `theme.js`
supplies SVG/canvas props and the theme-change event triggers their rerender.
This layer establishes safe defaults; it
does not use sweeping selectors that erase intentional component states or
provider branding.

### 3. Page migration

Application-owned page and component styles replace hard-coded presentation
colors with semantic properties. Page-specific CSS may select a semantic accent
or combine low-opacity semantic surface layers. It may not introduce literal
legacy JellyGlance purple/teal decoration. Shared patterns found during the audit
are consolidated only when doing so directly improves theme consistency; this is
not a general component rewrite.

### 4. Exceptions

Literal colors remain permissible only in a documented allowlist for:

- official third-party/provider logos;
- media artwork or embedded image data;
- data-series palettes where distinct series need additional hues;
- accessibility-critical browser or library behavior that cannot consume CSS
  custom properties.

Exceptions live in `apps/web/theme-color-exceptions.json` as
`{"exceptions":[{"path":"relative/file","values":["#rrggbb"],"reason":"..."}]}`.
Paths are exact repository-relative paths, values are case-insensitive exact
color literals (no regular expressions or directory wildcards), and every entry
requires a nonempty reason. The audit permits only the listed value in the listed
file. The web UI maintainers own this file. Exceptions must be narrow to a file and purpose. They must not provide page
backgrounds, general surfaces, generic controls, or decorative gradients.

## State and Data Flow

At startup, saved theme input is validated and resolved against the default.
The existing `silo_barracks_theme` storage value remains a JSON object with the
four public palette fields; no destructive migration is required. Unknown fields
are ignored. Existing per-field fallback behavior is retained and made explicit:
one invalid field does not discard valid siblings. Storage reads, writes, and
removals are wrapped independently. A read failure uses defaults; a write/remove
failure still applies the requested theme for the current page lifetime and does
not throw into React.
The theme module calculates derived colors and writes the semantic property set
to the document root. Application styles and compatibility rules consume only
those properties. Selecting another theme repeats this resolution, persists the
selection through the existing storage mechanism, and updates the open page,
portals, and overlays without reload. The existing
`jellyglance-theme-updated` event remains emitted for compatibility and a new
`silo-barracks-theme-updated` event with the resolved token object is emitted for
migrated consumers. Both fire after root properties are updated.

Charts read the semantic chart palette at render time or receive resolved values
from the same theme module. They must refresh when the theme-change event fires.
Portalled MUI/Bootstrap overlays inherit root variables and therefore update with
the rest of the interface.

Home/Kiosk display modes remain layout/density choices, not independent color
systems. `default`, `darker`, `highContrast`, and `wall` remain supported and use
semantic tokens. The stored `neon` identifier remains accepted for backward
compatibility but is relabeled “Signal” and recolored with low-opacity semantic
blue/coral/orange accents. It contains no purple/teal literals. Existing saved
Kiosk settings therefore continue to load without preserving JellyGlance styling.

## Error Handling and Accessibility

- Invalid saved theme names, malformed colors, or incomplete custom values fall
  back per field to Barracks defaults without producing invalid CSS. Storage API
  failures use the in-memory/default behavior described above.
- Focus indicators remain visible on every interactive surface.
- Text and meaningful UI boundaries target WCAG AA contrast for their rendered
  size; disabled state may be lower contrast but remains legible.
- Color is not the sole indicator for active, paused, unavailable, warning, or
  error states; existing text/icons remain or are added where absent.
- Reduced-motion preferences continue to suppress nonessential transitions.
- Small viewports must not gain horizontal overflow from compatibility rules.
- Tests include degenerate valid custom inputs where primary equals background,
  all four inputs are identical, and background/surface are black/white opposites.
  Focus, meaningful boundaries, state icons, controls, and graphical chart
  objects must retain the contrast behavior defined above.

## Verification

### Automated checks

- Unit tests cover theme resolution, selection/persistence, derived semantic
  values, theme-change behavior, and malformed-input fallback.
- `scripts/check-theme-colors.cjs` scans application-owned `.css`, `.js`, and
  `.jsx` under `apps/web/src`. It flags every CSS color literal outside
  the central definitions in `theme.js` and `pages/css/variables.css` unless the
  exact file/value pair is allowlisted. `variables.css` may contain literals only
  as fallback declarations for the semantic contract. Color literals
  include hex, `rgb()`/`rgba()`, `hsl()`/`hsla()`, `hwb()`, `lab()`, `lch()`,
  `oklab()`, `oklch()`, `color()`, and CSS named colors such as `white`, `black`,
  and `grey`; matching is case-insensitive and syntax-aware. The non-palette
  keywords `transparent`, `currentColor`, `inherit`, `initial`, and `unset` are
  permitted. It also flags every
  `linear-gradient`, `radial-gradient`, or `conic-gradient` whose color stops
  contain literals or do not exclusively reference `--barracks-*` tokens.
  Generated assets, `apps/web/public`, and dependencies are outside its scan.
- The production frontend build and full existing project test suite pass.

The style audit scans application-owned JSX/JS/CSS while ignoring generated
assets, official logo data, media content, and the narrow exceptions file. It
reports the file, line, and offending value so migration gaps are actionable.

### Browser coverage

An authenticated browser route matrix visits every route named in Scope, both
nested Library routes, a User profile, Activity Timeline, Integrations, Kiosk,
and every named Settings subsection. Conditional destinations use controlled
fixtures so the sidebar links and principal states render. For each route it verifies desktop navigation,
and a 390px mobile pass verifies navigation,
forms, tables, charts, dialogs, menus, loading/empty/error states, and absence of
horizontal overflow or runtime errors. Screenshots are captured for the default
Barracks theme and at least two visually distinct alternate themes. Switching a
theme while a dialog/chart is visible verifies that portalled and canvas/SVG
content updates immediately. The screenshot matrix captures all routes in the
default Barracks preset. Ocean and Mono exercise all top-level routes plus open
dialog, chart, table, and Settings samples. One valid custom palette and malformed
stored input exercise Home, Activity, Settings, an open dialog, and a chart.

## Acceptance Criteria

1. Every screen reachable from the sidebar follows the shared Barracks visual
   grammar in desktop and mobile layouts.
2. Users can choose multiple themes; selections persist and apply universally.
3. Default Barracks uses the approved warm foundation with restrained section
   accents.
4. No application-owned screen retains decorative JellyGlance purple/teal
   styling or unapproved literal presentation colors.
5. Controls, tables, charts, dialogs, and all status states remain readable and
   semantically clear.
6. Theme failures safely fall back to Barracks.
7. Styling changes do not alter existing application functionality.
