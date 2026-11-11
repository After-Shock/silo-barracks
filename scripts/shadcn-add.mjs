#!/usr/bin/env node
// Wrapper around `shadcn add` for apps/web.
// The shadcn CLI (as of 2026-11) mis-resolves the utils alias in this npm
// workspace: it writes `import { cn } from "cn"` and installs the unrelated
// `cn` npm package. This runs the CLI, then repairs both.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps/web");
const items = process.argv.slice(2);
if (items.length === 0) {
  console.error("usage: npm run ui:add -- <component> [component...]");
  process.exit(1);
}

execFileSync("npx", ["--yes", "shadcn@latest", "add", ...items, "--yes"], { cwd: web, stdio: "inherit" });

const pkgPath = path.join(web, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (pkg.dependencies?.cn) {
  execFileSync("npm", ["uninstall", "-w", "@jellyglance/web", "cn"], { cwd: root, stdio: "inherit" });
}

let fixed = 0;
for (const dir of ["src/components", "src/hooks"]) {
  const abs = path.join(web, dir);
  if (!fs.existsSync(abs)) continue;
  for (const entry of fs.readdirSync(abs, { recursive: true })) {
    if (!/\.(jsx?|mjs)$/.test(entry)) continue;
    const file = path.join(abs, entry);
    const src = fs.readFileSync(file, "utf8");
    const out = src.replace(/from\s+["']cn["']/g, 'from "@/lib/utils"');
    if (out !== src) {
      fs.writeFileSync(file, out);
      fixed += 1;
    }
  }
}
console.log(`shadcn-add: repaired cn import in ${fixed} file(s)`);
