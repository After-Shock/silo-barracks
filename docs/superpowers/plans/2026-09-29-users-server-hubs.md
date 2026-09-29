# Users and Server Hubs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt JellyGlance's hub navigation for Users and Server: `/users` becomes a tabbed hub (Users, Invites) and `/server-management` a tabbed hub (Server Jobs, Automation Health), replacing the separate Invites and Automation Health nav items, with old URLs redirecting into the tabs.

**Architecture:** Port upstream's small `PageTabs` component (tabs in `?tab=`, tab bar hidden when only one tab is visible). Tab visibility is decided by a pure, unit-tested helper (`hub-tabs.js`) from the role, Silo mode and the existing cached integration-availability flags. Two tiny hub pages lazy-load the existing pages. Navbar visibility rules and routes are updated; no page content changes.

**Tech Stack:** React 18, react-router `useSearchParams`/`Navigate`, `node:test`, Playwright for verification.

**Spec (user decision, 2026-09-29):** Users + Server hubs only. **Not** included: Calendar nav gating, Statistics hub shell, upstream Maintainerr tab, My Glance.

## Analysis

- Upstream (`git show upstream/main:apps/web/src/pages/{users-hub,server-hub}.jsx`, `…/components/general/PageTabs.jsx`, `…/css/page-tabs.css`): hubs are ~20-line wrappers; `PageTabs` renders a pill tab bar from `?tab=` and hides it when one tab is visible; `/wizarr` → `/users?tab=invites`, `/automation-health` → `/server-management?tab=automation`; nav shows `server-management` (label "Server") when jobs **or** automation is available.
- Barracks today (`navbar.jsx:236-246`): separate nav items `wizarr` (when `silo_barracks_wizarr_nav_available`) and `automation-health` (when `silo_barracks_automation_health_nav_available`); `server-management` ("Jellyfin Jobs") only when admin **and not Silo** (Jellyfin jobs don't exist on Silo; `api.js:52` blocks `/server-management/*` in Silo mode).
- For the attached Silo install (no Wizarr, no Arr apps) the change is invisible: Users hub shows only Users (no tab bar), and Server stays hidden. It becomes visible when those integrations are configured.
- Inbound links that must keep working: `home.jsx:1271,1284,1297`, `integrations.jsx:804,969` (`/wizarr`, `/automation-health`) → handled by redirects.
- Barracks nav extras must be preserved: saved nav order (`nav-order.js`) and hidden-link settings key off `navData` links, so removing two items from `navData` drops them from Settings → Navbar order automatically; stale saved entries are ignored by `applyNavOrder`.

## Global Constraints

- Only `--barracks-*` colour tokens (`npm run theme:check`); Silo/Barracks copy (`npm run branding:check`) — tab label "Server Jobs" (not "Jellyfin Jobs") and nav label "Server".
- Never show the Server Jobs tab in Silo mode.
- Gate per task: `npm test && npm run lint && npm run build && npm run theme:check && npm run branding:check && git diff --check`.

## Review Focus

1. `/server-management` with **no** visible tabs (Silo, no Arr apps) must not render a blank page — show a short empty state linking to Settings → Integrations. (Task 1 test + Task 3 check)
2. Unknown or not-visible `?tab=` (e.g. `?tab=invites` with Wizarr unconfigured) falls back to the first visible tab. (Task 2 check)
3. Old bookmarks `/wizarr` and `/automation-health` land on the right tab with browser Back not looping (`replace`). (Task 3 check)
4. Nav "Server" item highlights as active on `/server-management?tab=automation`; "Users" active on `/users?tab=invites`. (Task 3 check)
5. Settings → Navbar order no longer lists Invites / Automation Health, and a previously saved order still loads. (Task 3 check)

---

### Task 1: `hub-tabs.js` — pure tab visibility

**Files:**
- Create: `apps/web/src/lib/hub-tabs.js`
- Test: `apps/web/src/lib/hub-tabs.test.js`

**Interfaces — Produces:**
- `usersHubTabIds({ wizarr }) -> string[]` — `['users']` plus `'invites'` when `wizarr`.
- `serverHubTabIds({ isAdmin, isSilo, automation }) -> string[]` — `'jobs'` when `isAdmin && !isSilo`, `'automation'` when `automation`.
- `showServerNav(flags) -> boolean` — `serverHubTabIds(flags).length > 0`.
- `pickTab(visibleIds, requested) -> string | null` — `requested` if visible, else first visible, else `null`.

- [ ] **Step 1: Failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { usersHubTabIds, serverHubTabIds, showServerNav, pickTab } from './hub-tabs.js';

test('users hub always has Users; Invites only with Wizarr', () => {
  assert.deepEqual(usersHubTabIds({ wizarr: false }), ['users']);
  assert.deepEqual(usersHubTabIds({ wizarr: true }), ['users', 'invites']);
});

test('server jobs never appear on Silo; automation follows its flag', () => {
  assert.deepEqual(serverHubTabIds({ isAdmin: true, isSilo: true, automation: false }), []);
  assert.deepEqual(serverHubTabIds({ isAdmin: true, isSilo: true, automation: true }), ['automation']);
  assert.deepEqual(serverHubTabIds({ isAdmin: true, isSilo: false, automation: true }), ['jobs', 'automation']);
  assert.deepEqual(serverHubTabIds({ isAdmin: false, isSilo: false, automation: false }), []);
  assert.equal(showServerNav({ isAdmin: true, isSilo: true, automation: false }), false);
  assert.equal(showServerNav({ isAdmin: false, isSilo: true, automation: true }), true);
});

test('requested tab falls back to the first visible tab', () => {
  assert.equal(pickTab(['users', 'invites'], 'invites'), 'invites');
  assert.equal(pickTab(['users'], 'invites'), 'users');
  assert.equal(pickTab(['users'], null), 'users');
  assert.equal(pickTab([], 'automation'), null);
});
```

- [ ] **Step 2:** `node --test apps/web/src/lib/hub-tabs.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement**

```js
// Which hub tabs a viewer can see; shared by the navbar and the hub pages.
export const usersHubTabIds = ({ wizarr }) => (wizarr ? ['users', 'invites'] : ['users']);

export function serverHubTabIds({ isAdmin, isSilo, automation }) {
  const ids = [];
  if (isAdmin && !isSilo) ids.push('jobs'); // Jellyfin scheduled jobs; Silo has no equivalent
  if (automation) ids.push('automation');
  return ids;
}

export const showServerNav = (flags) => serverHubTabIds(flags).length > 0;

export const pickTab = (visibleIds, requested) =>
  (visibleIds.includes(requested) ? requested : visibleIds[0] ?? null);
```

- [ ] **Step 4:** PASS; `npm test` PASS. **Commit** `feat(nav): add hub tab visibility helpers`

---

### Task 2: `PageTabs` + hub pages

**Files:**
- Create: `apps/web/src/pages/components/general/PageTabs.jsx`
- Create: `apps/web/src/pages/components/general/css/page-tabs.css`
- Create: `apps/web/src/pages/users-hub.jsx`
- Create: `apps/web/src/pages/server-hub.jsx`

**Interfaces — Consumes:** Task 1. **Produces:** `PageTabs({ title, tabs: [{ id, label, icon, render }], empty })` — `tabs` already filtered to visible ones; renders `empty` when `tabs` is empty.

- [ ] **Step 1: `PageTabs.jsx`** (upstream shape, visibility moved to callers):

```jsx
/* eslint-disable react/prop-types */
import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { pickTab } from "../../../lib/hub-tabs";
import "./css/page-tabs.css";

export default function PageTabs({ title, tabs, empty = null }) {
  const [params, setParams] = useSearchParams();
  const activeId = pickTab(tabs.map((tab) => tab.id), params.get("tab"));
  const active = tabs.find((tab) => tab.id === activeId);
  if (!active) return empty;
  return (
    <div className="page-tabs-hub">
      {tabs.length > 1 ? (
        <nav className="page-tabs" role="tablist" aria-label={title}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.id === active.id;
            return (
              <button key={tab.id} type="button" role="tab" aria-selected={selected} className={selected ? "is-active" : ""}
                onClick={() => setParams({ tab: tab.id })}>
                {Icon ? <Icon size={16} /> : null}
                {tab.label}
              </button>
            );
          })}
        </nav>
      ) : null}
      <Suspense fallback={null}>
        <div key={active.id}>{active.render()}</div>
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 2: `page-tabs.css`** — upstream rules (`git show upstream/main:apps/web/src/pages/components/general/css/page-tabs.css`) with tokens: container border `rgba(var(--barracks-action-rgb), 0.18)`, background `var(--barracks-surface-inset)`; buttons `var(--barracks-text-muted)`, hover `var(--barracks-text)` on `var(--barracks-surface-interactive)`; active `var(--barracks-action-text)` on `var(--barracks-action)`. Keep the `@media (max-width: 640px)` horizontal-scroll rule.
- [ ] **Step 3: Hub pages.** Read flags once per render:

```js
function readFlags() {
  let config = {};
  try { config = JSON.parse(localStorage.getItem("config") || "{}"); } catch { /* use defaults */ }
  const role = config?.settings?.auth?.role || "Viewer";
  const flag = (key) => { try { return localStorage.getItem(key) === "true"; } catch { return false; } };
  return {
    isAdmin: role === "Owner" || role === "Admin",
    isSilo: config?.IS_SILO === true,
    wizarr: flag("silo_barracks_wizarr_nav_available"),
    automation: flag("silo_barracks_automation_health_nav_available"),
  };
}
```

  Put `readFlags` in `hub-tabs.js` (exported; not unit-tested — it only reads storage). `users-hub.jsx`: tabs `users` ("Users", `UserLineIcon`, lazy `./users`) and `invites` ("Invites", `UserAddLineIcon`, lazy `./wizarr`), filtered by `usersHubTabIds(readFlags())`. `server-hub.jsx`: tabs `jobs` ("Server Jobs", `ServerLineIcon`, lazy `./server-management`) and `automation` ("Automation Health", `RadarLineIcon`, lazy `./automation-health`), filtered by `serverHubTabIds(readFlags())`, with `empty`:

```jsx
<section className="page-tabs-empty"><h1>Server</h1><p>No server tools are available. Configure Arr apps in <Link to="/settings/integrations">Settings → Integrations</Link> to enable Automation Health.</p></section>
```

- [ ] **Step 4:** Gate. **Commit** `feat(nav): add Users and Server hub pages`

---

### Task 3: Routes, navbar and verification

**Files:**
- Modify: `apps/web/src/routes.jsx` (lines 6, 22-24, 34, 50-52)
- Modify: `apps/web/src/lib/navdata.jsx` (remove `wizarr` and `automation-health` items; rename `server-management` label/text to "Server")
- Modify: `apps/web/src/pages/components/general/navbar.jsx:236-246` (visibility)

- [ ] **Step 1: Routes** — `/users` → `<UsersHub />`; `/server-management` → `<ServerHub />`; `/wizarr` → `<Navigate to="/users?tab=invites" replace />`; `/automation-health` → `<Navigate to="/server-management?tab=automation" replace />`. Remove the now-unused lazy imports of `Users`, `AutomationHealth`, `ServerManagement`, `Wizarr` from `routes.jsx` (the hubs import them).
- [ ] **Step 2: navdata** — delete the two items; change the `server-management` item's `text`/`label` to "Server" (text via existing `Trans` pattern if the item uses one; otherwise plain "Server").
- [ ] **Step 3: navbar filter** — remove the `automation-health` and `wizarr` lines; `server-management` returns `showServerNav({ isAdmin: isJellyfinAdmin, isSilo: config?.IS_SILO === true, automation: showAutomationHealthNav })`. Keep `showWizarrNav` state (it still feeds the flag the hub reads). Update the `useMemo` deps.
- [ ] **Step 4: Verify** with Playwright against the dev server (:5173), setting `localStorage` flags before navigation:
  - Flags off (your current install): nav has no Invites/Automation Health/Server; `/users` shows Users with **no** tab bar; `/server-management` shows the empty state (Review Focus 1); `/users?tab=invites` shows Users (Review Focus 2).
  - Flags on (`silo_barracks_wizarr_nav_available=true`, `silo_barracks_automation_health_nav_available=true`): nav shows Users and Server; `/users` has tabs Users | Invites; `/wizarr` lands on `/users?tab=invites` and `history.back()` returns to the previous page, not `/wizarr` (Review Focus 3); `/automation-health` lands on Server → Automation Health; nav "Server" is active there and "Users" active on Invites (Review Focus 4).
  - Settings → General → Navbar order lists no Invites / Automation Health; seed `localStorage.silo_barracks_nav_order` with an order containing `wizarr` and reload — no error, nav renders (Review Focus 5).
  - Theme harness UI script against :5173: 47 PASS (pre-existing stateMatrix failure), no overflow.
- [ ] **Step 5:** Gate. **Commit** `feat(nav): route Invites and Automation Health through hub tabs`

## Out of scope

- Calendar nav gating, Statistics hub, Maintainerr, My Glance.
