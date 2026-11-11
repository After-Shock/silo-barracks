# Page migration guide (react-bootstrap / MUI → shadcn/ui)

Companion to `2026-11-11-shadcn-tailwind-migration.md`. Read that first (Phase 0–1 learnings).

## Goal per file

Remove every `react-bootstrap` and `@mui/*` import from the file. Afterwards the page must
**look the same** (apart from the consistency fixes listed below) and **behave the same**.

## Hard rules

1. **Upstream logic stays applicable.** Do not change data fetching, state, effects, handlers,
   API calls, i18n keys, routes, socket events, or exported names. Change markup only.
   If a component mixes heavy logic and markup, first move the logic into a
   `use<Thing>()` hook in the same file in its own commit, then reskin.
2. **Only use the shared primitives in `src/components/ui/`** (already restyled to the Barracks
   Bootstrap look and z-index layers). Do not edit `components/ui/*`, `styles/shadcn-bridge.css`,
   `package.json`, `package-lock.json`, `vite.config.js`, or `framework-theme.css`. Do not run
   `npm install` or `npm run ui:add`. If a primitive is missing or wrong, say so in your report.
3. **Tailwind classes are `tw:`-prefixed** (`tw:flex tw:gap-2`). Colors only via token
   utilities (`tw:bg-card`, `tw:text-muted-foreground`, `tw:border-border-strong`, `tw:bg-success` …,
   full list in `styles/shadcn-bridge.css` `@theme inline`). `npm run theme:check` must pass.
   Use `tw:compact:` (not `sm:`/`md:`) for anything that must switch with the app's mobile layout.
4. **Keep existing class names** on the new elements so page CSS keeps applying. Bootstrap
   *utility/layout* classes in `className` strings (`d-flex`, `row`, `col-md-6`, `mb-3`,
   `text-center`) may stay for now; Phase 6 converts those. Only the React components go.
5. **Page CSS that targeted Bootstrap component internals** (`.modal-content`, `.modal-header`,
   `.btn`, `.form-control`, `.form-select`, `.nav-link`, `.card-body`, `.alert`, `.badge`,
   `.Mui*`) must be ported: retarget to your own class names or `[data-slot=…]`, or replace
   with `tw:` classes on the element. Delete rules that no longer match anything. Don't leave
   `!important` fights with the primitives; fix at the source.
6. **No icon changes** (remixicon stays; icons are converted centrally later).
7. **Do not commit/push outside your branch.** Commit in logical steps on your worktree branch
   with messages ending in the attribution line from the task brief.

## Component mapping

