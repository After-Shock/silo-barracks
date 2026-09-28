# JellyGlance Sidebar, Density, Font and Corners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Barracks' global look (typeface, corner radius, density model and sidebar) match current JellyGlance (`upstream/main`) while keeping every `--barracks-*` colour token and all Barracks themes.

**Architecture:** Port upstream's CSS in three layers: (1) remove the two Barracks identity overrides (font, corner radius), (2) port upstream commit `d717ebc`, which replaced the global `zoom: 0.8` with a 13px root + per-page `0.82` scale and re-tuned ~20 stylesheets, (3) port the later sidebar polish (`7eb1937`, `dcfc4a1` navbar hunks) plus the small markup it needs. Conflicts are resolved with one rule: **upstream's layout/size/spacing values, Barracks' colour values.**

**Tech Stack:** React 18 + Vite, react-bootstrap, CSS; Playwright (headless Chrome) for visual verification.

**Spec:** User decisions of 2026-09-28: font → Poppins; corners → rounded like JellyGlance; scope → sidebar restyle **including** the full density swap. Hub tabs, Activity header compaction and fleet-overview compaction are explicitly out of scope.

## Analysis

- Upstream and Barracks were compared side by side against the **same backend** (upstream frontend on :5174 via a worktree of `upstream/main`, Barracks on :3000). Measured differences:
  - Typeface: upstream renders Poppins everywhere (`setup.css` global `*` rule, Google Fonts import). Barracks has the same rule but `apps/web/src/pages/css/barracks.css:2-4` overrides it with Segoe UI.
  - Corners: `barracks.css:10-12` forces 4px radius on cards/panels/session cards; upstream uses ~12–14px.
  - Density: upstream root 13px, no zoom, sidebar 179px, content pages scaled 0.82 except full-bleed pages. Barracks: 16px root under `body { zoom: 0.8 }` with `125vw/125vh` compensations, sidebar 250px (200px rendered).
  - Sidebar: upstream's active item is a rounded pill with a border/glow; items live in a `.navbar-links-scroll` wrapper with the collapse toggle directly under them; the footer holds only account + version.
- Upstream's zoom removal was **one commit, `d717ebc`**, touching 20 stylesheets. Applied with `git apply --3way` onto Barracks main it yields **131 conflict hunks**, top files: navbar.css 26, library-card.css 20, libraries.css 18, home.css 17, users.css 8. Sampled conflicts are all of one kind: Barracks tokenised a colour on a line upstream resized.
- Earlier attempt (previous plan, Task 1) proved that removing the zoom **without** these re-tunes makes the sidebar/nav overflow, so Tasks 2 and 3 must land together before any visual sign-off.

## Global Constraints

- No literal colours in CSS: `npm run theme:check` must pass (all Barracks themes read `--barracks-*` tokens).
- Visible copy says Silo/Barracks: `npm run branding:check` must pass. Keep the "Silo Barracks" text wordmark, **not** upstream's JellyGlance image wordmark.
- Keep Barracks-only nav behaviour: `OverlayTrigger` tooltips (`barracks-nav-tooltip`), `data-testid="theme-account-desktop"`, Silo fleet stream badge.
- Do not import upstream nav features outside scope (profile-modal theme groups, workspace mode, PWA install button, My Glance, Jellyfin-down chip).
- Gate per task: `npm test && npm run lint && npm run build && npm run theme:check && npm run branding:check`.

## Conflict Resolution Rule (applies to every hunk in Tasks 2–3)

For each `<<<<<<< ours / ======= / >>>>>>> theirs` hunk:
1. Start from **theirs** (upstream).
2. For every property whose value in theirs is a literal colour (`#…`, `rgb(a)(…)`, named colour) replace it with the **value ours used for the same property in the same rule**. If ours has no counterpart, map with this table: white/near-white text → `var(--barracks-text-raised)`; `#cbd5e1`/`#e5edf8`-ish body text → `var(--barracks-text)`; `#94a3b8`/`#9cabbe`-ish muted → `var(--barracks-text-muted)`; translucent white borders → `var(--barracks-border-raised)`; translucent white fills → `var(--barracks-surface-interactive)`; near-black panels → `var(--barracks-surface-inset)`; purple accent → `var(--barracks-action)` or `rgba(var(--barracks-action-rgb), a)`; red → `var(--barracks-state-danger)`; black shadows → `color-mix(in srgb, var(--barracks-canvas) N%, transparent)`.
3. Keep any selector/rule that exists only in ours (Barracks additions) unless it re-introduces `zoom` or `125vw/125vh`.
4. Remove the markers. Run `npm run theme:check` after each file.

## Review Focus

1. Modals/popovers after zoom removal: Bootstrap modal backdrop, MUI menus (Activity column menu) and react-bootstrap tooltips must cover/position correctly with no `125vw` leftovers. (Task 2 check)
2. Pages excluded from the 0.82 scale (Home, Libraries, Settings, Users, About, Downloads, Integrations, Transcodes, Statistics) must not render ~25% larger than today. Compare against upstream at :5174. (Task 2 check)
3. Collapsed sidebar (78px) and mobile menu at 390px: no clipped text, toggle reachable. (Task 3 check)
4. All four Barracks theme presets (default, ocean, mono, custom) still pass the universal theme harness. (Task 4)
5. Setup/login pages (pre-auth, no sidebar) render correctly with Poppins and without zoom. (Task 4)

