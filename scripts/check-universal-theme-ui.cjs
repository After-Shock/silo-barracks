#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const BASE_URL = process.env.BARRACKS_BASE_URL || "http://127.0.0.1:3000";
const ORIGIN = new URL(BASE_URL).origin;
const QA_DIR = process.env.BARRACKS_QA_DIR || path.join(process.cwd(), ".qa-universal-theme");
const routes = [
  ["/", "home"], ["/kiosk", "kiosk"], ["/home/kiosk", "kiosk"], ["/recently-added", "recently-added"],
  ["/libraries", "libraries"], ["/libraries/fixture-library", "library-detail"], ["/libraries/item/fixture-item", "item-detail"],
  ["/users", "users"], ["/users/fixture-user", "user-profile"], ["/activity", "activity"], ["/timeline", "timeline"],
  ["/calendar", "calendar"], ["/requests", "requests"], ["/downloads", "downloads"], ["/active-transcodes", "active-transcodes"],
  ["/wizarr", "wizarr"], ["/automation-health", "automation-health"], ["/statistics", "statistics"],
  ["/server-management", "server-management"], ["/settings", "settings"], ["/integrations", "integrations"], ["/about", "about"],
];
const settings = ["general", "security", "kiosk", "libraries", "activity-monitor", "devices", "plugins", "integrations", "servers", "api-key", "webhooks", "notifications", "newsletter", "tasks", "backup", "imports", "health", "repair", "logs"];
const integrationSettings = [["/settings/integrations/media-server", "media-server"], ["/settings/integrations/automation", "automation"], ["/settings/integrations/seerr", "seerr"], ["/settings/integrations/downloads", "downloads"], ["/settings/integrations/invites", "invites"]];
const settingsLabels = { general: "General", security: "Security", kiosk: "Kiosk", libraries: "Library Settings", "activity-monitor": "Activity Monitor", devices: "Authorised Devices", plugins: "Plugins", integrations: "Integrations", servers: "Silo Servers", "api-key": "API Key", webhooks: "Webhooks", notifications: "Notifications", newsletter: "Newsletter", tasks: "Tasks", backup: "Backup", imports: "Imports", health: "Health", repair: "Repair", logs: "Logs" };
const integrationLabels = { "media-server": "Media Server", automation: "Arr Apps", seerr: "Seerr Apps", downloads: "Download Clients", invites: "Invites / Transcodes" };
const viewports = [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }];
const dataPrefixes = ["/api", "/stats", "/proxy", "/fleet", "/backup", "/sync", "/webhooks", "/newsletter", "/jellystat", "/tautulli", "/logs"];
const forbiddenGets = new Set(["/api/startTask", "/api/stopTask", "/api/restartTask", "/backup/beginBackup", "/sync/beginSync"]);
const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const legacyColours = ["rgb(90,45,165)", "rgb(117,53,143)", "rgb(0,229,255)", "rgb(45,212,191)", "rgb(20,184,166)"];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==", "base64");
let activeFixtureState;

const library = { Id: "fixture-library", Name: "Fixture Library", CollectionType: "movies", archived: false, Library_Count: 51, Plays: 2, Size: 1024 };
const item = { Id: "fixture-item", Name: "Fixture Item", Type: "Movie", ParentId: "fixture-library", archived: false, DateCreated: "2026-09-06T20:00:00.000Z", ProductionYear: 2026, Genres: "Drama", ProviderIds: {}, RunTimeTicks: 36000000000, Size: 1024, times_played: 2, total_play_time: 3600 };
const user = { UserId: "fixture-user", UserName: "Fixture User", Name: "Fixture User", TotalWatchTime: 3600, TotalPlays: 2, Plays: 2, LastActivityDate: "2026-09-06T20:00:00.000Z" };
const activity = { Id: "fixture-activity", UserId: "fixture-user", UserName: "Fixture User", Client: "Silo Web", DeviceName: "Fixture Browser", ApplicationVersion: "1.0", NowPlayingItemId: "fixture-item", EpisodeId: "fixture-item", NowPlayingItemName: "Fixture Movie", SeriesName: null, ActivityDateInserted: "2026-09-06T20:00:00.000Z", PlaybackDuration: 3600, TotalDuration: 3600, TotalPlays: 2, PlayMethod: "DirectPlay", RemoteEndPoint: "127.0.0.1", ParentId: "fixture-library", results: [] };
const session = { Id: "fixture-session", UserId: "fixture-user", UserName: "Fixture User", Client: "Silo Web", ApplicationVersion: "1.0", DeviceName: "Fixture Browser", MediaServerProvider: "silo", RemoteEndPoint: "127.0.0.1", NowPlayingItem: { Id: "fixture-item", Name: "Fixture Movie", Type: "Movie", RunTimeTicks: 36000000000, SiloPosterUrl: "", ContainerStream: "mkv", VideoStream: "H.264", AudioStream: "AAC" }, PlayState: { IsPaused: false, PositionTicks: 10000000, PlayMethod: "DirectPlay" } };
const charts = { stats: [{ Key: "2026-09-05", "Fixture Library": { count: 2, duration: 45 } }, { Key: "2026-09-06", "Fixture Library": { count: 3, duration: 60 } }], libraries: [{ Id: "fixture-library", Name: "Fixture Library" }] };

