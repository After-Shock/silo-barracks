#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const navbar = read("apps/web/src/pages/components/general/navbar.jsx");
const tooltip = read("apps/web/src/components/ui/tooltip.jsx");
const bridge = read("apps/web/src/styles/shadcn-bridge.css");

// Every nav link is wrapped in an accessible (Radix) tooltip that shows its label.
assert.match(navbar, /import \{[^}]*\bTooltipContent\b[^}]*\} from "@\/components\/ui\/tooltip"/);
assert.match(navbar, /<TooltipProvider\b/);
assert.match(navbar, /<TooltipTrigger asChild>\s*<Link/);
assert.match(navbar, /<TooltipContent side="right">\{navLabel\}<\/TooltipContent>/);

// Tooltips use the Barracks inset surface and text semantic tokens.
assert.match(tooltip, /tw:bg-surface-inset\b/);
assert.match(tooltip, /tw:text-inset-foreground\b/);
assert.match(tooltip, /tw:border-border-inset\b/);
assert.match(bridge, /--color-surface-inset:\s*var\(--barracks-surface-inset\)/);
assert.match(bridge, /--color-inset-foreground:\s*var\(--barracks-text-inset\)/);
assert.match(bridge, /--color-border-inset:\s*var\(--barracks-border-inset\)/);

// Above the fixed desktop navbar (z-index 1030).
assert.match(tooltip, /tw:z-\[1080\]/);

console.log("PASS navbar Activity tooltip source contract");
