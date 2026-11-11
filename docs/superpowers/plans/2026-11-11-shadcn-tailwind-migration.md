# Silo Barracks web: migrate to Tailwind v4 + shadcn/ui

Status: PLAN (no code changes yet) · Drafted 2026-11-11 · Scope: `apps/web` only (API, docs site untouched)

## 1. Where we are (measured 2026-11-11)

| Area | Today | Notes |
|---|---|---|
| Language | Plain JSX, Vite 7, React 19 | shadcn supports JS (`"tsx": false` in components.json) — no TS conversion needed |
| Primary UI kit | **react-bootstrap** in ~60 files + `bootstrap.min.css` | Heaviest use: `Button` (~100), `Form.*` (~100), `Modal` (16), `Col/Row` (~80), `Spinner` (29), `Tooltip` (27), `Alert` (20), `Tabs/Tab` (23), `Badge`, `InputGroup`, `Card` |
| Bootstrap utility classes | ~185 `className` hits (`d-flex`, `row`, `col-*`, `mb-*`, `btn`) | Mechanical; Tailwind equivalents |
| MUI | Light: ~13 files | Tables (`@mui/material/Table*`), one `x-data-grid` (`globalStats.jsx`), `x-date-pickers` + `material-react-table` + `createTheme` all in `activity-table.jsx` (808 lines) |
| Charts | recharts in 3 files | `statistics/chart.jsx`, `statistics/play-method-chart.jsx`, `statCards/genre-stat-card.jsx` — shadcn `chart` is a recharts wrapper, so these port, not rewrite |
| Icons | `remixicon-react` in 63 files | → `lucide-react` (shadcn default); can run side by side |
| CSS | **~20k lines** in `pages/css/*.css` (41 files) + `framework-theme.css` (Bootstrap overrides) | The real cost of the migration. Biggest: requests 2.6k, home 2k, navbar 1.9k, sessions 1.4k, setup 1.4k, home-user-wrap 1.3k |
| Theme | `lib/theme.js` `applyTheme()` writes ~50 `--barracks-*` semantic vars + legacy `--primary-color` etc. on `:root` from 4 inputs; 27 presets; contrast enforcement | **Keep this engine.** It is the single source of color truth |
| Guards | `npm run theme:check` (no raw colors outside tokens), `branding:check`, `i18n:check`, node tests | Must stay green each phase; extend theme:check to cover Tailwind arbitrary values |
| Routes | 29 top-level routes | See `src/routes.jsx` |

## 2. Target

- Tailwind v4 (`@tailwindcss/vite`, CSS-first config, no `tailwind.config.js`).
- shadcn/ui components copied into `src/components/ui/*.jsx` (JS), built on Radix.
- `lucide-react` icons, `sonner` toasts (replaces react-toastify), TanStack Table via shadcn `data-table` (replaces MUI X DataGrid + material-react-table), shadcn `calendar`/`date-picker` (react-day-picker, replaces x-date-pickers), shadcn `chart` around existing recharts.
- End state removes: `bootstrap`, `react-bootstrap`, `@mui/*`, `@emotion/*`, `material-react-table`, `remixicon-react`, `react-toastify`, `framework-theme.css`. Expected large bundle drop (vendor-mui, vendor-mui-x, bootstrap CSS).

## 3. Key design decision: theme bridge

shadcn reads `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--ring`, `--chart-1..5`, etc. Do **not** add a second theme. Map shadcn tokens onto the existing runtime vars in one CSS file so all 27 presets and the custom-theme editor keep working with zero JS changes:

