# Universal Barracks Theme System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every screen reachable from the Silo Barracks sidebar consume one semantic, multi-theme visual system with no lingering JellyGlance purple/teal presentation.

**Architecture:** Keep the existing four-color preset/custom-theme interface, resolve it through pure functions into an explicit `--barracks-*` token contract, and map those tokens onto application, Bootstrap, MUI, and chart surfaces. A syntax-aware repository audit drives page migration in test-first batches; authenticated browser sweeps verify every route and representative state at desktop and mobile sizes.

**Tech Stack:** React 19, Vite, CSS custom properties, Bootstrap 5, MUI 7, Recharts, Node 22 test runner, Playwright browser checks, Docker Compose.

**Design spec:** `docs/superpowers/specs/2026-09-06-universal-theme-system-design.md`

---

## File map

**Theme engine and contract**

- Modify `apps/web/src/lib/theme.js`: validate four public inputs, derive accessible semantic tokens, apply/persist/reset themes, emit compatibility and Barracks events.
- Create `apps/web/src/lib/theme.test.js`: pure resolution, contrast, storage, event, persistence-failure, and atomic-application tests.
- Modify `apps/web/src/pages/css/variables.css`: default semantic properties plus temporary legacy aliases.
- Create `apps/web/src/pages/css/framework-theme.css`: shared HTML/Bootstrap/MUI surface and state adapters; charts use the JavaScript token adapter instead.
- Modify `apps/web/src/index.jsx`: load the compatibility layer after vendor CSS.
- Modify `apps/web/src/App.css`: migrate globally imported shell/component rules.

**Enforcement**

- Create `apps/web/theme-color-exceptions.json`: exact file/value/reason allowlist for official logo or embedded asset colors.
- Create `scripts/check-theme-colors.cjs`: syntax-aware literal/gradient audit with optional exact file arguments.
- Create `scripts/check-theme-colors.test.cjs`: scanner and allowlist behavior tests.
- Modify `package.json`: include audit tests in `npm test` and add `theme:check`.

**Page migration**

- Modify every application stylesheet under `apps/web/src/pages/css/` listed in Task 5 through Task 10.
- Modify `apps/web/src/index.css` and any JSX named by scanner output where inline presentation literals remain.
- Modify `apps/web/src/pages/css/barracks.css`: narrow brand grammar; remove its role as a high-specificity patch pile.
- Modify `apps/web/src/pages/css/home.css`, `apps/web/src/lib/home-settings.js`, `apps/web/src/pages/home.jsx`, and `apps/web/src/pages/components/settings/KioskSettings.jsx`: convert Kiosk color modes to semantic variants and migrate stored `neon` to the “Signal” presentation.
- Modify chart consumers that currently read legacy values, including `apps/web/src/pages/components/activity/activity-table.jsx` and chart components under `apps/web/src/pages/components/statistics/` and `apps/web/src/pages/components/statCards/`.

**Verification**

- Create `scripts/check-universal-theme-ui.cjs`: authenticated route/state matrix, theme switching, desktop/mobile overflow, computed-color, and screenshot checks.
- Modify `docs/superpowers/specs/2026-09-06-universal-theme-system-design.md` only if implementation reveals a contract correction; otherwise leave it unchanged.

## Numeric token rules

All RGB mixing uses `round(a * (1 - weight) + b * weight)` per channel.

- `canvas = background`.
- `nav = mix(surface, background, 0.35)`.
- `surfaceRaised = surface`.
- `surfaceInset = mix(surface, background, 0.38)`.
- `surfaceInteractive = mix(surface, text, 0.06)`.
- `overlay = mix(surface, background, 0.18)`.
- `borderSubtle = mix(surface, text, 0.18)` and is decorative only.
- `borderStrong` begins at `mix(surfaceInteractive, text, 0.42)` and is adjusted toward warm light or near-black until it reaches 3:1 against `surfaceInteractive`.
- `text`, `textRaised`, `textInset`, `textInteractive`, `textNav`, and `textOverlay` independently choose whichever of `#f5f0e7` or `#10100f` has greater contrast against `canvas`, `surfaceRaised`, `surfaceInset`, `surfaceInteractive`, `nav`, and `overlay` respectively when it reaches 4.5:1; if both warm endpoints fall short on a saturated midtone, use whichever of `#ffffff` or `#000000` has higher contrast. Every pairing therefore reaches 4.5:1. `textMuted` is the closest mix toward `canvas` that still reaches 4.5:1 there. `textMutedRaised` independently starts from `textRaised` and is the closest mix toward `surfaceRaised` that still reaches 4.5:1 there. `textInverse` is the opposite warm canvas text endpoint. Every component uses the normal/muted text role matching its actual semantic background.
- `accentSecondary = secondary`; expose comma-separated RGB companions for `action`, `accentSecondary`, and `surfaceRaised`.
- `focus = ensureContrast(primary, surfaceRaised, 3)`, with `focusLight = #f5f0e7` and `focusDark = #10100f`; focus CSS always renders all three rings.
- `action` is the closest RGB mix from `primary` toward warm light or near-black that both reaches 3:1 against `surfaceInteractive` and permits one of those endpoints to reach 4.5:1 as `actionText`; choose the valid fill/text pair with the smallest mix weight. `actionForeground = ensureContrast(primary, canvas, 4.5)` is the canvas-safe link/accent foreground; links inside raised surfaces use the raised-surface text role instead. Focus remains a ring token and is never used as a control fill.
- Fixed status candidates are live `#ff6f63`, success `#70b981`, warning `#ffa64f`, danger `#e45f55`, unavailable `#a0977f`; each is adjusted only when needed to reach 3:1 against `surfaceRaised`.
- `chartGrid = borderSubtle`, `chartTooltip = overlay`, and series candidates are `[primary, live, warning, secondary, success, danger]`, each adjusted to 3:1 against `surfaceInset`.
- `scrim` is the color value `rgba(8, 7, 5, 0.72)` for the default and is derived from `canvas` at 72% alpha for custom themes.
- `shadow` is a complete CSS box-shadow value: `0 12px 32px rgba(R, G, B, 0.28)`, using canvas RGB.

## Chunk 1: Semantic theme engine and enforcement

### Task 1: Pure semantic resolver

**Files:**
- Modify: `apps/web/src/lib/theme.js`
- Create: `apps/web/src/lib/theme.test.js`

- [ ] **Step 1: Write failing resolver tests**

Add table-driven Node tests for default values, per-field malformed fallback, all semantic keys, RGB mixing coefficients, and `contrastRatio()` results. Include separate degenerate palettes where primary equals background while the other inputs differ, all inputs match, background/surface are `#000000`/`#ffffff` opposites, and saturated midtones make both warm text endpoints fall short. Assert each normal text token reaches 4.5:1 against its named surface across those and deterministic seeded palettes; assert `textMuted` against canvas and `textMutedRaised` against raised surface, including a vivid palette where no single color can meet 4.5:1 on both; assert `action` is 3:1 against interactive, `actionText` is 4.5:1 against action, and `actionForeground` is 4.5:1 against canvas for opposing light/dark and random valid palettes; assert all six chart series against inset, strong border against interactive, all state colors against raised, and that the three focus-ring tokens remain the primary/accessible light/dark combination.