---

### Task 0: Comparison environment (setup, no commit)

- [ ] **Step 1:** `git fetch upstream` then `git worktree add --detach <scratch>/upstream-wt upstream/main`; `ln -s $PWD/node_modules <scratch>/upstream-wt/node_modules`; `ln -s $PWD/apps/web/node_modules <scratch>/upstream-wt/apps/web/node_modules`.
- [ ] **Step 2:** Start upstream UI: `cd <scratch>/upstream-wt/apps/web && npx vite --port 5174 --strictPort` (proxies to :3000). Start Barracks UI: `npm run dev -w @jellyglance/web -- --port 5173 --strictPort`.
- [ ] **Step 3:** Screenshot helper: Playwright from any local install (e.g. `/home/plex/twocaptainscharters/node_modules/playwright`), Chrome at `/usr/bin/google-chrome`, token minted with `docker compose exec -T silo-barracks node -e "process.stdout.write(require('jsonwebtoken').sign({user:{id:1,authMode:'local'}},process.env.JWT_SECRET,{expiresIn:'10m'}))"`; set `localStorage` keys `token`, `silo_barracks_app_version`/`silo_barracks_whats_new_seen_version` and `jellyglance_app_version`/`jellyglance_whats_new_seen_version` to `1.2.3-beta.3` to suppress What's New.
- [ ] **Step 4:** Capture the harness baseline **before any change** (`.qa-universal-theme/` is gitignored, so there is no committed baseline): `BARRACKS_PLAYWRIGHT=<playwright path> BARRACKS_CHROMIUM=/usr/bin/google-chrome BARRACKS_QA_DIR=<scratch>/qa-before scripts/run-universal-theme-verification.sh`.
- [ ] **Step 5:** Capture **baseline** Barracks screenshots at 1440×900 and 390×844 for `/`, `/activity`, `/libraries`, `/users`, `/statistics`, `/settings/general`, `/timeline`, `/about`, and upstream at 1440×900 for the same paths. Keep them for every later comparison.

---

### Task 1: Poppins and rounded corners

**Files:**
- Modify: `apps/web/src/pages/css/barracks.css:2-4` (font), `:10-12` (radius)

- [ ] **Step 1:** Delete the `html body, html body * { font-family: 'Segoe UI', … }` rule. Keep the monospace rule for `code, pre, .session-details-title, .setup-brand-kicker` (upstream also renders session detail titles monospace).
- [ ] **Step 2:** Delete the `border-radius: 4px` rule for `.home-glass-card, .setup-card, .form-box, .activity-sessions-panel, .session-card`. Then `grep -n 'border-radius' apps/web/src/pages/css/barracks.css` and remove any other radius overrides that square elements upstream rounds (compare the element in the upstream screenshot); ledger each removal.
- [ ] **Step 3:** Verify: probe `getComputedStyle(document.querySelector('h1')).fontFamily` on :5173 → starts with `Poppins`. Screenshot `/` and `/activity`: cards rounded, Poppins visible, no text overflow in nav, table headers or session cards (Poppins is wider than Segoe UI — check `.session-card` detail rows and nav labels for clipping).
- [ ] **Step 4:** Gate. **Commit** `feat(theme): adopt JellyGlance typeface and corner radius`

---

### Task 2: Density swap (port `d717ebc` stylesheets)

**Files:** every CSS file listed by `git diff --stat d717ebc~1 d717ebc -- 'apps/web/src/*.css' 'apps/web/src/pages/css/**'` except `my-glance.css` (not in Barracks); plus `apps/web/src/pages/components/general/navbar.jsx` (sidebar width effect). Also remove the remaining zoom compensations upstream did not have: `apps/web/src/pages/css/navbar.css` (`125vh` sidebar heights, `.modal-backdrop` `125vw/125vh`), `apps/web/src/pages/css/setup.css` (`125vh/125vw`), `apps/web/src/App.css` (`125vh`, `calc(125vw - …)`).

