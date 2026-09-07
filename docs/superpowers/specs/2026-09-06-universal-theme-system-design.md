# Universal Barracks Theme System Design

**Date:** 2026-09-06

## Goal

Make the Barracks visual language consistent across every screen reachable from
the main sidebar while preserving selectable themes. The chosen direction is a
warm Barracks foundation with controlled blue, coral, and orange section accents.
Decorative JellyGlance purple/teal gradients must not remain in application-owned
UI.

## Scope

The audit covers Home, Recently Added, Libraries and nested item views, Users and
profiles, Activity, Calendar, Statistics, every Settings subsection, About, and
their responsive/mobile presentations. It also covers components reached from
those screens: dialogs, menus, tooltips, forms, tables, pagination, charts,
loading states, empty states, warnings, and errors.

Provider/integration logos, media artwork, and colors needed to distinguish real
data series are allowed to retain meaningful colors. This work changes styling
and shared presentation primitives only; it does not change page features, data
contracts, navigation, permissions, or backend behavior.

## Visual Direction

All themes share the Barracks visual grammar:

- Dark, warm foundations with clearly separated surface levels.
- Restrained blue for focus and primary action, coral for live/active emphasis,
  and orange for warnings or paused states in the default theme.
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

`apps/web/src/lib/theme.js` owns the theme definition and application logic. Each
theme supplies core palette inputs and resolves them into a complete semantic
contract exposed as CSS custom properties:

- canvas and navigation backgrounds;
- raised, inset, interactive, and overlay surfaces;
- subtle and strong borders;
- primary, secondary, muted, and inverse text;
- focus and primary action;
- active/live, success, warning/paused, danger/error, and unavailable states;
- chart/grid/tooltip colors and a bounded chart series palette;
- shadows and scrims.

Missing or malformed stored theme data resolves to the default Barracks theme.
Theme application is atomic from the UI's perspective: all properties are set on
the root before consumers render the new state.

### 2. Framework compatibility layer

A single application-owned stylesheet maps the semantic contract onto shared
HTML controls and third-party component surfaces used by the product, including
Bootstrap and MUI cards, modals, menus, inputs, buttons, tables, tooltips,
pagination, tabs, chips, and popovers. This layer establishes safe defaults; it
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

Exceptions must be narrow to a file and purpose. They must not provide page
backgrounds, general surfaces, generic controls, or decorative gradients.

## State and Data Flow

At startup, saved theme input is validated and resolved against the default.
The theme module calculates derived colors and writes the semantic property set
to the document root. Application styles and compatibility rules consume only
those properties. Selecting another theme repeats this resolution, persists the
selection through the existing storage mechanism, and updates the open page,
portals, and overlays without reload.

Charts read the semantic chart palette at render time or receive resolved values
from the same theme module. They must refresh when the theme-change event fires.
Portalled MUI/Bootstrap overlays inherit root variables and therefore update with
the rest of the interface.

## Error Handling and Accessibility

- Invalid saved theme names, malformed colors, or incomplete custom values fall
  back to Barracks defaults without producing invalid CSS.
- Focus indicators remain visible on every interactive surface.
- Text and meaningful UI boundaries target WCAG AA contrast for their rendered
  size; disabled state may be lower contrast but remains legible.
- Color is not the sole indicator for active, paused, unavailable, warning, or
  error states; existing text/icons remain or are added where absent.
- Reduced-motion preferences continue to suppress nonessential transitions.
- Small viewports must not gain horizontal overflow from compatibility rules.

## Verification

### Automated checks

- Unit tests cover theme resolution, selection/persistence, derived semantic
  values, theme-change behavior, and malformed-input fallback.
- A repository style audit flags prohibited legacy literal purple/teal values,
  unauthorized application gradients, and newly introduced presentation color
  literals outside the explicit exceptions file.
- The production frontend build and full existing project test suite pass.

The style audit scans application-owned JSX/JS/CSS while ignoring generated
assets, official logo data, media content, and the narrow exceptions file. It
reports the file, line, and offending value so migration gaps are actionable.

### Browser coverage

An authenticated browser sweep visits every main sidebar route and representative
nested views/settings subsections. It verifies desktop and mobile navigation,
forms, tables, charts, dialogs, menus, loading/empty/error states, and absence of
horizontal overflow or runtime errors. Screenshots are captured for the default
Barracks theme and at least two visually distinct alternate themes. Switching a
theme while a dialog/chart is visible verifies that portalled and canvas/SVG
content updates immediately.

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