```js
test('resolveTheme keeps meaningful UI contrast for degenerate custom colors', () => {
  const { tokens } = resolveTheme({
    primary: '#222222', secondary: '#222222', background: '#222222', surface: '#222222',
  });
  assert.ok(contrastRatio(tokens.text, tokens.canvas) >= 4.5);
  assert.ok(contrastRatio(tokens.borderStrong, tokens.surfaceInteractive) >= 3);
  for (const key of ['action', 'live', 'success', 'warning', 'danger', 'unavailable']) {
    assert.ok(contrastRatio(tokens[key], tokens.surfaceRaised) >= 3);
  }
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test apps/web/src/lib/theme.test.js`

Expected: FAIL because `resolveTheme` and `contrastRatio` are not exported.

- [ ] **Step 3: Implement pure color and resolver functions**

Export `normalizeThemeInput`, `relativeLuminance`, `contrastRatio`, `mixHex`, `ensureContrast`, and `resolveTheme`. `resolveTheme(input)` must return `{ input, tokens }`, calculate every value before returning, and follow the numeric token rules above. Do not touch DOM or storage in these functions.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `node --test apps/web/src/lib/theme.test.js`

Expected: all resolver and contrast tests PASS.

- [ ] **Step 5: Commit the resolver**

```bash
git add apps/web/src/lib/theme.js apps/web/src/lib/theme.test.js
git commit -m "feat(theme): add accessible semantic resolver"
```

### Task 2: Safe storage, events, and atomic application

**Files:**
- Modify: `apps/web/src/lib/theme.js`
- Modify: `apps/web/src/lib/theme.test.js`
- Modify: `apps/web/src/pages/css/variables.css`

- [ ] **Step 1: Write failing adapter tests**

Use small in-memory `storage`, `root.style`, and `eventTarget` fakes. Assert existing four-field JSON loads per field, `applyTheme(undefined)` loads that stored value, unknown fields are ignored, failed reads use defaults, failed writes/removals still apply in memory, all properties are calculated before the first `setProperty`, the complete legacy alias/RGB map below is set, `getThemeTokens()` returns a defensive copy of the last applied tokens, event payloads are exact, save/reset preserve their existing normalized-input return values, and save/reset each emit each event exactly once after application. Direct `applyTheme` must emit no event. Add a regression proving that when `silo_barracks_theme` is absent, a valid `jellyglance_custom_theme` value is loaded, normalized, written once to the Barracks key, and returned; the Barracks key always takes precedence when both exist.

```js
test('saveTheme applies and emits even when storage rejects writes', () => {
  const calls = [];
  const storage = { setItem() { throw new Error('quota'); } };
  const root = fakeRoot(calls);
  const eventTarget = fakeEvents(calls);
  assert.doesNotThrow(() => saveTheme(DEFAULT_THEME, { storage, root, eventTarget }));
  assert.ok(calls.indexOf('set:--barracks-canvas') < calls.indexOf('event:silo-barracks-theme-updated'));
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test apps/web/src/lib/theme.test.js`

Expected: FAIL because adapters cannot be injected and Barracks events/tokens are absent.

- [ ] **Step 3: Implement the adapters**

Use exact signatures `getStoredTheme({ storage = localStorage } = {})`, `applyTheme(theme, { root = document.documentElement, storage = localStorage } = {})`, `getThemeTokens()`, `saveTheme(theme, { storage = localStorage, root = document.documentElement, eventTarget = window } = {})`, and the same dependency object for `resetTheme`. When `theme` is `undefined`, `applyTheme` calls `getStoredTheme({ storage })`, preserving current `index.jsx` startup behavior. `applyTheme` stores the resolved token object in module state and `getThemeTokens()` returns a defensive copy. Preserve `THEME_STORAGE_KEY = 'silo_barracks_theme'` and add `LEGACY_THEME_STORAGE_KEY = 'jellyglance_custom_theme'`; `getStoredTheme` reads the legacy key only when the Barracks key is absent and best-effort migrates the normalized value to the Barracks key without failing theme load if that write throws. `applyTheme` calculates and writes only; it never dispatches. `saveTheme`/`resetTheme` each call it once, return the normalized four-field input as today, then dispatch `jellyglance-theme-updated` with normalized public inputs and `silo-barracks-theme-updated` with resolved tokens exactly once. Catch storage operations independently.

- [ ] **Step 4: Declare default variables and aliases**

Update `variables.css` with every `--barracks-*` property and map old properties, for example:

```css
:root {
  --barracks-canvas: #161410;
  --barracks-surface-raised: #221c14;
  --barracks-action: #6f9bcf;
  --barracks-action-rgb: 111, 155, 207;
  --barracks-accent-secondary: #a0977f;
  --barracks-accent-secondary-rgb: 160, 151, 127;
  --barracks-surface-raised-rgb: 34, 28, 20;
  --barracks-state-live: #ff6f63;
  --barracks-state-warning: #ffa64f;
  --background-color: var(--barracks-canvas);
  --secondary-background-color: var(--barracks-surface-raised);
  --primary-color: var(--barracks-action);
}
```

Declare every semantic property in the spec table, including the six surface-specific normal text properties, `--barracks-text-muted-raised`, `--barracks-action-text`, and `--barracks-action-foreground`, plus all three RGB companions before aliases. The required alias map is: primary color/RGB → action; primary light color/RGB → `mix(action, focusLight, 0.42)`; primary dark → `mix(action, focusDark, 0.28)`; secondary color/RGB → accentSecondary; background → canvas; secondary background → raised; tertiary background → interactive; surface color → raised RGB at 86% alpha; surface border → borderSubtle; text → text; muted text → textMuted; subtle text → unavailable. Tests assert every semantic property, RGB companion, and alias, including comma-separated RGB formats.

- [ ] **Step 5: Run focused tests and build**

Run: `node --test apps/web/src/lib/theme.test.js && npm run build --workspace apps/web`

Expected: tests PASS and Vite exits 0.

- [ ] **Step 6: Commit the adapter contract**

```bash
git add apps/web/src/lib/theme.js apps/web/src/lib/theme.test.js apps/web/src/pages/css/variables.css
git commit -m "feat(theme): apply semantic themes safely"
```

### Task 3: Reproducible application-color audit

**Files:**
- Create: `scripts/check-theme-colors.cjs`
- Create: `scripts/check-theme-colors.test.cjs`
- Create: `apps/web/theme-color-exceptions.json`
- Modify: `package.json`

- [ ] **Step 1: Write scanner tests against temporary fixtures**

Test hex, rgb/rgba, hsl/hsla, hwb, lab/lch, oklab/oklch, `color()`, and case-insensitive named colors. Test that `transparent`, `currentColor`, `inherit`, `initial`, `unset`, CSS variables, central `variables.css` fallback declarations, approved exact file/value pairs, and gradients using only `--barracks-*` tokens pass. A `variables.css` fixture containing a literal under an unknown property must fail. Add fixtures proving comments are ignored without shifting diagnostic line numbers and quoted embedded CSS/SVG literals are detected. Test literal gradient stops, wildcard-like exception paths, missing reasons, and mismatched paths fail with file/line/value output.

- [ ] **Step 2: Run and confirm RED**

Run: `node --test scripts/check-theme-colors.test.cjs`

Expected: FAIL because the scanner module is missing.

- [ ] **Step 3: Implement scanner module and CLI**