- [ ] **Step 1: Apply.** `git diff d717ebc~1 d717ebc -- 'apps/web/src/*.css' 'apps/web/src/pages/css/**' ':!apps/web/src/pages/css/my-glance.css' > <scratch>/d717.patch && git apply --3way <scratch>/d717.patch`.
- [ ] **Step 2: Resolve** all conflict hunks with the Conflict Resolution Rule, one file at a time, running `npm run theme:check` after each. Start with `index.css`, `App.css`, `variables.css` (they define the model), then `navbar.css`, then the page stylesheets.
- [ ] **Step 3: Leftovers.** `grep -rnE '125v[wh]|zoom:' apps/web/src --include=*.css` → must return nothing. Replace each with upstream's equivalent (`100dvh`, `100%`, or delete as upstream did). In `variables.css`, `--jg-sidebar-width` must be upstream's `clamp(12.75rem, 14vw, 13.75rem)`; remove the `:root { --jg-sidebar-width: 250px }` blocks in `App.css` and `navbar.css`.
- [ ] **Step 4: Sidebar width effect.** In `navbar.jsx` replace `document.documentElement.style.setProperty("--jg-sidebar-width", isNavCollapsed ? "78px" : "250px");` with `if (isNavCollapsed) document.documentElement.style.setProperty("--jg-sidebar-width", "78px"); else document.documentElement.style.removeProperty("--jg-sidebar-width");`
- [ ] **Step 5: Page-scale exclusions.** Confirm `App.css` has upstream's desktop rule scaling `.app-shell-main > *` by `var(--jg-content-scale, 0.82)` and that its exclusion list contains every Barracks full-bleed page class, including Barracks-only ones: `.fleet-libraries-page` (`fleet-libraries.jsx`) and `.fleet-history-detail` (`fleet-history-detail.jsx`, `silo-account-detail.jsx`) — decide per page by comparing to the nearest upstream equivalent; ledger the decision.
- [ ] **Step 6: Verify (Review Focus 1 & 2).** Gate. Screenshot the Task 0 path set on :5173 and put each beside its upstream capture. Acceptance per page: nav item text height within ±1px of upstream (measure `getComputedStyle(a.navitem).fontSize` and rendered height), page title size within ±2px, no horizontal page scroll (`document.documentElement.scrollWidth <= innerWidth`), no clipped nav labels. Open the session popout, the Activity column menu, and a Bootstrap modal: backdrop covers the viewport, menus anchor to their trigger.
- [ ] **Step 7: Commit** `feat(theme): replace zoom density model with JellyGlance scale`

---

### Task 3: Sidebar polish (post-`d717ebc` navbar.css + markup)

**Files:**
- Modify: `apps/web/src/pages/css/navbar.css`
- Modify: `apps/web/src/pages/components/general/navbar.jsx` (desktop sidebar block, ~lines 799–905)

- [ ] **Step 1: CSS.** `git diff d717ebc upstream/main -- apps/web/src/pages/css/navbar.css > <scratch>/nav-polish.patch && git apply --3way <scratch>/nav-polish.patch`; resolve with the Conflict Resolution Rule. Drop hunks that only style out-of-scope markup: `.profile-theme-*`, `.profile-mode-*`, `.profile-quick-links`, `.install-app-*`, `.navbar-jellyfin-down`, `.navbar-wordmark` (ledger the dropped selectors).
- [ ] **Step 2: Markup.** In the desktop `<Nav>`: wrap the `visibleNavData.map(...)` output in `<div className="navbar-links-scroll">…</div>`; move the `navbar-collapse-toggle` button out of `.navbar-footer-account-row` to the end of `.navbar-links-scroll` with `size={16}` icons (upstream). Keep `OverlayTrigger` tooltips, `data-testid="theme-account-desktop"`, and the `silo-wordmark` text brand.
- [ ] **Step 3: Brand.** Style `.silo-wordmark` to occupy upstream's `.navbar-wordmark` box (same height/weight/letter-spacing as the upstream wordmark image, colour `var(--barracks-text-raised)`), so the brand row height matches upstream.
- [ ] **Step 4: Verify (Review Focus 3).** Gate. Screenshots at 1440 (expanded + collapsed via the toggle) and 390 (open the mobile menu). Acceptance: active item is a rounded pill with border/glow in the theme accent; sidebar width 179±4px at 1440; collapsed labels hidden with tooltips working on hover; mobile menu items not clipped; stream badge on Home still shows.
- [ ] **Step 5: Commit** `feat(nav): port JellyGlance sidebar polish`

---

### Task 4: Regression sweep with the universal theme harness

**Files:** none expected; fixes go in the stylesheet at fault.

- [ ] **Step 1:** Run `BARRACKS_PLAYWRIGHT=<playwright path> BARRACKS_CHROMIUM=/usr/bin/google-chrome BARRACKS_QA_DIR=<scratch>/qa-after scripts/run-universal-theme-verification.sh`. Expected: exit 0 (it runs tests, theme check, lint and full-page screenshots for every route × default/ocean/mono/custom × desktop/mobile).
- [ ] **Step 2:** Compare `<scratch>/qa-after` against `<scratch>/qa-before` from Task 0 (same file names). Review every route at least at `default-*-desktop` and `default-*-mobile`, plus `ocean`/`mono` home and activity. Flag: overflow, clipped text, invisible text (theme contrast), broken modals, setup/login layout (Review Focus 4 & 5).
- [ ] **Step 3:** Fix each flagged issue in the owning stylesheet (upstream values, Barracks colours). Re-run Step 1 until clean.
- [ ] **Step 4:** **Commit** any fixes as `fix(theme): <what>`; no screenshot baseline is committed (the QA directory is gitignored).

---

## Out of scope (recorded)

- Hub tabs (`PageTabs`, Users/Server/Statistics hubs) — mostly invisible for Silo; Insights tabs need JellyGlance-only `/insights-data/*` SQL.
- Activity header compaction and fleet-overview compaction — declined for this plan.
- Upstream profile modal redesign, PWA install, My Glance, Jellyfin-down chip.
