#!/usr/bin/env node

"use strict";

// Settings-only visual contract. Task 11 extends this matrix to every route;
// keeping the fixture-free pass small makes Settings regressions reproducible
// against the authenticated local service.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const BASE_URL = process.env.BARRACKS_BASE_URL || "http://127.0.0.1:3000";
const CHROMIUM = process.env.BARRACKS_CHROMIUM;
const PLAYWRIGHT = process.env.BARRACKS_PLAYWRIGHT || "playwright";
const QA_DIR = process.env.BARRACKS_QA_DIR || path.join(process.cwd(), ".qa-universal-theme");

const ROUTES = [
  ["/settings", "general"],
  ["/settings/general", "general"],
  ["/settings/security", "security"],
  ["/settings/kiosk", "kiosk"],
  ["/settings/libraries", "libraries"],
  ["/settings/activity-monitor", "activity-monitor"],
  ["/settings/devices", "devices"],
  ["/settings/plugins", "plugins"],
  ["/settings/integrations", "integrations"],
  ["/settings/servers", "servers"],
  ["/settings/api-key", "api-key"],
  ["/settings/webhooks", "webhooks"],
  ["/settings/notifications", "notifications"],
  ["/settings/newsletter", "newsletter"],
  ["/settings/tasks", "tasks"],
  ["/settings/backup", "backup"],
  ["/settings/imports", "imports"],
  ["/settings/health", "health"],
  ["/settings/repair", "repair"],
  ["/settings/logs", "logs"],
];

const LEGACY_COLORS = new Set([
  "rgb(90,45,165)",
  "rgb(117,53,143)",
  "rgb(0,229,255)",
  "rgb(45,212,191)",
  "rgb(20,184,166)",
]);

function normalizeColor(value) {
  return String(value || "").toLowerCase().replaceAll(" ", "");
}

function getToken() {
  return execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "silo-barracks",
      "node",
      "-e",
      "process.stdout.write(require('jsonwebtoken').sign({user:{id:1,authMode:'local'}},process.env.JWT_SECRET,{expiresIn:'5m'}))",
    ],
    { encoding: "utf8" },
  ).trim();
}

async function checkOverflow(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const root = document.querySelector('[data-theme-screen="settings"]');
    const rootBox = root?.getBoundingClientRect();
    return {
      // The shared shell intentionally keeps a zoomed layout inside a clipped
      // body; documentElement is the user-visible scroll container.
      document: document.documentElement.scrollWidth - width,
      root: rootBox ? rootBox.right - width : 0,
    };
  });
}

async function findLegacyColors(page) {
  return page.evaluate((legacyColors) => {
    const matches = [];
    const root = document.querySelector('[data-theme-screen="settings"]');
    if (!root) return matches;
    const elements = [root, ...root.querySelectorAll("*")];
    for (const element of elements) {
      const computed = getComputedStyle(element);
      const values = [computed.backgroundColor, computed.color, computed.borderColor, computed.outlineColor]
        .map(value => String(value || "").toLowerCase().replaceAll(" ", ""));
      for (const value of values) {
        if (legacyColors.includes(value)) {
          matches.push({ tag: element.tagName, className: String(element.className || ""), value });
        }
      }
    }
    return matches.slice(0, 20);
  }, [...LEGACY_COLORS]);
}

async function checkRoute(page, route, expectedTab, viewport, errors) {
  await page.setViewportSize(viewport);
  const target = `${BASE_URL}${route}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 });
  const marker = page.locator('[data-theme-screen="settings"]');
  await marker.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(expected => document.querySelector('[data-theme-screen="settings"]')?.dataset.themeActiveTab === expected, expectedTab);

  const activeTab = await marker.getAttribute("data-theme-active-tab");
  assert.equal(activeTab, expectedTab, `${route} should expose active Settings tab ${expectedTab}`);
  const overflow = await checkOverflow(page);
  assert.ok(overflow.document <= 1, `${route} has document overflow ${overflow.document}px at ${viewport.width}px`);
  assert.ok(overflow.root <= 1, `${route} has Settings overflow ${overflow.root}px at ${viewport.width}px`);
  const legacyColors = await findLegacyColors(page);
  assert.deepEqual(legacyColors, [], `${route} exposes legacy computed colors`);

  if (process.env.BARRACKS_QA_DIR) {
    const name = `${expectedTab}-${viewport.width}`;
    await page.screenshot({ path: path.join(QA_DIR, `${name}.png`), fullPage: true });
  }
  if (errors.length) {
    throw new Error(`${route} emitted browser errors: ${errors.join(" | ")}`);
  }
  return { route, viewport: viewport.width, activeTab, overflow };
}

async function main() {
  if (process.env.BARRACKS_THEME_ROUTES && process.env.BARRACKS_THEME_ROUTES !== "settings") {
    throw new Error("Task 10 checker only supports BARRACKS_THEME_ROUTES=settings; Task 11 expands this matrix.");
  }
  fs.mkdirSync(QA_DIR, { recursive: true });
  const { chromium } = require(PLAYWRIGHT);
  const token = getToken();
  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
  const results = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(value => localStorage.setItem("token", value), token);
    const page = await context.newPage();
    let currentErrors = [];
    page.on("pageerror", error => currentErrors.push(error.message));

    for (const [route, expectedTab] of ROUTES) {
      currentErrors = [];
      results.push(await checkRoute(page, route, expectedTab, { width: 1440, height: 1000 }, currentErrors));
      currentErrors = [];
      results.push(await checkRoute(page, route, expectedTab, { width: 390, height: 844 }, currentErrors));
      console.log(`PASS ${route} (${expectedTab}) desktop/mobile`);
    }
  } finally {
    await browser.close();
  }
  console.log(`PASS: ${results.length} Settings theme route checks`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