Export `auditSources({ root, files, exceptions })`. Replace comment characters with spaces/newlines to preserve offsets, parse quoted embedded CSS/SVG as source, and recognize the complete color grammar from the spec. CLI defaults to application `.css/.js/.jsx`; exact file or directory arguments recursively constrain a migration batch. Exclude `apps/web/public`, generated `dist`, dependencies, and `theme.js`. In `variables.css`, permit literals only when the declaration name is one of the complete semantic properties/RGB companions/legacy aliases enumerated in the spec and Task 2; reject literals under any other declaration. Exit 1 with stable diagnostics for violations.

- [ ] **Step 4: Populate narrow initial exceptions**

Add only official third-party/provider logo or embedded image literals discovered by the first scan. Each object has exact repository path, exact literal values, and a nonempty purpose. Do not except generic page or control colors.

- [ ] **Step 5: Wire scripts and verify scanner behavior**

Add:

```json
"test": "node --test apps/api/tests/*.test.js apps/web/src/lib/*.test.js scripts/*.test.cjs",
"theme:check": "node scripts/check-theme-colors.cjs"
```

Run: `node --test scripts/check-theme-colors.test.cjs`

Expected: scanner tests PASS.

Run: `npm test`

Expected: the root test script executes scanner tests and the complete current suite passes.

Run: `npm run theme:check`

Expected: FAIL with actionable existing page violations; this is the migration baseline, not a completion failure.

- [ ] **Step 6: Commit audit tooling**

```bash
git add scripts/check-theme-colors.cjs scripts/check-theme-colors.test.cjs apps/web/theme-color-exceptions.json package.json
git commit -m "test(theme): enforce semantic application colors"
```

## Chunk 2: Universal component and route migration

### Task 4: Framework and shared-shell compatibility

**Files:**
- Create: `apps/web/src/pages/css/framework-theme.css`
- Modify: `apps/web/src/index.jsx`
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/App.css`
- Modify: `apps/web/src/pages/css/barracks.css`
- Modify: `apps/web/src/pages/css/navbar.css`
- Modify: `apps/web/src/pages/css/loading.css`
- Modify: `apps/web/src/pages/css/error.css`
- Modify: `apps/web/src/pages/css/websocket/websocket.css`
- Modify: `apps/web/src/pages/components/general/navbar.jsx` (stable theme-control test IDs only)

- [ ] **Step 1: Run the audit on shared files and record RED**

Run: `node scripts/check-theme-colors.cjs apps/web/src/index.css apps/web/src/App.css apps/web/src/pages/css/barracks.css apps/web/src/pages/css/navbar.css apps/web/src/pages/css/loading.css apps/web/src/pages/css/error.css apps/web/src/pages/css/websocket/websocket.css`

Expected: FAIL listing current literals/legacy gradients.

- [ ] **Step 2: Add framework mappings**

Map `body`, links, controls, Bootstrap `.card/.modal-content/.dropdown-menu/.table/.nav-tabs/.pagination/.tooltip`, and MUI paper/dialog/menu/input/button/table/data-grid/picker selectors to semantic properties. Charts remain outside this layer and receive `getThemeTokens()` values in Task 9. Use only stable public selectors. Focus-visible uses three rings:

```css
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--barracks-focus);
  box-shadow: 0 0 0 3px var(--barracks-focus-light), 0 0 0 4px var(--barracks-focus-dark);
}
```

- [ ] **Step 3: Import compatibility CSS after Bootstrap**

In `index.jsx`, import `framework-theme.css` after vendor Bootstrap and before the narrow brand stylesheet. Add exact stable IDs `theme-account-desktop`, `theme-account-mobile`, `theme-menu`, `theme-preset-ocean`, `theme-preset-mono`, and `theme-color-primary` to the corresponding account/theme controls in `navbar.jsx`; these do not change behavior. The desktop and mobile account controls have distinct IDs so every rendered test ID is unique; the browser script selects the visible control for its viewport.

- [ ] **Step 4: Migrate shared shell styles**

Replace shared hard-coded backgrounds/text/borders in `index.css`, `App.css`, and shared state files with semantic tokens. Keep `barracks.css` for type/shape/brand accents, remove broad corrective selectors now owned by `framework-theme.css`, and preserve responsive dimensions.

- [ ] **Step 5: Run shared audit, lint, and build**

Run the Step 1 audit command again with `apps/web/src/pages/css/framework-theme.css` appended.

Expected: PASS.

Run: `npm run lint --workspace apps/web && npm run build --workspace apps/web`

Expected: both exit 0.

- [ ] **Step 6: Commit shared compatibility**

```bash
git add apps/web/src/index.jsx apps/web/src/index.css apps/web/src/App.css apps/web/src/pages/components/general/navbar.jsx apps/web/src/pages/css/{framework-theme,barracks,navbar,loading,error}.css apps/web/src/pages/css/websocket/websocket.css
git commit -m "feat(theme): unify shared application surfaces"
```

### Task 5: Home, sessions, fleet, and Recently Added

**Files:**
- Modify: `apps/web/src/pages/css/home.css`, `home-user-wrap.css`, `sessions.css`, `fleet.css`, `recent.css`, `recently-added-page.css`, `lastplayed.css`
- Modify: `apps/web/src/pages/components/home/UserWrapUpDashboard.jsx`
- Modify: `apps/web/src/pages/components/sessions/session-card.jsx`
- Modify: `apps/web/src/pages/debugTools/session-card.jsx`, `apps/web/src/pages/debugTools/sessions.jsx`
- Modify: `apps/web/src/pages/debugTools/sessionCard.css`
- Modify: `apps/web/src/pages/home.jsx`, `apps/web/src/pages/recently-added.jsx` (stable screen IDs)

- [ ] **Step 1: Run the exact batch audit and confirm RED**

Run: `node scripts/check-theme-colors.cjs apps/web/src/pages/css/home.css apps/web/src/pages/css/home-user-wrap.css apps/web/src/pages/css/sessions.css apps/web/src/pages/css/fleet.css apps/web/src/pages/css/recent.css apps/web/src/pages/css/recently-added-page.css apps/web/src/pages/css/lastplayed.css apps/web/src/pages/components/home/UserWrapUpDashboard.jsx apps/web/src/pages/components/sessions/session-card.jsx apps/web/src/pages/debugTools`

Expected: FAIL with legacy literals/gradients.

- [ ] **Step 2: Migrate Home and session surfaces**

Use raised/inset panels, semantic metric/status colors, and token-only section accents. Preserve artwork overlays. Replace inline card gradients and debug equivalents with token expressions. Add stable `data-theme-screen` values `home`, `kiosk`, and `recently-added` to page roots.

- [ ] **Step 3: Re-run the exact batch audit**

Expected: PASS. Then run `npm run build --workspace apps/web`; expected exit 0.

- [ ] **Step 4: Commit this route family**

```bash
git add apps/web/src/pages/css/{home,home-user-wrap,sessions,fleet,recent,recently-added-page,lastplayed}.css apps/web/src/pages/components/home/UserWrapUpDashboard.jsx apps/web/src/pages/components/sessions/session-card.jsx apps/web/src/pages/debugTools apps/web/src/pages/{home,recently-added}.jsx
git commit -m "feat(theme): migrate home and session surfaces"
```

### Task 6: Libraries and users

**Files:**
- Modify: `apps/web/src/pages/css/libraryOverview.css`, `library-detail.css`
- Modify: `apps/web/src/pages/css/library/libraries.css`, `library/library-card.css`, `library/media-items.css`
- Modify: `apps/web/src/pages/css/items/item-details.css`, `items/item-stat-component.css`
- Modify: `apps/web/src/pages/css/users/users.css`, `users/user-details.css`, `users/user-activity.css`
- Modify: `apps/web/src/pages/components/LibrarySelector/SelectionCard.jsx`, `components/library/library-card.jsx`, `components/libraryStatCard/library-stat-component.jsx`
- Modify: `apps/web/src/pages/libraries.jsx`, `pages/components/library-info.jsx`, `pages/components/item-info.jsx`, `pages/users.jsx`, `pages/user-profile.jsx` (stable screen IDs)

- [ ] **Step 1: Run the exact library batch audit and confirm RED**

Run: `node scripts/check-theme-colors.cjs apps/web/src/pages/css/libraryOverview.css apps/web/src/pages/css/library-detail.css apps/web/src/pages/css/library apps/web/src/pages/css/items apps/web/src/pages/components/LibrarySelector/SelectionCard.jsx apps/web/src/pages/components/library/library-card.jsx apps/web/src/pages/components/libraryStatCard/library-stat-component.jsx`

Expected: FAIL.

- [ ] **Step 2: Migrate libraries/items, then re-run Step 1**

Normalize cards, filters, pagination, nested item surfaces, skeleton/empty/error states, and semantic focus. Preserve media artwork. Add `libraries`, `library-detail`, and `item-detail` screen IDs. Expected audit: PASS.

- [ ] **Step 3: Run the exact user batch audit and confirm RED**

Run: `node scripts/check-theme-colors.cjs apps/web/src/pages/css/users apps/web/src/pages/css/home-user-wrap.css apps/web/src/pages/users.jsx apps/web/src/pages/user-profile.jsx`

Expected: FAIL before migration.

- [ ] **Step 4: Migrate Users/profile and re-run Step 3**

Normalize cards, tables, user-image frames, charts, empty/error states, and focus. Add `users` and `user-profile` screen IDs. Expected audit: PASS.

- [ ] **Step 5: Build and commit**

Run: `npm run build --workspace apps/web`; expected exit 0.

```bash
git add apps/web/src/pages/css/libraryOverview.css apps/web/src/pages/css/library-detail.css apps/web/src/pages/css/library apps/web/src/pages/css/items apps/web/src/pages/css/users apps/web/src/pages/components/LibrarySelector apps/web/src/pages/components/library apps/web/src/pages/components/libraryStatCard apps/web/src/pages/{libraries,users,user-profile}.jsx apps/web/src/pages/components/{library-info,item-info}.jsx
git commit -m "feat(theme): migrate library and user routes"
```

### Task 7: Activity and Timeline

**Files:**
- Modify: `apps/web/src/pages/css/activity.css`, `activity/activity-table.css`, `activity/stream-info.css`, `timeline/activity-timeline.css`
- Modify: `apps/web/src/pages/components/activity/activity-table.jsx`
- Modify: `apps/web/src/pages/components/activity-timeline/activity-timeline-item.jsx`
- Modify: `apps/web/src/pages/activity.jsx`, `apps/web/src/pages/activity_time_line.jsx` (stable screen IDs)

- [ ] **Step 1: Run exact audit and confirm RED**

Run: `node scripts/check-theme-colors.cjs apps/web/src/pages/css/activity.css apps/web/src/pages/css/activity apps/web/src/pages/css/timeline apps/web/src/pages/components/activity/activity-table.jsx apps/web/src/pages/components/activity-timeline/activity-timeline-item.jsx`

Expected: FAIL.

- [ ] **Step 2: Migrate activity/table/timeline states**

Normalize table, cards, session status, progress, timeline rails, chips, loading/empty/error/partial states. Use text/icons with live/warning/unavailable. Add `activity` and `timeline` screen IDs.

- [ ] **Step 3: Re-run audit and live smoke**

Expected audit: PASS. Run: `BARRACKS_SMOKE_POLLS=1 BARRACKS_CHROMIUM=/opt/google/chrome/chrome BARRACKS_PLAYWRIGHT=/tmp/silo-barracks-ui.e9CWfq/node_modules/playwright BARRACKS_QA_DIR=$(mktemp -d /tmp/barracks-activity-theme.XXXXXX) node scripts/check-barracks-ui.cjs`; expected no browser errors or overflow.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/css/activity.css apps/web/src/pages/css/activity apps/web/src/pages/css/timeline apps/web/src/pages/components/activity apps/web/src/pages/components/activity-timeline apps/web/src/pages/{activity,activity_time_line}.jsx
git commit -m "feat(theme): migrate activity and timeline"
```