```css
/* src/styles/shadcn-bridge.css */
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: var(--barracks-canvas);
  --foreground: var(--barracks-text);
  --card: var(--barracks-surface-raised);
  --card-foreground: var(--barracks-text-raised);
  --popover: var(--barracks-overlay);
  --popover-foreground: var(--barracks-text-overlay);
  --primary: var(--barracks-action);
  --primary-foreground: var(--barracks-action-text);
  --secondary: var(--barracks-surface-interactive);
  --secondary-foreground: var(--barracks-text-interactive);
  --muted: var(--barracks-surface-inset);
  --muted-foreground: var(--barracks-text-muted);
  --accent: var(--barracks-surface-interactive);
  --accent-foreground: var(--barracks-text-interactive);
  --destructive: var(--barracks-state-danger);
  --border: var(--barracks-border-subtle);
  --input: var(--barracks-border-inset);
  --ring: var(--barracks-focus);
  --chart-1: var(--barracks-chart-1);  /* …through chart-6 */
  --sidebar: var(--barracks-nav);
  --sidebar-foreground: var(--barracks-text-nav);
  --sidebar-border: var(--barracks-border-nav);
  --radius: 0.625rem;
}
@theme inline {
  --color-background: var(--background);
  /* …standard shadcn @theme inline block, plus: */
  --color-live: var(--barracks-state-live);
  --color-success: var(--barracks-state-success);
  --color-warning: var(--barracks-state-warning);
}
```

`theme.js` already sets `color-scheme`; also toggle `.dark` on `<html>` there so `dark:` variants work for light presets. `--barracks-*` names stay as the public contract; `theme:check` stays the enforcement point (allow `bg-primary` etc., forbid `bg-[#…]`).

## 4. Phases

Each phase is a separate PR, shippable on its own, deployed to barracks.sullyflix.com test (racknerd-small) before merging. App must look correct at every step (mixed old/new is acceptable mid-migration, broken is not).

### Phase 0 — Foundation (1 PR, small)
- Add `tailwindcss`, `@tailwindcss/vite`, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `tw-animate-css`.
- `components.json` (`style: new-york`, `tsx: false`, `aliases.ui: @/components/ui`), `@/` alias in vite + jsconfig.
- `shadcn-bridge.css` (above). **Disable Tailwind preflight** while Bootstrap is loaded (import `tailwindcss/theme` + `tailwindcss/utilities` only) to avoid double resets; re-enable in Phase 6.
- Add `cn()` in `src/lib/utils.js`. Extend `theme:check` for arbitrary color values.
- Verify: build, all checks, visual diff = none.
- **Done 2026-11-11 (branch `feat/shadcn-foundation`). Learnings:**
  - Utilities use the **`tw:` prefix** (`components.json` `"prefix": "tw"`). Unprefixed, Tailwind emitted ~70 utilities colliding with Bootstrap classes already in the markup (`w-100`, `mb-3`, `collapse`, `text-secondary`, `col-2`, `shadow`…) with different values. With the prefix the built CSS adds zero new selectors that match legacy markup. Phase 6 removes the prefix by codemod.
  - Utilities are imported **unlayered** (Bootstrap is unlayered; layered utilities would always lose).
  - Add components with **`npm run ui:add -- <names>`**, not raw `npx shadcn add`: the CLI writes `import { cn } from "cn"` and installs the unrelated `cn` package in this workspace; the wrapper repairs both.
  - `theme:check` now flags `tw:` palette/arbitrary color classes (`tw:text-white`, `tw:bg-[#…]`). Stock shadcn markup trips it (e.g. destructive button `text-white` → `tw:text-destructive-foreground`); fix to tokens when adding components.
  - `npm test` has 1 pre-existing failure on `main` (`apps/api/tests/silo-v2-contract.test.js`), unrelated.