| Before | After (`@/components/ui/...`) | Notes |
|---|---|---|
| `Button variant="primary"` (default) | `Button` | `variant="primary"` → default |
| `Button variant="secondary" / "outline-secondary" / "light" / "dark"` | `Button variant="secondary"` | |
| `Button variant="outline-primary"` | `Button variant="outline"` | pressed/active → `aria-pressed` or `data-state="on"` |
| `Button variant="danger" / "outline-danger"` | `Button variant="destructive"` | Barracks danger = outlined + red underline |
| `Button variant="link"` | `Button variant="link"` | |
| `Button size="sm" / "lg"` | `size="sm" / "lg"` | |
| `Button as={Link} to=…` | `<Button asChild><Link to=…>…</Link></Button>` | |
| `Form` | `<form>` | keep `onSubmit` |
| `Form.Group` | `<div className="…">` | |
| `Form.Label` | `Label` (with `htmlFor`) | |
| `Form.Control` | `Input` | `as="textarea"` → `Textarea` |
| `Form.Select` / `FormSelect` | `NativeSelect` + `NativeSelectOption` | keep native `<select>` semantics/onChange |
| `Form.Check type="checkbox"` | `Checkbox` + `Label` | `onChange(e)` → `onCheckedChange(checked)`; adapt handler call sites minimally (wrap: `onCheckedChange={(c) => handler({ target: { checked: c, name } })}`) |
| `Form.Check type="switch"` | `Switch` + `Label` | same handler note |
| `Form.Check type="radio"` | `RadioGroup` + `RadioGroupItem` | |
| `Form.Text` | `<p className="tw:text-sm tw:text-muted-raised">` | |
| `InputGroup` | `<div className="tw:flex …">` + children | |
| `Modal` | `Dialog` + `DialogContent/Header/Title/Description/Footer` | `show`→`open`, `onHide`→`onOpenChange={(o)=>!o&&onHide()}`; confirmations → `AlertDialog`. Always include a `DialogTitle` (sr-only OK). |
| `Tabs` / `Tab` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | `activeKey/onSelect` → `value/onValueChange` |
| `Tooltip` / `OverlayTrigger` / MUI `Tooltip` | `Tooltip`, `TooltipTrigger asChild`, `TooltipContent` | a `TooltipProvider` is needed above (wrap the page root if none) |
| `Alert variant="danger"/"success"/other` | `Alert variant="destructive"/"success"/"default"` + `AlertDescription` | |
| `Spinner` | `Spinner` (`tw:size-4` for `size="sm"`) | |
| `Badge` | `Badge` (`variant="secondary"` for `bg="secondary"`) | |
| `Card`, `Card.Body`, `Card.Title`, `Card.Text` | `Card`, `CardContent`, `CardTitle`, `<p>` | |
| `Dropdown`, `DropdownButton`, MUI `Menu` | `DropdownMenu` + `Trigger/Content/Item/Separator` | |
| `Row`/`Col`/`Container` | `<div className="row">`/`<div className="col-md-6">` etc. | keep Bootstrap grid classes for now (Phase 6) |
| `ButtonGroup`, `ToggleButton(Group)` | `ToggleGroup` / `ToggleGroupItem`, or `Button`s in a `tw:flex` | |
| `Collapse` (MUI/RB) | `Collapsible` | |
| `ProgressBar` | `Progress` | |
| MUI `Table*` | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` | |
| MUI `Box`, `Typography` | `<div>` / `<span>`/`<p>` | |
| MUI `IconButton` | `Button variant="ghost" size="icon"` | |
| MUI x-date-pickers | `Popover` + `Calendar` | |
| MUI DataGrid / material-react-table | `Table` + TanStack (`@tanstack/react-table` is already installed via material-react-table; import it directly) | sorting/pagination parity |
| Recharts charts | `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend` around recharts | follow the dataviz rules below |

## Consistency fixes that are allowed (and expected)

- Bootstrap-default blue/gray colors that never followed the theme now use theme tokens
  (checkbox/switch/badge/progress fill = primary, etc.).
- Buttons that looked disabled but weren't (dimmed `a.btn` links) now look like buttons.
- Dialog backdrops use `--barracks-scrim`.

## Charts (dataviz rules)

One y-axis; categorical colors in fixed order from `--chart-1..6` (never cycled by index
modulo when there are more series; fold extras into "Other"); 2px lines; area fill ~10%
opacity (not gradients to 72%); hairline solid grid; tooltip lists every series, value first,
series name secondary, line-key swatch; text never in series color; legend for ≥2 series,
none for one.

## Verification (required before reporting done)

Shared infrastructure (already running — do not restart or modify):
- API: `http://127.0.0.1:3000` (demo DB, **live production Silo servers**).
- Baseline screenshots of `main`: `/home/plex/barracks-demo/shots/main/<route>.png` and `<route>-m.png` (390px mobile).
- Tour script: `node /home/plex/barracks-demo/tour.mjs <port> <outdir> [route,route] [--mobile]`
  (routes are listed at the top of that file). It logs in with a demo token.

Your own dev server (pick your assigned port; separate dep cache is mandatory):
```bash
cd <your-worktree>
ln -s /home/plex/silo-barracks/node_modules node_modules
ln -s /home/plex/silo-barracks/apps/web/node_modules apps/web/node_modules
cd apps/web && VITE_CACHE_DIR=/tmp/vite-cache-<name> npx vite --host 127.0.0.1 --port <port>
```
Run it in the background. Then:
1. Tour your routes at desktop and `--mobile`, compare against the baseline PNGs (look at them;
   build side-by-side crops with Python/PIL if useful). Also check one light theme
   (e.g. set preset `Mono`/custom light via the account dialog is NOT needed — instead compare
   on default theme only unless your page has theme-specific styling).
2. For dialogs/tabs/menus/forms that only appear after interaction, write a small Playwright
   script (see `tour.mjs` for the pattern, `createRequire("/tmp/pw-tools/")("playwright-core")`)
   to open them and screenshot before/after (baseline server: `http://127.0.0.1:3002` = main).
3. **SAFETY: never trigger remote or destructive actions.** Do not click Save/Submit/Delete/
   Confirm/Sync/Scan/Run/Stop/Restart/Send/Import/Backup/Restore/Test buttons, and never confirm
   a dialog. Opening a dialog and closing it with Escape/Cancel is fine. The API talks to real
   production media servers.
4. `npm run lint`, `npm run theme:check`, `npm test` (1 known failure: `silo-v2-contract`),
   `npm run i18n:check`, `npm run branding:check` (never write the word "JellyGlance" in code/comments),
   and `npm run build` must pass.

## Report

Return: branch name and HEAD SHA, files migrated, any file you could not finish and why,
visible differences you could not eliminate (with screenshot paths), primitives that were
missing or wrong, and check results.