### Task 8: Split and migrate operational/integration route styling

**Files:**
- Modify: `apps/web/src/pages/css/integrations.css` (retain shared primitives only)
- Create: `apps/web/src/pages/css/calendar.css`, `requests.css`, `downloads.css`, `wizarr.css`
- Modify: `apps/web/src/pages/css/active-transcodes.css`, `automation-health.css`, `repair-hub.css`, `about.css`, `globalstats.css`, `genres.css`, `statCard.css`
- Modify: `apps/web/src/pages/calendar.jsx`, `requests.jsx`, `downloads.jsx`, `wizarr.jsx`, `integrations.jsx`, `active-transcodes.jsx`, `automation-health.jsx`, `repair-hub.jsx`, `server-management.jsx`, `about.jsx`
- Modify: `apps/web/src/pages/components/general/globalStats.jsx`
- Modify: `apps/web/theme-color-exceptions.json`

- [ ] **Step 1: Audit `integrations.css`, inline JSX, and operational CSS; confirm RED**

Run: `node scripts/check-theme-colors.cjs apps/web/src/pages/css/integrations.css apps/web/src/pages/css/active-transcodes.css apps/web/src/pages/css/automation-health.css apps/web/src/pages/css/repair-hub.css apps/web/src/pages/css/about.css apps/web/src/pages/css/globalstats.css apps/web/src/pages/css/genres.css apps/web/src/pages/css/statCard.css apps/web/src/pages/{integrations,active-transcodes}.jsx apps/web/src/pages/components/general/globalStats.jsx`

Expected: FAIL.

- [ ] **Step 2: Extract route-owned CSS without changing selectors**

Move Calendar, Requests, Downloads, and Wizarr rule blocks into their named stylesheets and update each page import. Leave only integration-hub/shared primitives in `integrations.css`. Run `npm run build --workspace apps/web`; expected exit 0. Commit the mechanical split separately.

```bash
git add apps/web/src/pages/css/{integrations,calendar,requests,downloads,wizarr}.css apps/web/src/pages/{calendar,requests,downloads,wizarr}.jsx
git commit -m "refactor(theme): split operational route styles"
```

- [ ] **Step 3: Migrate integration, Calendar, and Requests styles and checkpoint**

Run: `node scripts/check-theme-colors.cjs apps/web/src/pages/css/integrations.css apps/web/src/pages/css/calendar.css apps/web/src/pages/css/requests.css apps/web/src/pages/integrations.jsx apps/web/src/pages/calendar.jsx apps/web/src/pages/requests.jsx`. Migrate until it exits 0. Add screen IDs `integrations`, `calendar`, `requests`.