function getToken() {
  return execFileSync("docker", ["compose", "exec", "-T", "silo-barracks", "node", "-e", "process.stdout.write(require('jsonwebtoken').sign({user:{id:1,authMode:'local'}},process.env.JWT_SECRET,{expiresIn:'5m'}))"], { encoding: "utf8" }).trim();
}
function json(body, status = 200) { return { status, contentType: "application/json", body: JSON.stringify(body) }; }
function fileSlug(value) { return String(value).replace(/^\/$/, "home").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(); }
function libraryPage(page) {
  if (page === 2) return { page: 2, current_page: 2, pages: 2, results: [{ ...item, Id: "fixture-item-51", Name: "Fixture Movie 51" }] };
  return { page: 1, current_page: 1, pages: 2, results: Array.from({ length: 50 }, (_, i) => ({ ...item, Id: `fixture-item-${i + 1}`, Name: `Fixture Movie ${i + 1}` })) };
}
function fleet(partial) {
  const primary = { id: "primary", name: "Primary Silo", state: "connected", enabled: true, isPrimary: true, lastSuccessAt: "2026-09-07T12:00:00.000Z", error: null, activeStreams: 1, playingStreams: 1, pausedStreams: 0, sessions: [{ ...session, FleetServerId: "primary", FleetServerName: "Primary Silo", stale: false }] };
  const servers = [primary];
  if (partial) servers.push({ id: "fixture-stale", name: "Fixture Stale Silo", state: "stale", enabled: true, isPrimary: false, lastSuccessAt: "2026-09-05T12:00:00.000Z", error: "Fixture server unavailable", activeStreams: 1, playingStreams: 1, pausedStreams: 0, sessions: [{ ...session, Id: "fixture-stale-session", FleetServerId: "fixture-stale", FleetServerName: "Fixture Stale Silo", stale: true }] });
  return { updatedAt: "2026-09-07T12:00:00.000Z", partial, totalActiveStreams: 1, activeStreams: 1, playingStreams: 1, pausedStreams: 0, servers };
}

