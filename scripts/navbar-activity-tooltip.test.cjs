#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const navbar = fs.readFileSync(path.join(root, "apps/web/src/pages/components/general/navbar.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "apps/web/src/pages/css/navbar.css"), "utf8");

assert.match(navbar, /\bOverlayTrigger\b/);
assert.match(navbar, /\bTooltip\b/);
assert.match(navbar, /id=\{`nav-tooltip-\$\{item\.id\}`\}/);
assert.match(navbar, /className="barracks-nav-tooltip"/);
assert.match(css, /\.barracks-nav-tooltip\s+\.tooltip-inner/);
assert.match(css, /background:\s*var\(--barracks-surface-inset\)/);
assert.match(css, /color:\s*var\(--barracks-text-inset\)/);

console.log("PASS navbar Activity tooltip source contract");