- [ ] **Step 4: Migrate Downloads, Wizarr, Active Transcodes, and Automation Health and checkpoint**

Run: `node scripts/check-theme-colors.cjs apps/web/src/pages/css/downloads.css apps/web/src/pages/css/wizarr.css apps/web/src/pages/css/active-transcodes.css apps/web/src/pages/css/automation-health.css apps/web/src/pages/downloads.jsx apps/web/src/pages/wizarr.jsx apps/web/src/pages/active-transcodes.jsx apps/web/src/pages/automation-health.jsx`. Migrate until it exits 0. Add matching screen IDs.

- [ ] **Step 5: Migrate Server Management, Repair, About, and stat primitives and checkpoint**

Run: `node scripts/check-theme-colors.cjs apps/web/src/pages/css/repair-hub.css apps/web/src/pages/css/about.css apps/web/src/pages/css/globalstats.css apps/web/src/pages/css/genres.css apps/web/src/pages/css/statCard.css apps/web/src/pages/server-management.jsx apps/web/src/pages/repair-hub.jsx apps/web/src/pages/about.jsx apps/web/src/pages/components/general/globalStats.jsx`. Migrate until it exits 0. Server Management styling remains owned by Task 10's Settings styles; here add only its `server-management` screen ID.

- [ ] **Step 6: Build and commit presentation migration**

Run: `npm run build --workspace apps/web`; expected exit 0.

```bash
git add apps/web/src/pages/css/{integrations,calendar,requests,downloads,wizarr,active-transcodes,automation-health,repair-hub,about,globalstats,genres,statCard}.css apps/web/src/pages/{integrations,calendar,requests,downloads,wizarr,active-transcodes,automation-health,repair-hub,server-management,about}.jsx apps/web/src/pages/components/general/globalStats.jsx apps/web/theme-color-exceptions.json
git commit -m "feat(theme): migrate operational routes"
```

### Task 9: Charts and Kiosk color-system removal

**Files:**
- Create: `apps/web/src/lib/theme-chart.js`, `apps/web/src/lib/theme-chart.test.js`, `apps/web/src/lib/home-settings.test.js`
- Modify: `apps/web/src/lib/home-settings.js`, `apps/web/src/lib/theme.test.js`
- Modify: `apps/web/src/pages/home.jsx`, `apps/web/src/pages/components/settings/KioskSettings.jsx`, `apps/web/src/pages/css/home.css`, `apps/web/src/pages/css/stats.css`
- Modify: `apps/web/src/pages/components/statistics/chart.jsx`, `play-method-chart.jsx`, and all JSX in that directory using chart colors
- Modify: `apps/web/src/pages/components/statCards/ItemStatComponent.jsx`, `most_used_client.jsx`, and all JSX in that directory using chart colors
- Modify: `apps/web/src/pages/statistics.jsx` (stable `statistics` screen ID)

- [ ] **Step 1: Write failing pure contracts**

In `theme-chart.test.js`, define `getChartTheme(tokens)` returning Recharts/MUI-ready `grid`, `tooltip`, and six `series` values, and `subscribeThemeTokens(eventTarget, callback)` listening only to `silo-barracks-theme-updated` and returning unsubscribe. In `home-settings.test.js`, assert normalization keeps stored `neon` and `HOME_THEME_OPTIONS` maps it to display label `Signal`.

- [ ] **Step 2: Run and confirm RED**

Run: `node --test apps/web/src/lib/theme-chart.test.js apps/web/src/lib/home-settings.test.js apps/web/src/lib/theme.test.js`

Expected: FAIL because the contracts/Signal label do not exist.

- [ ] **Step 3: Implement pure chart adapter and Signal compatibility**

Implement the exact Task 9 Step 1 exports and use the tested `getThemeTokens()` export from Task 2 as their source. Keep stored `neon`, relabel option “Signal,” and make all Kiosk modes semantic opacity/layout variants. Signal gradients reference only Barracks tokens.

- [ ] **Step 4: Migrate every chart consumer**

Read tokens from `getThemeTokens()` and subscribe through the tested adapter; remove inline legacy literals and aliases. Retain legends, labels, and markers.

- [ ] **Step 5: Run focused tests and the complete Task 9 audit**