function createDispatcher() {
  const state = { fleetMode: "connected", automationMode: "healthy", delayLibrary: false, continuedMutations: [], blockedMutations: [], forbiddenActions: [], unhandledReads: [], libraryPages: [] };
  async function dispatch(route) {
    const req = route.request(); const url = new URL(req.url());
    if (url.origin !== ORIGIN) return route.continue();
    const method = req.method().toUpperCase(); const p = url.pathname.replace(/\/$/, "") || "/";
    // Socket.IO polling writes transport frames even during read-only pages.
    // Terminate those frames in the fixture layer so none reach the live app.
    if (p === "/socket.io" && method === "POST") return route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
    if (method === "GET" && (forbiddenGets.has(p) || /\/(?:delete|remove|restore)(?:\/|$)/i.test(p))) { state.forbiddenActions.push(`${method} ${p}`); return route.fulfill(json({ error: "forbidden fixture action" }, 418)); }
    if (method === "GET" && p.startsWith("/proxy/") && !["/proxy/getSessions", "/proxy/sessionStatus"].includes(p)) return route.fulfill({ status: 200, contentType: "image/png", body: png });
    let body;
    if (p === "/api/getconfig" && method === "GET") body = { JF_HOST: "https://fixture.invalid", APP_USER: "Fixture Admin", REQUIRE_LOGIN: true, IS_JELLYFIN: false, IS_SILO: true, MEDIA_SERVER_PROVIDER: "silo", settings: { firstRunExtrasCompleted: true, ShowLibraryCardNames: true, EXTERNAL_URL: "", notifications: { level: "all", durationSeconds: 5, position: "top-right" } } };
    else if (p === "/api/getLibrary" && method === "POST") { if (state.delayLibrary) await new Promise(r => setTimeout(r, 1200)); body = { Name: "Fixture Library", CollectionType: "movies", archived: false }; }
    else if (p === "/api/getItemDetails" && method === "POST") body = [item];
    else if (["/api/getLibraries", "/api/TrackedLibraries"].includes(p) && method === "GET") body = [library];
    else if (p === "/api/getHistory" && method === "GET") body = { current_page: 1, pages: 2, size: 10, results: [activity, { ...activity, Id: "fixture-activity-2", PlayMethod: "Transcode" }] };
    else if (p === "/api/getActivityTimeLine" && method === "POST") body = [];
    else if (["/api/getLibraryHistory", "/api/getItemHistory", "/api/getUserHistory"].includes(p) && method === "POST") body = { current_page: 1, pages: 1, results: [activity] };
    else if (p === "/api/getUserDetails" && method === "POST") body = { Id: "fixture-user", Name: "Fixture User", UserId: "fixture-user", UserName: "Fixture User" };
    else if (["/api/getSeasons", "/api/getEpisodes"].includes(p)) body = [];
    else if (p === "/api/getRecentlyAdded" && method === "GET") body = [item];
    else if (p === "/api/getRecentlyAddedShelves" && method === "GET") body = [{ id: "fixture-library", name: "Fixture Library", items: [item] }];
    else if (p === "/api/userAccess" && method === "GET") body = { isAdmin: true, canManageUsers: true, canManageRequests: true, permissions: ["admin"], roles: ["Viewer", "Admin"], localUsers: [] };
    else if (p === "/api/UntrackedUsers" && method === "GET") body = [];
    else if (p === "/api/users/fixture-user/media-lists" && method === "GET") body = { favourites: [], watchlist: [] };
    else if (p === "/api/home/operations" && method === "GET") body = { tasks: [], integrations: [], backups: [] };
    else if (p === "/api/tdarr/transcodes" && method === "GET") body = { items: [], active: 0, nodes: [] };
    else if (p === "/api/wizarr/summary" && method === "GET") body = { invitations: [], stats: {}, connected: false };
    else if (p === "/api/integrations" && method === "GET") body = { arrApps: [], clients: [], thirdParty: [], agentDefaults: {} };
    else if (p === "/api/integrations/health-history" && method === "GET") body = [];
    else if (p === "/api/integrations/calendar" && method === "GET") body = { releases: [], sources: [], syncedAt: "2026-09-07T12:00:00.000Z" };
    else if (p === "/api/integrations/downloads" && method === "GET") body = { items: [], syncedAt: "2026-09-07T12:00:00.000Z" };
    else if (p === "/api/requests" && method === "GET") body = { sources: [], requests: [], stats: { badgeCount: 0 }, syncedAt: "2026-09-07T12:00:00.000Z" };
    else if (p === "/api/requests/summary" && method === "GET") body = { badgeCount: 0, pending: 0, failed: 0 };
    else if (p === "/api/requests/options" && method === "GET") body = { servers: [] };
    else if (p === "/api/automation-health" && method === "GET") { if (state.automationMode === "error") return route.fulfill(json({ error: "Fixture automation unavailable" }, 503)); body = { services: [], stats: {} }; }
    else if (p === "/api/library-display-settings" && method === "GET") body = {};
    else if (p === "/api/getActivityMonitorSettings" && method === "GET") body = { enabled: true, interval: 15 };
    else if (["/api/jellyfin/plugins", "/api/jellyfin/devices"].includes(p) && method === "GET") body = [];
    else if (["/api/getBackupTables", "/api/getTaskSettings", "/api/keys", "/api/admin-audit", "/api/CheckForUpdates/releases", "/api/github/contributors"].includes(p) && method === "GET") body = [];
    else if (p === "/api/health" && method === "GET") body = { ok: true, status: "healthy", database: { ok: true } };
    else if (p === "/api/server-management/status" && method === "GET") body = { status: "healthy", uptime: 3600, version: "1.2.3-beta.3" };
    else if (p === "/api/CheckForUpdates" && method === "GET") body = { updateAvailable: false, currentVersion: "1.2.3-beta.3" };
    else if (p === "/backup/files" && method === "GET") body = [];
    else if (p === "/webhooks" && method === "GET") body = [];
    else if (p === "/webhooks/delivery-history" && method === "GET") body = [];
    else if (p === "/webhooks/event-status" && method === "GET") body = {};
    else if (p === "/newsletter/settings" && method === "GET") body = { enabled: false, recipients: [] };
    else if (p === "/newsletter/preview" && method === "GET") body = { subject: "Fixture", html: "" };
    else if (["/jellystat/unmatched-users", "/tautulli/unmatched", "/tautulli/unmatched-users", "/tautulli/search-media"].includes(p) && method === "GET") body = [];
    else if (p === "/logs/getLogs" && method === "GET") body = [];
    else if (p === "/proxy/getSessions" && method === "GET") body = [session];
    else if (p === "/proxy/sessionStatus" && method === "GET") body = { state: "connected", lastSuccessAt: "2026-09-07T12:00:00.000Z" };
    else if (p === "/fleet" && method === "GET") body = fleet(state.fleetMode === "partial");
    else if (p === "/fleet/servers" && method === "GET") body = [{ id: "primary", name: "Primary Silo", url: "https://fixture.invalid", primary: true, enabled: true }];
    else if (p === "/stats/getHomeDashboard" && method === "GET") body = { playbackTotals: { TotalPlaybacks: 2, UniqueViewers: 1, TotalWatchSeconds: 3600 }, topUsers: [user], peakHours: [], libraryCounts: { Movies: 51, Shows: 0, Episodes: 0, Artists: 0, ActiveLibraries: 1 }, catalogSize: 1024, activeLibraries: 1 };
    else if (p === "/stats/getPlaybackActivity" && method === "GET") body = { current_page: 1, pages: 1, results: [activity] };
    else if (p === "/stats/getUserProfileWrapUp" && method === "GET") body = { user, rank: 1 };
    else if (p === "/stats/getUserWrapUp" && method === "GET") body = [user];
    else if (p === "/stats/getUserLastPlayed" && method === "POST") body = [];
    else if (["/stats/getGenreUserStats", "/stats/getGenreLibraryStats"].includes(p) && method === "GET") body = [];
    else if (p === "/stats/getLibraryMetadata" && method === "GET") body = [library];
    else if (p === "/stats/getLibraryCardStats" && method === "GET") body = [library];
    else if (p === "/stats/getLibraryOverview" && method === "GET") body = {};
    else if (["/stats/getGlobalLibraryStats", "/stats/getGlobalItemStats", "/stats/getGlobalUserStats"].includes(p) && method === "POST") body = { TotalPlaybacks: 2, TotalWatchTime: 3600, TotalWatchTimeMinutes: 60, UniqueItems: 1 };
    else if (p === "/stats/getLibraryLastPlayed") body = [];
    else if (p === "/stats/getAllUserActivity" && method === "GET") body = [user];
    else if (p === "/stats/getLibraryItemsWithStats" && method === "POST") { const pageNumber = Number(url.searchParams.get("page") || 1); state.libraryPages.push(pageNumber); body = libraryPage(pageNumber); }
    else if (p === "/stats/getLibraryItemsPlayMethodStats" && method === "POST") body = [];
    else if (["/stats/getViewsOverTime", "/stats/getViewsByDays", "/stats/getViewsByHour"].includes(p) && method === "GET") body = charts;
    else if (p === "/stats/repair-hub" && method === "GET") body = { totals: {}, issues: [] };
    else if (p === "/stats/getMostViewedByType" && method === "POST") body = [{ Id: "fixture-item", Name: "Fixture Movie", Plays: 2 }];
    else if (p === "/stats/getMostViewedLibraries" && method === "POST") body = [{ Id: "fixture-library", Name: "Fixture Library", Plays: 2 }];
    else if (p === "/stats/getMostActiveUsers" && method === "POST") body = [{ UserId: "fixture-user", Name: "Fixture User", Plays: 2 }];
    else if (p === "/stats/getMostUsedClient" && method === "POST") body = [{ Client: "Silo Web", Plays: 2 }];
    else if (p === "/stats/getPlaybackMethodStats" && method === "POST") body = [{ Name: "DirectPlay", Count: 2 }];
    else if (p === "/stats/getMostPopularByType" && method === "POST") body = [{ Id: "fixture-item", Name: "Fixture Movie", Plays: 2 }];
    if (body !== undefined) return route.fulfill(json(body));
    if (mutationMethods.has(method)) { state.blockedMutations.push(`${method} ${p}`); return route.fulfill(json({ error: "unhandled mutation" }, 418)); }
    if (method === "GET" && dataPrefixes.some(prefix => p === prefix || p.startsWith(`${prefix}/`))) { state.unhandledReads.push(`${method} ${p}`); return route.fulfill(json({ error: "unhandled read" }, 418)); }
    return route.continue();
  }
  return { state, dispatch };
}