### Phase 1 — Primitives + app shell
- `shadcn add button input label select checkbox switch textarea badge card dialog alert-dialog dropdown-menu tooltip tabs separator skeleton sonner sidebar sheet scroll-area`.
- Rebuild `navbar.jsx` (1060 lines + 1.9k CSS) on shadcn **Sidebar** (collapsible, mobile `Sheet`), preserving `nav-order.js` customization and hub tabs. Shared `PageHeader`.
- Swap react-toastify → sonner (thin `toast` adapter so call sites change mechanically).
- Delete `navbar.css` when done. Every page now sits in the new shell.
- **Phase 1a done 2026-11-11 (branch `feat/shadcn-sidebar`, stacked on Phase 0):**
  - Navbar logic moved into `useNavbarState()` (same file, separate commit, pixel-identical).
  - react-bootstrap removed from the navbar: `OverlayTrigger/Tooltip` → shadcn `Tooltip`, account `Modal` → `Dialog`, `Button` → `Button`, `Navbar/Nav` → plain `<nav>`/`<Link>` with the same classes. Nav renders pixel-identical in desktop, collapsed, Synth, mobile, and mobile menu shots; tooltip and dialog match closely.
  - **Not using shadcn `Sidebar` (decision).** Its layout model (provider wrapper, fixed panel + gap div, 768px `useIsMobile`, cookie state) conflicts with the existing tuned shell (fixed rail + `--jg-sidebar-width` padding, 900px *and* coarse-pointer mobile query, pre-paint `jg-nav-collapsed`). Keeping "current look" means keeping that layout; revisit only if the look is allowed to change.
  - shadcn defaults restyled globally to Barracks: tooltip = inset surface, dialog = raised surface / 28px radius / `--barracks-scrim` backdrop (was Bootstrap's 50% black, slightly darker now).
  - **z-index:** shadcn uses `z-50`; the app uses Bootstrap layers (navbar 1030, mobile topbar 1049). Dialog overlay/content now `1050/1055`, tooltip `1080`. Every future overlay component (popover, dropdown, sheet, select) must be bumped the same way when added.
  - New `tw:compact:` variant = the app's mobile query (`max-width:900px` or coarse pointer). Use it instead of `sm:`/`md:` for anything that must agree with the nav's mobile switch.
  - `cn()` now uses `extendTailwindMerge({ prefix: "tw" })`; without it conflicting `tw:` overrides were not merged.
  - Visual harness: `apps/web/dev-harness/` (git-excluded) mounts the real Navbar with seeded localStorage; Playwright shots + behaviour checks. Headless Chrome CLI clamps to ≥500px width, so use Playwright for phone sizes.
  - Still to do in Phase 1: react-toastify → sonner (separate PR).

### Phase 2 — Dashboards & charts (highest visual payoff)
- Follow the **dataviz skill** for all charts/tiles: one stat-tile/KPI component, consistent axes/tooltips/legend, palette validated against every preset's `--barracks-chart-*` (add a test using `contrastRatio`).
- Port the 3 recharts files to shadcn `ChartContainer`/`ChartTooltip`.
- Pages: `home.jsx` (1.4k), `HomeStatisticCards`, `statCards/*`, `libraryStatCard/*`, `statistics.jsx`, `UserWrapUpDashboard`, `fleet-libraries`, `server-hub`. 21st.dev only for inspiration/one-off blocks; copy into repo, never runtime dependency.

### Phase 3 — Tables
- shadcn `table` + `data-table` (TanStack) generic component: sorting, column visibility, pagination, row expansion (replaces `Collapse` rows).
- Migrate `activity-table.jsx` (MUI createTheme + material-react-table + date pickers → data-table + `calendar`/`popover` date range), `globalStats.jsx` (x-data-grid), `users.jsx`, `libraries`, all `@mui/material/Table*` users.
- Remove `@mui/*`, `@emotion/*`, `material-react-table` from package.json.

### Phase 4 — Forms & settings
- shadcn `form` patterns (keep existing state handling; react-hook-form only where it simplifies), `field`, `input-group`, `radio-group`, `slider`, `command`/`combobox` for pickers.
- Pages: `settings.jsx` + `components/settings/*` (webhooks 714, settingsConfig 481), `integrations.jsx` (1k), `setup.jsx` + setup CSS, `login`, `signup`, `first-run-extras`, theme editor (`appearance.js` UI).

### Phase 5 — Remaining pages
- `requests.jsx` (1.3k + 2.6k CSS), `sessions/session-card.jsx` (814), `calendar`, `downloads`, `active-transcodes`, `automation-health`, `wizarr`, `repair-hub`, `server-management`, `about`, `recently-added`, item/user/library detail pages, kiosk.
- Icons: codemod `remixicon-react` → `lucide-react` (mapping table in `src/lib/icon-map.js`), then remove remixicon.

### Phase 6 — Removal & cleanup
- Remove `bootstrap`, `react-bootstrap`, `framework-theme.css`, `width_breakpoint_css.css`, `radius_breakpoint_css.css`; enable Tailwind preflight.
- Delete per-page CSS that is now dead (target: < 2k lines of custom CSS left, mostly artwork/blurhash/kiosk).
- Simplify `vite.config.js` manualChunks. Record before/after bundle size in CHANGELOG.

## 5. Per-page migration recipe
1. Replace layout utilities (`Row/Col`, `d-flex`, spacing) with Tailwind.
2. Swap components 1:1 (table below). 3. Move page CSS rules into utilities; delete the CSS file or shrink it. 4. `npm run lint && npm test && npm run theme:check && npm run i18n:check`. 5. Check 3 presets (default, a light one e.g. Mono-inverted/custom light, Synth) at mobile + desktop widths.

| react-bootstrap / MUI | shadcn |
|---|---|
| `Button` | `Button` (variants: default/secondary/outline/ghost/destructive) |
| `Form.Control`, `FormControl`, `InputGroup` | `Input`, `InputGroup` |
| `Form.Select`, `FormSelect` | `Select` (or native `NativeSelect` for long lists) |
| `Form.Check` | `Checkbox` / `Switch` |
| `Modal` | `Dialog` (confirmations → `AlertDialog`) |
| `Tabs/Tab` | `Tabs` |
| `Tooltip` / `OverlayTrigger` / MUI `Tooltip` | `Tooltip` |
| `Alert` | `Alert` |
| `Spinner` | `Spinner` / `Skeleton` for loading layouts |
| `Badge` | `Badge` |
| `Card` | `Card` |
| `Dropdown`, MUI `Menu` | `DropdownMenu` |
| MUI `Table*`, `Collapse` | `Table` + `Collapsible` |
| `x-data-grid`, `material-react-table` | `DataTable` (TanStack) |
| `x-date-pickers` | `Calendar` + `Popover` |
| react-toastify | `sonner` |

## 6. Risks
- **CSS cascade fights** while Bootstrap + Tailwind coexist → preflight off until Phase 6; Bootstrap's `.row/.col` names don't collide with Tailwind utilities, but `.btn`, `.card`, `.badge`, `.alert` global rules in `framework-theme.css` can leak into shadcn markup — scope those overrides as they're retired.
- **Light presets / custom themes**: shadcn assumes paired light/dark; bridge guarantees one source, but every new component must be checked on a light custom theme.
- **i18n**: string keys unchanged; watch for longer DE/PL strings in tighter shadcn layouts.
- **Upstream JellyGlance merges** get harder per migrated file (see `docs/upstream-jellyglance.md`). Decide before Phase 1 whether upstream cherry-picks are still expected.
- **Bundle during transition** is temporarily larger (both kits).

## 7. Sizing (rough)
P0 small · P1 large (navbar) · P2 large · P3 medium-large (activity-table) · P4 large · P5 large · P6 medium. Phases 2–5 can be parallelized page-by-page once P1 lands.

## 8. Decisions (owner, 2026-11-11)
1. **Upstream JellyGlance sync continues — logic only.** We cherry-pick upstream data/behavior changes (API calls, state, hooks, business rules) and ignore upstream UI/CSS changes. Consequences for every migration PR:
   - Keep page file names, exports, and the data-fetching/state code paths recognizable so upstream logic diffs still apply. Change the JSX/markup, not the logic, in the same commit.
   - Where a page mixes heavy logic with markup, first (separate commit) extract the logic into a `use<Page>()` hook in the same file or a sibling `*.logic.js`, *then* reskin. Upstream logic patches are applied to the hook.
   - Don't rename i18n keys, routes, socket events, or API helpers.
   - Dropping react-toastify/remixicon is fine; upstream `toast.*` calls map via the sonner adapter, icons are presentation.
2. **Keep the current look.** Warm barracks surfaces, current density, spacing, radius, and typography (`--jg-*` scale). shadcn components are restyled to match the existing look, not the shadcn default. Before/after screenshots per PR should look the same apart from consistency fixes.
3. **Side nav.** Phase 1 rebuilds the navbar on shadcn `Sidebar` (collapsible to icons, `Sheet` on mobile).