Run: `node --test apps/web/src/lib/theme-chart.test.js apps/web/src/lib/home-settings.test.js apps/web/src/lib/theme.test.js && node scripts/check-theme-colors.cjs apps/web/src/lib/theme-chart.js apps/web/src/lib/home-settings.js apps/web/src/pages/home.jsx apps/web/src/pages/statistics.jsx apps/web/src/pages/components/settings/KioskSettings.jsx apps/web/src/pages/css/home.css apps/web/src/pages/css/stats.css apps/web/src/pages/components/statistics apps/web/src/pages/components/statCards && npm run lint --workspace apps/web && npm run build --workspace apps/web`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/{theme-chart.js,theme-chart.test.js,theme.js,theme.test.js,home-settings.js,home-settings.test.js} apps/web/src/pages/{home,statistics}.jsx apps/web/src/pages/components/settings/KioskSettings.jsx apps/web/src/pages/components/statistics apps/web/src/pages/components/statCards apps/web/src/pages/css/{home,stats}.css
git commit -m "feat(theme): unify charts and kiosk modes"
```

### Task 10: Split and migrate Settings and setup styling

**Files:**
- Modify: `apps/web/src/pages/css/settings/settings.css` (shared layout/primitives)
- Create: `apps/web/src/pages/css/settings/security.css`, `operations.css`, `connections.css`
- Modify: `apps/web/src/pages/css/settings/apiKeys.css`, `backups.css`, `version.css`, `apps/web/src/pages/css/setup.css`
- Modify: `apps/web/src/pages/settings.jsx`, `apps/web/src/pages/components/settings/ServerManagement.jsx`, `TerminalComponent.jsx`, `backupfiles.jsx`, and other Settings JSX only when the audit reports inline colors
- Create: `scripts/check-universal-theme-ui.cjs` (initial Settings-only matrix, expanded in Task 11)

- [ ] **Step 1: Write the Settings browser matrix, run static/browser baselines, and confirm RED**

Create the browser script with base `/settings` plus the 19 exact Settings subsection routes from the spec, `data-theme-screen="settings"` readiness plus active-tab assertion, desktop/mobile overflow checks, pageerror capture, and computed surface/control legacy-color rejection.

Run: `BARRACKS_THEME_ROUTES=settings BARRACKS_CHROMIUM=/opt/google/chrome/chrome BARRACKS_PLAYWRIGHT=/tmp/silo-barracks-ui.e9CWfq/node_modules/playwright BARRACKS_QA_DIR=$(mktemp -d /tmp/barracks-settings-theme-red.XXXXXX) node scripts/check-universal-theme-ui.cjs`

Expected: FAIL on the current presentation. Then run the static command below and expect FAIL:

Run: `node scripts/check-theme-colors.cjs apps/web/src/pages/css/settings apps/web/src/pages/css/setup.css apps/web/src/pages/components/settings`

Expected: FAIL; directory recursion is part of Task 3's tested CLI contract.

- [ ] **Step 2: Extract subsection CSS and build**

Move Security rules to `security.css`, task/backup/import/health/repair/log rules to `operations.css`, and integrations/server/API-key/webhook/notification/newsletter rules to `connections.css`. Import them once from `settings.jsx`; keep general/Kiosk/library/activity/device/plugin navigation and shared controls in `settings.css`.

Run: `npm run build --workspace apps/web`

Expected: exit 0. Commit this mechanical split separately.

- [ ] **Step 3: Migrate Core/Media Settings and checkpoint**

Run: `node scripts/check-theme-colors.cjs apps/web/src/pages/css/settings/settings.css apps/web/src/pages/css/settings/security.css apps/web/src/pages/settings.jsx apps/web/src/pages/components/settings/settingsConfig.jsx apps/web/src/pages/components/settings/security.jsx apps/web/src/pages/components/settings/KioskSettings.jsx apps/web/src/pages/library_selector.jsx apps/web/src/pages/components/settings/ActivityMonitorSettings.jsx apps/web/src/pages/components/settings/JellyfinAdminSettings.jsx`. Migrate General/Security/Kiosk/Libraries/Activity Monitor/Devices/Plugins until it exits 0.

- [ ] **Step 4: Migrate Connections and checkpoint**

Run: `node scripts/check-theme-colors.cjs apps/web/src/pages/css/settings/connections.css apps/web/src/pages/css/settings/apiKeys.css apps/web/src/pages/integrations.jsx apps/web/src/pages/components/settings/SiloServers.jsx apps/web/src/pages/components/settings/apiKeys.jsx apps/web/src/pages/components/settings/webhooks.jsx apps/web/src/pages/components/settings/NotificationSettings.jsx apps/web/src/pages/components/settings/NewsletterSettings.jsx`. Migrate Integrations/Silo Servers/API Keys/Webhooks/Notifications/Newsletter until it exits 0.

- [ ] **Step 5: Migrate Operations and setup checkpoint**

Run: `node scripts/check-theme-colors.cjs apps/web/src/pages/css/settings/operations.css apps/web/src/pages/css/settings/backups.css apps/web/src/pages/css/settings/version.css apps/web/src/pages/css/setup.css apps/web/src/pages/components/settings/Tasks.jsx apps/web/src/pages/components/settings/Task.jsx apps/web/src/pages/components/settings/backup_page.jsx apps/web/src/pages/components/settings/backupfiles.jsx apps/web/src/pages/components/settings/JellystatImport.jsx apps/web/src/pages/components/settings/TautulliImport.jsx apps/web/src/pages/components/settings/health.jsx apps/web/src/pages/components/settings/logs.jsx apps/web/src/pages/components/settings/ServerManagement.jsx apps/web/src/pages/components/settings/TerminalComponent.jsx apps/web/src/pages/repair-hub.jsx`. Migrate Tasks/Backup/Imports/Health/Repair/Logs/Server Management/auth setup until it exits 0. Add `settings` screen ID with active-tab value.

- [ ] **Step 6: Run Settings browser checkpoint, lint, build, and commit**

Run: `BARRACKS_THEME_ROUTES=settings BARRACKS_CHROMIUM=/opt/google/chrome/chrome BARRACKS_PLAYWRIGHT=/tmp/silo-barracks-ui.e9CWfq/node_modules/playwright BARRACKS_QA_DIR=$(mktemp -d /tmp/barracks-settings-theme.XXXXXX) node scripts/check-universal-theme-ui.cjs`; expected base Settings plus all 19 subsection entries PASS. Run: `npm run lint --workspace apps/web && npm run build --workspace apps/web`; expected both exit 0.

```bash
git add apps/web/src/pages/css/settings apps/web/src/pages/css/setup.css apps/web/src/pages/settings.jsx apps/web/src/pages/components/settings apps/web/theme-color-exceptions.json scripts/check-universal-theme-ui.cjs
git commit -m "feat(theme): unify settings and form surfaces"
```

## Chunk 3: Exhaustive route verification and deployment

### Task 11: Authenticated browser route/state matrix

**Files:**
- Modify: `scripts/check-universal-theme-ui.cjs`
- Modify: `scripts/check-barracks-ui.cjs` only if reusable login helpers are extracted without weakening existing assertions

- [ ] **Step 1: Write the route matrix and failing baseline assertions**

Expand the existing Settings matrix into this exact route/readiness matrix:

```js
const routes = [
  ['/', 'home'], ['/kiosk', 'kiosk'], ['/home/kiosk', 'kiosk'], ['/recently-added', 'recently-added'],
  ['/libraries', 'libraries'], ['/libraries/fixture-library', 'library-detail'],
  ['/libraries/item/fixture-item', 'item-detail'], ['/users', 'users'], ['/users/fixture-user', 'user-profile'],
  ['/activity', 'activity'], ['/timeline', 'timeline'], ['/calendar', 'calendar'], ['/requests', 'requests'],
  ['/downloads', 'downloads'], ['/active-transcodes', 'active-transcodes'], ['/wizarr', 'wizarr'],
  ['/automation-health', 'automation-health'], ['/statistics', 'statistics'],
  ['/server-management', 'server-management'], ['/settings', 'settings'], ['/integrations', 'integrations'], ['/about', 'about'],
];
const settings = ['general', 'security', 'kiosk', 'libraries', 'activity-monitor', 'devices', 'plugins',
  'integrations', 'servers', 'api-key', 'webhooks', 'notifications', 'newsletter', 'tasks', 'backup',
  'imports', 'health', 'repair', 'logs'];