function watchErrors(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  // HTTP fixture failures are accounted for by the dispatcher arrays below;
  // keep this channel for actual application console errors and exceptions.
  page.on("console", message => { if (message.type() === "error" && !/^Failed to load resource:/.test(message.text())) errors.push(`console: ${message.text()}`); });
  return errors;
}
async function gotoReady(page, routePath, screen, viewport) {
  await page.setViewportSize(viewport); await page.goto(`${BASE_URL}${routePath}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const marker = page.locator(`[data-theme-screen="${screen}"]`).first(); await marker.waitFor({ state: "visible", timeout: 30000 });
  const whatsNew = page.getByRole("button", { name: "Got it", exact: true });
  if (await whatsNew.isVisible()) { await whatsNew.click(); await whatsNew.waitFor({ state: "hidden" }); }
  const expectedPath = routePath === "/settings" ? "/settings/general" : routePath;
  assert.equal(new URL(page.url()).pathname, expectedPath); return marker;
}
async function inspect(page, screen) {
  return page.evaluate(({ screen, legacy }) => {
    const norm = v => String(v || "").toLowerCase().replaceAll(" ", ""); const root = document.querySelector(`[data-theme-screen="${screen}"]`); const width = document.documentElement.clientWidth;
    const semantic = new Set(); const docStyle = getComputedStyle(document.documentElement); for (const prop of docStyle) if (prop.startsWith("--barracks-")) semantic.add(norm(docStyle.getPropertyValue(prop)));
    const found = []; const nodes = root ? [root, ...root.querySelectorAll("button,input,select,textarea,table,[role='table'],[role='dialog'],.card,.modal-content,section,article,nav")] : [];
    for (const node of nodes) for (const value of [getComputedStyle(node).backgroundColor, getComputedStyle(node).borderColor, getComputedStyle(node).outlineColor]) { const n = norm(value); if (legacy.includes(n) && !semantic.has(n)) found.push({ tag: node.tagName, className: String(node.className || ""), value: n }); }
    const box = root?.getBoundingClientRect(); return { documentOverflow: document.documentElement.scrollWidth - width, rootOverflow: box ? box.right - width : 0, found: found.slice(0, 20) };
  }, { screen, legacy: legacyColours });
}
async function check(page, routePath, screen, viewport, errors, prefix = "default") {
  const start = errors.length; const marker = await gotoReady(page, routePath, screen, viewport);
  if (screen === "settings") { const tab = routePath === "/settings" ? "general" : routePath.split("/")[2]; await page.waitForFunction(t => document.querySelector('[data-theme-screen="settings"]')?.dataset.themeActiveTab === t, tab); assert.equal(await marker.getAttribute("data-theme-active-tab"), tab); const active = page.locator('[data-theme-screen="settings"] [role="tab"][aria-selected="true"]:visible').first(); await active.waitFor({ state: "visible" }); assert.match((await active.innerText()).trim(), new RegExp(settingsLabels[tab], "i")); }
  const result = await inspect(page, screen); assert.ok(result.documentOverflow <= 1, `${routePath} document overflow ${result.documentOverflow}px at ${viewport.width}px`); assert.ok(result.rootOverflow <= 1, `${routePath} root overflow ${result.rootOverflow}px`); assert.deepEqual(result.found, []); assert.deepEqual(errors.slice(start), []);
  await page.screenshot({ path: path.join(QA_DIR, `${prefix}-${fileSlug(routePath)}-${viewport.name}.png`), fullPage: true });
}
async function checkSettings(page, routePath, tab, viewport, errors, integration = "") {
  const start = errors.length; const marker = await gotoReady(page, routePath, "settings", viewport);
  await page.waitForFunction(x => { const r = document.querySelector('[data-theme-screen="settings"]'); return r?.dataset.themeActiveTab === x.tab && (!x.integration || r.dataset.themeActiveIntegrationTab === x.integration); }, { tab, integration });
  assert.equal(await marker.getAttribute("data-theme-active-tab"), tab);
  if (integration) { assert.equal(await marker.getAttribute("data-theme-active-integration-tab"), integration); const active = page.locator(".integration-subtabs button.is-active:visible"); await active.waitFor({ state: "visible" }); assert.equal((await active.innerText()).trim(), integrationLabels[integration]); }
  else { const active = page.locator('[data-theme-screen="settings"] [role="tab"][aria-selected="true"]:visible').first(); if (await active.count()) { await active.waitFor({ state: "visible" }); assert.match((await active.innerText()).trim(), new RegExp(settingsLabels[tab], "i")); } else { const siloMessage = tab === "devices" ? "Device management is not supported by Silo Barracks." : tab === "plugins" ? "Jellyfin plugins are not supported by Silo Barracks." : settingsLabels[tab]; await page.getByText(siloMessage, { exact: true }).waitFor({ state: "visible" }); } }
  const result = await inspect(page, "settings"); assert.ok(result.documentOverflow <= 1); assert.ok(result.rootOverflow <= 1); assert.deepEqual(result.found, []); assert.deepEqual(errors.slice(start), []);
  await page.screenshot({ path: path.join(QA_DIR, `default-${fileSlug(routePath)}-${viewport.name}.png`), fullPage: true });
}
async function openTheme(page, viewport) { const account = page.getByTestId(viewport.width < 768 ? "theme-account-mobile" : "theme-account-desktop"); await account.waitFor({ state: "visible" }); await account.click(); const menu = page.getByTestId("theme-menu"); await menu.waitFor({ state: "visible" }); await menu.click(); await page.locator(".profile-theme-select-menu").waitFor({ state: "visible" }); return account; }
async function preset(page, viewport, name) { await openTheme(page, viewport); await page.getByTestId(`theme-preset-${name}`).click(); const expected = name === "ocean" ? "#2dd4bf" : "#e5e7eb"; await page.waitForFunction(x => getComputedStyle(document.documentElement).getPropertyValue("--barracks-action").trim().toLowerCase() === x, expected); }
async function captureSamples(page, label, viewport) {
  await gotoReady(page, "/", "home", viewport); await page.screenshot({ path: path.join(QA_DIR, `${label}-sample-home.png`), fullPage: true });
  await page.locator('[aria-label^="Open session details"]').first().click(); await page.locator(".modal-content").waitFor({ state: "visible" }); await page.screenshot({ path: path.join(QA_DIR, `${label}-sample-dialog.png`), fullPage: true }); await page.getByRole("button", { name: "Close session details" }).click();
  await gotoReady(page, "/activity", "activity", viewport); await page.screenshot({ path: path.join(QA_DIR, `${label}-sample-activity.png`), fullPage: true }); await page.locator('[role="table"],table').first().waitFor({ state: "visible" }); await page.screenshot({ path: path.join(QA_DIR, `${label}-sample-table.png`), fullPage: true });
  await gotoReady(page, "/settings/general", "settings", viewport); await page.screenshot({ path: path.join(QA_DIR, `${label}-sample-settings.png`), fullPage: true });
  await gotoReady(page, "/statistics", "statistics", viewport); await page.getByRole("tab", { name: /Count/i }).click(); await page.locator(".recharts-wrapper").first().waitFor({ state: "visible", timeout: 30000 }); await page.screenshot({ path: path.join(QA_DIR, `${label}-sample-chart.png`), fullPage: true });
}

async function stateMatrix(page, fixtures, errors) {
  const vp = viewports[0]; const start = errors.length;
  await gotoReady(page, "/settings/general", "settings", vp); assert.ok(await page.locator('input[type="text"],input[type="color"]').count()); assert.ok(await page.locator("select").count()); const hex = page.getByLabel("Primary hex colour"); await hex.fill("#4ade80"); assert.equal((await hex.inputValue()).toLowerCase(), "#4ade80"); await page.getByText("Theme preview not applied", { exact: true }).waitFor({ state: "visible" });
  await gotoReady(page, "/", "home", vp); await openTheme(page, vp); assert.notEqual(await page.getByTestId("theme-menu").evaluate(n => getComputedStyle(n).backgroundColor), "rgba(0, 0, 0, 0)"); assert.notEqual(await page.locator(".profile-theme-select-menu").evaluate(n => getComputedStyle(n).backgroundColor), "rgba(0, 0, 0, 0)"); await page.keyboard.press("Escape"); const nav = page.locator('.desktop-navigation a[aria-label="Activity"]'); await nav.waitFor({ state: "visible" }); await nav.hover(); assert.equal(await nav.getAttribute("title"), "Activity");
  await gotoReady(page, "/activity", "activity", vp); await page.locator('[role="table"],table').first().waitFor({ state: "visible" }); await page.locator(".MuiTablePagination-root,[aria-label*='pagination' i]").first().waitFor({ state: "visible" });
  fixtures.state.delayLibrary = true; const navPromise = page.goto(`${BASE_URL}/libraries/fixture-library`, { waitUntil: "domcontentloaded", timeout: 30000 }); await page.locator('[data-theme-screen="library-detail"][aria-busy="true"]').waitFor({ state: "visible" }); await navPromise; await page.getByRole("heading", { name: "Fixture Library" }).waitFor({ state: "visible" }); fixtures.state.delayLibrary = false;
  await gotoReady(page, "/requests", "requests", vp); await page.locator(".requests-empty-state").waitFor({ state: "visible" });
  fixtures.state.automationMode = "error"; await gotoReady(page, "/automation-health", "automation-health", vp); await page.getByRole("alert").filter({ hasText: "Fixture automation unavailable" }).waitFor({ state: "visible" }); fixtures.state.automationMode = "healthy";
  fixtures.state.fleetMode = "partial"; await gotoReady(page, "/", "home", vp); await page.getByText(/Some servers are unavailable/i).waitFor({ state: "visible", timeout: 15000 }); await page.getByText("Fixture Stale Silo", { exact: true }).first().waitFor({ state: "visible" }); await page.getByText(/Stale · last known activity/i).first().waitFor({ state: "visible" }); fixtures.state.fleetMode = "connected";
  await page.locator('[aria-label^="Open session details"]').first().click(); await page.locator(".modal-content").waitFor({ state: "visible" }); await page.getByRole("button", { name: "Close session details" }).click();
  fixtures.state.libraryPages.length = 0; await gotoReady(page, "/libraries/fixture-library", "library-detail", vp); await page.getByRole("button", { name: /^Media$/i }).click(); await page.getByText("Fixture Movie 50", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  for (let attempt = 0; attempt < 10 && !fixtures.state.libraryPages.includes(2); attempt += 1) { await page.evaluate(() => { window.scrollTo(0, document.body.offsetHeight); window.dispatchEvent(new Event("scroll")); }); await page.waitForTimeout(250); }
  const scrollMetrics = await page.evaluate(() => ({ innerHeight: window.innerHeight, scrollY: window.scrollY, bodyOffsetHeight: document.body.offsetHeight, bodyScrollHeight: document.body.scrollHeight, documentScrollHeight: document.documentElement.scrollHeight }));
  assert.ok(fixtures.state.libraryPages.includes(2), `Libraries must request page=2 through the real infinite-scroll path: ${JSON.stringify(scrollMetrics)}`); await page.getByText("Fixture Movie 51", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  await gotoReady(page, "/statistics", "statistics", vp); await page.getByRole("tab", { name: /Count/i }).click(); await page.locator(".recharts-wrapper").first().waitFor({ state: "visible", timeout: 30000 }); assert.ok(await page.locator(".recharts-legend-wrapper,.recharts-default-legend").count()); assert.ok(await page.locator(".recharts-cartesian-axis-tick-value").count(), "chart labels must render"); assert.ok(await page.locator(".recharts-area-curve").count()); assert.deepEqual(errors.slice(start), []);
}
async function switching(page, viewport, errors) {
  const start = errors.length; await gotoReady(page, "/", "home", viewport); await page.evaluate(() => localStorage.removeItem("silo_barracks_theme")); await page.reload({ waitUntil: "domcontentloaded" }); await page.locator('[data-theme-screen="home"]').waitFor({ state: "visible" }); const original = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--barracks-action").trim().toLowerCase()); assert.equal(original, "#6f9bcf"); await preset(page, viewport, "ocean"); await page.locator(".profile-modal .modal-footer").getByRole("button", { name: "Close", exact: true }).click();
  await page.locator('[aria-label^="Open session details"]').first().click(); const modal = page.locator(".session-popout-modal .modal-content"); await modal.waitFor({ state: "visible" }); const before = await modal.evaluate(n => getComputedStyle(n).backgroundColor); const account = page.getByTestId(viewport.width < 768 ? "theme-account-mobile" : "theme-account-desktop"); await account.evaluate(n => n.click()); await page.getByTestId("theme-menu").waitFor({ state: "visible" }); await page.getByTestId("theme-menu").evaluate(n => n.click()); await page.getByTestId("theme-preset-mono").waitFor({ state: "visible" }); await page.getByTestId("theme-preset-mono").evaluate(n => n.click()); await page.waitForFunction(x => getComputedStyle(document.querySelector(".session-popout-modal .modal-content")).backgroundColor !== x, before); const modalTheme = await modal.evaluate(n => { const expectedNode = document.createElement("span"); expectedNode.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue("--barracks-surface-raised"); document.body.append(expectedNode); const result = { actual: getComputedStyle(n).backgroundColor, expected: getComputedStyle(expectedNode).backgroundColor }; expectedNode.remove(); return result; }); assert.equal(modalTheme.actual, modalTheme.expected); await page.locator(".profile-modal .modal-footer").getByRole("button", { name: "Close", exact: true }).evaluate(n => n.click()); await page.locator(".profile-modal").waitFor({ state: "hidden" }); await page.getByRole("button", { name: "Close session details" }).click();
  await gotoReady(page, "/statistics", "statistics", viewport); await page.getByRole("tab", { name: /Count/i }).click(); const curve = page.locator(".recharts-area-curve").first(); await curve.waitFor({ state: "visible", timeout: 30000 }); const mono = await curve.getAttribute("stroke"); await preset(page, viewport, "ocean"); await page.waitForFunction(x => document.querySelector(".recharts-area-curve")?.getAttribute("stroke") !== x, mono); const ocean = await curve.getAttribute("stroke"); const token = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--barracks-chart-1").trim().toLowerCase()); assert.equal(ocean.toLowerCase(), token); assert.notEqual(ocean, mono);
  await page.reload({ waitUntil: "domcontentloaded" }); await page.locator('[data-theme-screen="statistics"]').waitFor({ state: "visible" }); await openTheme(page, viewport); assert.equal((await page.getByTestId("theme-color-primary").inputValue()).toLowerCase(), "#2dd4bf"); await page.keyboard.press("Escape");
  await page.evaluate(() => localStorage.setItem("silo_barracks_theme", JSON.stringify({ primary: "bad", secondary: "#112233", background: null, surface: "#223344" }))); await page.reload({ waitUntil: "domcontentloaded" }); await page.locator('[data-theme-screen="statistics"]').waitFor({ state: "visible" }); assert.deepEqual(await page.evaluate(() => ({ action: getComputedStyle(document.documentElement).getPropertyValue("--barracks-action").trim().toLowerCase(), canvas: getComputedStyle(document.documentElement).getPropertyValue("--barracks-canvas").trim().toLowerCase() })), { action: "#6f9bcf", canvas: "#161410" }); await openTheme(page, viewport); const inputs = page.locator('.profile-modal input[type="color"]'); assert.equal((await inputs.nth(0).inputValue()).toLowerCase(), "#6f9bcf"); assert.equal((await inputs.nth(1).inputValue()).toLowerCase(), "#112233"); assert.equal((await inputs.nth(2).inputValue()).toLowerCase(), "#161410"); assert.equal((await inputs.nth(3).inputValue()).toLowerCase(), "#223344"); await page.keyboard.press("Escape"); assert.deepEqual(errors.slice(start), []);
}

async function main() {
  fs.mkdirSync(QA_DIR, { recursive: true }); const { chromium } = require(process.env.BARRACKS_PLAYWRIGHT || "playwright"); const fixtures = createDispatcher(); activeFixtureState = fixtures.state; const browser = await chromium.launch({ headless: true, executablePath: process.env.BARRACKS_CHROMIUM });
  try {
    const context = await browser.newContext({ viewport: viewports[0] }); const token = getToken(); await context.addInitScript(value => { localStorage.setItem("token", value); localStorage.removeItem("config"); localStorage.setItem("jellyglance_first_run_extras", "false"); localStorage.setItem("i18nextLng", "en-US"); }, token); await context.route("**/*", fixtures.dispatch); const page = await context.newPage(); const errors = watchErrors(page);
    const phase = process.env.BARRACKS_QA_PHASE || "all";
    if (phase === "all") {
      for (const [routePath, screen] of routes) { for (const viewport of viewports) await check(page, routePath, screen, viewport, errors); console.log(`PASS default ${routePath} desktop/mobile`); }
      for (const name of settings) { for (const viewport of viewports) await checkSettings(page, `/settings/${name}`, name, viewport, errors); console.log(`PASS Settings ${name} desktop/mobile`); }
      for (const [routePath, name] of integrationSettings) { for (const viewport of viewports) await checkSettings(page, routePath, "integrations", viewport, errors, name); console.log(`PASS Settings integration ${name} desktop/mobile`); }
    }
    if (phase !== "themes") await stateMatrix(page, fixtures, errors);
    if (phase === "states") { assert.deepEqual(fixtures.state.blockedMutations, []); assert.deepEqual(fixtures.state.forbiddenActions, []); assert.deepEqual(fixtures.state.unhandledReads, []); assert.deepEqual(errors, []); console.log("PASS state matrix"); return; }
    await switching(page, viewports[0], errors); await captureSamples(page, "malformed", viewports[0]);
    await page.evaluate(() => localStorage.removeItem("silo_barracks_theme")); await page.reload({ waitUntil: "domcontentloaded" }); await captureSamples(page, "default", viewports[0]); await gotoReady(page, "/", "home", viewports[0]); await openTheme(page, viewports[0]); const custom = page.getByTestId("theme-color-primary"); await custom.fill("#4ade80"); await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--barracks-action").trim().toLowerCase() === "#4ade80"); await page.keyboard.press("Escape"); await captureSamples(page, "custom", viewports[0]);
    for (const name of ["ocean", "mono"]) { await gotoReady(page, "/", "home", viewports[0]); await preset(page, viewports[0], name); for (const [routePath, screen] of routes) await check(page, routePath, screen, viewports[0], errors, name); console.log(`PASS ${name} top-level route screenshots`); }
    assert.deepEqual(fixtures.state.continuedMutations, []); assert.deepEqual(fixtures.state.blockedMutations, [], `blocked mutations: ${fixtures.state.blockedMutations.join(", ")}`); assert.deepEqual(fixtures.state.forbiddenActions, [], `forbidden actions: ${fixtures.state.forbiddenActions.join(", ")}`); assert.deepEqual(fixtures.state.unhandledReads, [], `unhandled reads: ${fixtures.state.unhandledReads.join(", ")}`); assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
    console.log(JSON.stringify({ status: "PASS", routeStateChecks: routes.length * 2 + settings.length * 2 + integrationSettings.length * 2, themedTopLevelChecks: routes.length * 2, stateTests: 10, continuedMutations: [], blockedMutations: [], forbiddenActions: [], unhandledReads: [], screenshotDir: QA_DIR }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack || error.message); if (activeFixtureState) console.error(JSON.stringify({ blockedMutations: activeFixtureState.blockedMutations, forbiddenActions: activeFixtureState.forbiddenActions, unhandledReads: activeFixtureState.unhandledReads })); process.exitCode = 1; });