const integrationSettings = [
  ['/settings/integrations/media-server', 'media-server'],
  ['/settings/integrations/automation', 'automation'],
  ['/settings/integrations/seerr', 'seerr'],
  ['/settings/integrations/downloads', 'downloads'],
  ['/settings/integrations/invites', 'invites'],
];
```

Iterate `routes`, `/settings/${settingsSlug}` for every settings entry, and every explicit `integrationSettings` tuple. Each waits for `[data-theme-screen="<id>"]`; Settings additionally asserts its visible active-tab or integration-tab label and exact path. Fixtures use IDs exactly as shown. `/api/getLibrary` returns `{Name:'Fixture Library',CollectionType:'movies',archived:false}`; `/api/getItemDetails` returns one minimal Movie named `Fixture Item`; `/stats/getUserProfileWrapUp` and `/api/getUserDetails` return user `{UserId:'fixture-user',UserName:'Fixture User'}` plus rank/details; relevant access/media-list calls return empty authorized structures. For each route require the readiness marker, no browser errors, no computed legacy purple/teal canvas/surface/control color, and no horizontal overflow at 1440px and 390px.

- [ ] **Step 2: Run against the current deployed bundle and confirm RED**

Run: `mkdir -p /tmp/silo-barracks-theme-qa && BARRACKS_CHROMIUM=/opt/google/chrome/chrome BARRACKS_PLAYWRIGHT=/tmp/silo-barracks-ui.e9CWfq/node_modules/playwright BARRACKS_QA_DIR=/tmp/silo-barracks-theme-qa node scripts/check-universal-theme-ui.cjs`

Expected: FAIL until the new bundle is deployed and all route fixtures/assertions are supported.

- [ ] **Step 3: Complete route fixtures and screenshot matrix**

Use the existing short-lived local test-token method; never print/store tokens. Install a context-wide route before navigation. Every same-origin `POST`, `PUT`, `PATCH`, and `DELETE` is fulfilled by the fixture dispatcher or rejected with status 418, recorded in `blockedMutations`, and never continued to the live origin. Side-effect GET paths `/api/startTask`, `/api/stopTask`, `/api/restartTask`, `/backup/beginBackup`, `/sync/beginSync`, and any path containing `/delete`, `/remove`, or `/restore` are always rejected and recorded in `forbiddenActions`. Any unmatched same-origin data GET under `/api`, `/stats`, `/proxy`, `/fleet`, `/backup`, `/sync`, `/webhooks`, `/newsletter`, `/jellystat`, `/tautulli`, or `/logs` is rejected and recorded in `unhandledReads`; static assets and document navigation may continue.

The fixture dispatcher explicitly handles these reads: `/api/getconfig`, `/api/getLibrary`, `/api/getItemDetails`, `/api/getLibraries`, `/api/getHistory`, `/api/getActivityTimeLine` (POST), `/api/getLibraryHistory`, `/api/getItemHistory`, `/api/getUserDetails`, `/api/getUserHistory`, `/api/getSeasons`, `/api/getEpisodes`, `/api/getRecentlyAdded`, `/api/getRecentlyAddedShelves`, `/api/userAccess`, `/api/UntrackedUsers`, `/api/users/fixture-user/media-lists`, `/api/home/operations`, `/api/tdarr/transcodes`, `/api/wizarr/summary`, `/api/integrations`, `/api/integrations/health-history`, `/api/integrations/calendar`, `/api/integrations/downloads`, `/api/requests`, `/api/requests/summary`, `/api/requests/options`, `/api/automation-health`, `/api/TrackedLibraries`, `/api/library-display-settings`, `/api/getActivityMonitorSettings`, `/api/jellyfin/plugins`, `/api/jellyfin/devices`, `/api/getBackupTables`, `/api/getTaskSettings`, `/api/keys`, `/api/health`, `/api/admin-audit`, `/api/server-management/status`, `/api/CheckForUpdates`, `/api/CheckForUpdates/releases`, `/api/github/contributors`, `/backup/files`, `/webhooks`, `/webhooks/delivery-history`, `/webhooks/event-status`, `/newsletter/settings`, `/newsletter/preview`, `/jellystat/unmatched-users`, `/tautulli/unmatched`, `/tautulli/unmatched-users`, `/tautulli/search-media`, `/logs/getLogs`, `/proxy/getSessions`, `/proxy/sessionStatus`, `/fleet`, `/fleet/servers`, `/stats/getHomeDashboard`, `/stats/getPlaybackActivity`, `/stats/getUserProfileWrapUp`, `/stats/getUserWrapUp`, `/stats/getUserLastPlayed`, `/stats/getGenreUserStats`, `/stats/getGenreLibraryStats`, `/stats/getLibraryMetadata`, `/stats/getLibraryCardStats`, `/stats/getLibraryOverview`, `/stats/getGlobalLibraryStats`, `/stats/getLibraryLastPlayed`, `/stats/getGlobalItemStats`, `/stats/getGlobalUserStats`, `/stats/getLibraryItemsWithStats`, `/stats/getLibraryItemsPlayMethodStats`, `/stats/getAllUserActivity`, `/stats/getViewsOverTime`, `/stats/getViewsByDays`, `/stats/getViewsByHour`, and `/stats/repair-hub`. Query strings are normalized before matching; dynamic image proxy requests are fulfilled with a transparent fixture image. The script's RED run is used to identify any newly observed same-origin data endpoint, which must receive an explicit schema-valid handler before the PASS run—never a permissive fallback.

The six Statistics overview requests are also exact fixtures: two `POST /stats/getMostViewedByType` calls return `[{Id:'fixture-item',Name:'Fixture Movie',Plays:2}]`; `POST /stats/getMostViewedLibraries` returns `[{Id:'fixture-library',Name:'Fixture Library',Plays:2}]`; `POST /stats/getMostActiveUsers` returns `[{UserId:'fixture-user',Name:'Fixture User',Plays:2}]`; `POST /stats/getMostUsedClient` returns `[{Client:'Silo Web',Plays:2}]`; and `POST /stats/getPlaybackMethodStats` returns `[{Name:'DirectPlay',Count:2}]`. `GET /stats/getViewsOverTime` returns `{stats:[{Key:'2026-09-05','Fixture Library':{count:2,duration:45}},{Key:'2026-09-06','Fixture Library':{count:3,duration:60}}],libraries:[{Id:'fixture-library',Name:'Fixture Library'}]}`. The remaining fixtures use minimal schema-valid empty or singleton payloads for their owning component.

`POST /stats/getLibraryItemsWithStats` is the deliberate multi-page exception: for request query `page=1`, return `{page:1,pages:2,results:[50 fixture Movie items with unique Id/Name values ending at 'Fixture Movie 50']}`; for `page=2`, return `{page:2,pages:2,results:[{Id:'fixture-item-51',Name:'Fixture Movie 51',Type:'Movie',archived:false}]}`. The Libraries state test scrolls to the document bottom, waits for the second request, and asserts the DOM contains `Fixture Movie 51`; this proves the real infinite-scroll/load-more path rather than merely rendering pagination chrome.

`/proxy/getSessions` returns a singleton session with `Id:'fixture-session'`, `UserId:'fixture-user'`, `UserName:'Fixture User'`, `Client:'Silo Web'`, `ApplicationVersion:'1.0'`, `DeviceName:'Fixture Browser'`, `MediaServerProvider:'silo'`, `NowPlayingItem:{Id:'fixture-item',Name:'Fixture Movie',Type:'Movie',RunTimeTicks:36000000000,SiloPosterUrl:''}`, and `PlayState:{IsPaused:false,PositionTicks:10000000,PlayMethod:'DirectPlay'}`. By default `/fleet` wraps that same session in a connected primary-server snapshot with one active/playing stream, zero paused streams, `partial:false`, and fixed ISO timestamps. The warning-state case first sets a test-local `fleetFixtureMode='partial'`; in that mode `/fleet` returns `partial:true` with the connected primary plus a second `state:'stale'` server whose `lastSuccessAt` is an older fixed ISO timestamp and whose `error` is `Fixture server unavailable`. After the partial-warning and stale-source assertions, reset the mode to `connected`. This guarantees both the Home session-dialog and unavailable-source assertions have rendered data without timing races.

Any unmatched mutation, forbidden GET, or unhandled data read fails the test. Final assertions require `continuedMutations=[]`, `blockedMutations=[]`, `forbiddenActions=[]`, and `unhandledReads=[]`. Capture every default route, then Ocean and Mono top-level routes. Capture default/custom/malformed samples for Home, Activity, Settings, open dialog, table, and chart.

The required state matrix is explicit:

- form/control: `/settings/general`, inspect text/select/color controls and change a custom color without submitting backend settings;
- menu/tooltip: open the account/theme menu by `data-testid`, hover the Activity navigation item, and require visible tooltip/menu semantic surfaces;
- table/pagination: fixture Activity rows and enough Libraries items for page 2, require table and pagination controls;
- loading: delay `/api/getLibrary` and require the loading indicator before resolving;
- empty: return empty Requests results and require its empty message;
- error: return 503 for Automation Health and require its labelled error state;
- warning/unavailable: return a partial fleet snapshot and require the partial warning plus stale source label;
- dialog: click `[aria-label^="Open session details"]` and require `.modal-content`;
- chart: return the two Statistics series above, click the `Count` tab from the default Overview view, then require `.recharts-wrapper`, legend/labels, and `.recharts-area-curve` series nodes.

- [ ] **Step 4: Test live switching and persistence**

On Home, use the visible viewport-specific control (`theme-account-desktop` at 1440px or `theme-account-mobile` at 390px), followed by `theme-menu` and `theme-preset-ocean`, to prove the normal actionable UI path and assert `--barracks-action` changes from `#6f9bcf` to Ocean primary. Then open the session dialog. While that portalled dialog remains open, invoke `.click()` through `locator.evaluate(node => node.click())` on the existing account control, wait for `theme-menu`, invoke it the same way, wait for `theme-preset-mono`, and invoke that control; programmatic DOM clicks deliberately bypass the modal backdrop while still exercising the production navbar handlers, `saveTheme`, and theme event. Assert the still-open `.modal-content` computed background changes to the new `--barracks-surface-raised`, then close the dialog. On Statistics, click the `Count` tab and record the first `.recharts-area-curve` stroke/fill, then reopen the visible viewport-specific account control and `theme-menu` before selecting `theme-preset-ocean`; assert the chart color equals the new `--barracks-chart-1` and differs from the prior value. Reload, reopen the visible viewport-specific account control and `theme-menu`, then assert `theme-color-primary` has the persisted value. Inject `{primary:'bad',secondary:'#112233',background:null,surface:'#223344'}` under `silo_barracks_theme`; assert primary/background default per field, valid siblings remain, and no page error.

- [ ] **Step 5: Deploy locally and run the matrix**

Run: `docker compose up --build -d --wait`

Expected: build exits 0 and both services become healthy.

Run the Step 2 browser command again.

Expected: PASS with screenshots and zero browser errors/overflow/color violations.

- [ ] **Step 6: Commit browser verification**

```bash
git add scripts/check-universal-theme-ui.cjs scripts/check-barracks-ui.cjs
git commit -m "test(theme): verify every Barracks route"
```

### Task 12: Final regression, visual review, and handoff

**Files:**
- Create: `scripts/run-universal-theme-verification.sh`
- Modify: `docs/superpowers/plans/2026-09-06-universal-theme-system.md` to check completed steps and record evidence

- [ ] **Step 1: Create one fail-safe verification runner**

Create `scripts/run-universal-theme-verification.sh` so the database lifecycle and every command share one shell. Use this exact structure, retaining `set -euo pipefail` and the cleanup trap:

```bash
#!/usr/bin/env bash
set -euo pipefail

theme_db_name="silo-barracks-theme-test-db-$$"
cleanup() {
  if docker inspect "$theme_db_name" >/dev/null 2>&1; then
    docker stop "$theme_db_name" >/dev/null
  fi
}
trap cleanup EXIT

docker run --rm -d --name "$theme_db_name" -e POSTGRES_USER=barracks_test -e POSTGRES_PASSWORD=barracks_test_only -e POSTGRES_DB=barracks_test -p 127.0.0.1::5432 postgres:16-alpine
for attempt in $(seq 1 30); do
  if docker exec "$theme_db_name" pg_isready -U barracks_test -d barracks_test; then break; fi
  test "$attempt" -lt 30
  sleep 1
done
theme_db_port=$(docker port "$theme_db_name" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')
test -n "$theme_db_port"
test "$(docker inspect -f '{{.Config.Image}} {{range .Mounts}}{{.Name}}{{end}}' "$theme_db_name")" = 'postgres:16-alpine '

SILO_TEST_DATABASE_URL="postgres://barracks_test:barracks_test_only@127.0.0.1:${theme_db_port}/barracks_test" npm test
npm run theme:check
npm run lint --workspace apps/web
npm run build --workspace apps/web
git diff --check

mkdir -p /tmp/silo-barracks-theme-qa
BARRACKS_SMOKE_POLLS=4 BARRACKS_CHROMIUM=/opt/google/chrome/chrome BARRACKS_PLAYWRIGHT=/tmp/silo-barracks-ui.e9CWfq/node_modules/playwright BARRACKS_QA_DIR=/tmp/silo-barracks-theme-qa node scripts/check-barracks-ui.cjs
BARRACKS_CHROMIUM=/opt/google/chrome/chrome BARRACKS_PLAYWRIGHT=/tmp/silo-barracks-ui.e9CWfq/node_modules/playwright BARRACKS_QA_DIR=/tmp/silo-barracks-theme-qa node scripts/check-fleet-ui.cjs
BARRACKS_CHROMIUM=/opt/google/chrome/chrome BARRACKS_PLAYWRIGHT=/tmp/silo-barracks-ui.e9CWfq/node_modules/playwright BARRACKS_QA_DIR=/tmp/silo-barracks-theme-qa node scripts/check-universal-theme-ui.cjs

docker compose ps
```

The exact image/no-mount assertion runs before any tests. The EXIT trap owns only the unique PID-suffixed disposable container, fires on success or any earlier failure, and keeps the database alive for the entire verification sequence. Make the script executable.

- [ ] **Step 2: Run the complete automated gate**

Run: `bash scripts/run-universal-theme-verification.sh`

Expected: all tests pass with zero skipped database tests; audit, lint, build, three browser suites, and diff check exit 0; Barracks and its production PostgreSQL service remain healthy; the disposable database stops and auto-removes when the script exits.

- [ ] **Step 3: Inspect representative screenshots manually**

Inspect screenshots in `/tmp/silo-barracks-theme-qa`: default screenshots for every route and the Ocean/Mono/custom samples. Check visual hierarchy, no old purple/teal decorative surfaces, readable charts/tables/forms/modals, and consistent section accents. Record any discrepancy as a failing browser/static test before fixing it.

- [ ] **Step 4: Confirm the disposable database is gone and live services remain healthy**

Run: `docker compose ps`

Expected: Barracks and its production PostgreSQL service are healthy.

Run: `test -z "$(docker ps -aq --filter 'name=^silo-barracks-theme-test-db-')"`

Expected: no PID-suffixed disposable theme database remains and the application remains healthy. If validation fails, inspect the exact matching container rather than stopping any unrelated service.

- [ ] **Step 5: Record verification evidence and commit**

Check completed plan boxes and append exact test counts, audit/build/lint results, browser route counts, screenshots inspected, and service health.

```bash
git add scripts/run-universal-theme-verification.sh docs/superpowers/plans/2026-09-06-universal-theme-system.md
git commit -m "docs: record universal theme verification"
```

---

## Execution notes

- Work in an isolated worktree only if it can be created without separating this feature from the currently uncommitted Barracks/fleet changes it must theme. Otherwise preserve the current dirty workspace and commit only files owned by each task.
- Do not rewrite or discard unrelated user changes.
- Do not add literals to the exception file merely to make the scanner green; migrate application presentation colors to tokens.
- One worker owns `theme.js`, `theme.test.js`, and `variables.css` through Tasks 1–2 and Task 9 to prevent contract conflicts.
- Page batches are sequential after Task 3 because shared CSS specificity and scanner output overlap.
- Use `@superpowers:test-driven-development` for every task and `@superpowers:verification-before-completion` before any completion claim.
