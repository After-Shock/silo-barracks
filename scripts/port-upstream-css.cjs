// Port upstream JellyGlance CSS for classes Barracks markup uses but Barracks CSS never styles.
// Barracks rules are never touched: only rules whose subject is an unstyled ("orphan") class are
// copied, and every raw colour is mapped onto a --barracks-* theme token.
// Re-run after every upstream merge (needs the `upstream` remote fetched), then check the UI:
//   npm run upstream:css
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const repo = path.resolve(__dirname, "..");
const out = path.join(repo, "apps/web/src/styles/upstream-port.css");
const postcss = require(path.join(repo, "node_modules/postcss"));
const sh = (c) => execSync(c, { cwd: repo, encoding: "utf8", maxBuffer: 1 << 28 });

const CLASS = /\.(-?[_a-zA-Z][\w-]*)/g;
const classesIn = (s) => [...s.matchAll(CLASS)].map((m) => m[1]);
const stripArgs = (s) => s.replace(/\[[^\]]*\]/g, "").replace(/:(not|is|where|has)\([^)]*\)/g, "");

// ---- inventory ----------------------------------------------------------------------------
const ourFiles = sh("git ls-files 'apps/web/src/*.css'").split("\n").filter(Boolean).filter((f) => !f.endsWith("upstream-port.css"));
const ourRoot = postcss.parse(ourFiles.map((f) => fs.readFileSync(path.join(repo, f), "utf8")).join("\n"));
const ourClasses = new Set(), ourVars = new Set(), ourKeyframes = new Set();
ourRoot.walkRules((r) => r.selectors?.forEach((s) => classesIn(s).forEach((c) => ourClasses.add(c))));
ourRoot.walkDecls((d) => d.prop.startsWith("--") && ourVars.add(d.prop));
ourRoot.walkAtRules(/keyframes$/i, (a) => ourKeyframes.add(a.params.trim()));
for (const m of fs.readFileSync(path.join(repo, "apps/web/src/lib/theme.js"), "utf8").matchAll(/["'`](--[\w-]+)["'`]/g)) ourVars.add(m[1]);

const upFiles = sh("git ls-tree -r --name-only upstream/BETA -- apps/web/src").split("\n").filter((f) => f.endsWith(".css"));
const upRoots = upFiles.map((f) => [f, postcss.parse(sh(`git show upstream/BETA:${f}`), { from: f })]);
const upClasses = new Set();
for (const [, r] of upRoots) r.walkRules((x) => x.selectors?.forEach((s) => classesIn(s).forEach((c) => upClasses.add(c))));

// Any quoted token in the app source counts as "used" (covers className strings, cn(), clsx(), arrays).
const used = new Set();
for (const f of sh("git ls-files 'apps/web/src/*.jsx' 'apps/web/src/*.js'").split("\n").filter(Boolean)) {
  const src = fs.readFileSync(path.join(repo, f), "utf8");
  for (const m of src.matchAll(/["'`]([^"'`\n]*)["'`]/g)) {
    for (const c of m[1].replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) if (/^[a-zA-Z][\w-]*$/.test(c)) used.add(c);
  }
}
const orphans = new Set([...used].filter((c) => upClasses.has(c) && !ourClasses.has(c)));

function subject(sel) {
  const parts = stripArgs(sel).split(/\s*[\s>+~]\s*/).filter(Boolean);
  return parts[parts.length - 1] || "";
}
function keepPart(sel) {
  if (!classesIn(stripArgs(sel)).some((c) => orphans.has(c))) return false;
  const subj = classesIn(subject(sel));
  if (!subj.length) return true;
  return subj.some((c) => orphans.has(c)) || subj.every((c) => !ourClasses.has(c));
}

// ---- colour mapping -----------------------------------------------------------------------
const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1] };
function parseColor(lit) {
  lit = lit.trim().toLowerCase();
  if (NAMED[lit]) return NAMED[lit];
  let m = lit.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = lit.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [+m[1], +m[2], +m[3], a];
  }
  return null;
}
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
const TEXT_PROPS = /^(color|fill|stroke|caret-color|-webkit-text-fill-color|text-decoration-color|--.*(text|fg|foreground|ink).*)$/;
const BORDER_PROPS = /^(border|outline|column-rule).*$/;
function token(rgba, prop) {
  const [h, , l] = hsl(rgba);
  const chroma = (Math.max(rgba[0], rgba[1], rgba[2]) - Math.min(rgba[0], rgba[1], rgba[2])) / 255;
  const isText = TEXT_PROPS.test(prop);
  // Upstream's blue-grey slates (#94a3b8, #c7d3e6) are neutrals; HSL saturation overstates them at high lightness.
  if (chroma < 0.16) {
    if (l >= 0.8) return isText ? (l >= 0.9 ? "--barracks-text-raised" : "--barracks-text-muted-raised") : "--barracks-text-raised";
    if (l >= 0.4) return isText ? "--barracks-text-muted-raised" : BORDER_PROPS.test(prop) ? "--barracks-border-strong" : "--barracks-text-muted";
    return isText ? "--barracks-text-inverse" : "--barracks-surface-inset";
  }
  if (h < 18 || h >= 335) return "--barracks-state-danger";
  if (h < 70) return "--barracks-state-warning";
  if (h < 170) return "--barracks-state-success";
  if (h < 300) return isText ? "--barracks-action-foreground" : "--barracks-action";
  return "--barracks-accent-secondary";
}
const pct = (a) => `${Math.round(a * 1000) / 10}%`;
const mix = (tok, a) => (a >= 0.98 ? `var(${tok})` : `color-mix(in srgb, var(${tok}) ${pct(a)}, transparent)`);

// Legacy colour aliases upstream uses; Barracks defines them as aliases of these tokens.
const ALIASES = {
  "--primary-color": "--barracks-action",
  "--primary-light-color": "--barracks-action",
  "--secondary-color": "--barracks-accent-secondary",
  "--surface-border-color": "--barracks-border-subtle",
  "--text-color": "--barracks-text",
  "--primary-rgb": "--barracks-action-rgb",
  "--primary-light-rgb": "--barracks-action-rgb",
  "--secondary-rgb": "--barracks-accent-secondary-rgb",
};
const unmapped = new Map();
const COLOR_LIT = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+(?:\s*[,/]\s*[\d.]+%?)?\s*\)|\b(?:white|black)\b/g;
function convertValue(value, prop) {
  value = value.replace(/var\(\s*(--[\w-]+)\s*(,[^()]*)?\)/g, (all, v) => (ALIASES[v] ? `var(${ALIASES[v]})` : all));
  // rgba(var(--x-rgb[, fallback]), a): Barracks-defined -rgb vars stay; upstream-only ones become color-mix of the colour var.
  value = value.replace(/rgba?\(\s*var\(\s*(--[\w-]+?)-rgb(?:\s*,[^)]*)?\)\s*,\s*([\d.]+)\s*\)/g, (all, base, a) => {
    if (ourVars.has(`${base}-rgb`)) return `rgba(var(${base}-rgb), ${a})`;
    return mix(base, parseFloat(a)).replace(`var(${base})`, `var(${base})`);
  });
  value = value.replace(/var\(\s*(--[\w-]+?)-rgb\s*\)/g, (all, base) => (ourVars.has(`${base}-rgb`) ? all : `var(${base})`));
  return value.replace(COLOR_LIT, (lit) => {
    const c = parseColor(lit);
    if (!c) { unmapped.set(lit, (unmapped.get(lit) || 0) + 1); return lit; }
    return mix(token(c, prop), c[3]);
  });
}

// ---- extraction -----------------------------------------------------------------------------
const outRoot = postcss.root();
const usedVars = new Set(), definedVars = new Set(), usedAnims = new Set();
let rules = 0;
function track(node) {
  node.walkDecls((d) => {
    if (d.prop.startsWith("--")) definedVars.add(d.prop);
    for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) usedVars.add(m[1]);
    if (/^animation(-name)?$/.test(d.prop)) d.value.split(/[\s,]+/).forEach((t) => usedAnims.add(t));
  });
}
for (const [file, root] of upRoots) {
  const chunk = [];
  root.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    const kept = (rule.selectors || []).filter(keepPart);
    if (!kept.length) return;
    const clone = rule.clone({ selectors: kept });
    clone.walkDecls((d) => {
      if (/-rgb$/.test(d.prop) && !ourVars.has(d.prop)) { d.remove(); return; } // replaced by color-mix of the colour var
      d.value = convertValue(d.value, d.prop);
      // Upstream uses its brand red for this primary button; in Barracks primary actions use the action colour.
      if (/\bmeet-blobbo-cta\b/.test(clone.selector)) {
        d.value = d.value.replace(/--barracks-state-danger/g, "--barracks-action");
        if (d.prop === "color") d.value = d.value.replace(/--barracks-text-raised/g, "--barracks-action-text");
      }
      // Theme-preset preview gradients use the preset's own inline colours, which the theme audit rightly rejects.
      if (/gradient\([^;]*var\(--preview-/.test(d.value)) d.remove();
    });
    if (!clone.nodes.length) return;
    let node = clone;
    for (let p = rule.parent; p && p.type !== "root"; p = p.parent) {
      if (p.type === "atrule") node = p.clone({ nodes: [] }).append(node);
      else { node = null; break; }
    }
    if (!node) return;
    chunk.push(node);
    rules++;
  });
  if (chunk.length) {
    outRoot.append(postcss.comment({ text: ` upstream ${file.replace("apps/web/src/", "")} ` }));
    chunk.forEach((n) => { outRoot.append(n); track(n); });
  }
}
for (const [, root] of upRoots) root.walkAtRules(/keyframes$/i, (a) => {
  const n = a.params.trim();
  if (!usedAnims.has(n) || ourKeyframes.has(n) || definedVars.has(`@kf:${n}`)) return;
  definedVars.add(`@kf:${n}`);
  const k = a.clone();
  k.walkDecls((d) => { d.value = convertValue(d.value, d.prop); });
  outRoot.append(k);
  track(k);
});
// Merge adjacent identical at-rule wrappers.
outRoot.each((n) => {
  if (n.type !== "atrule") return;
  let next = n.next();
  while (next && next.type === "atrule" && next.name === n.name && next.params === n.params) {
    next.each((c) => { n.append(c.clone()); });
    const r = next; next = next.next(); r.remove();
  }
});

// Upstream root variables the ported rules need, mapped for Barracks.
const ROOT_VARS = {
  "--jg-touch-min": "44px",
  "--jg-safe-bottom": "env(safe-area-inset-bottom, 0px)",
  "--jg-tabbar-h": "0px", // Barracks has no bottom tab bar
  "--bs-success": "var(--barracks-state-success)",
  "--bs-warning": "var(--barracks-state-warning)",
  "--bs-danger": "var(--barracks-state-danger)",
};
const INLINE_VARS = new Set(["--jg-blobbo-strip-w", "--preview-primary", "--preview-secondary", "--preview-surface", "--preview-background"]);
// Vars set by upstream on a container Barracks does not render get their upstream value, colour-mapped.
const upVarDefs = new Map();
for (const [, root] of upRoots) root.walkDecls(/^--/, (d) => { if (!upVarDefs.has(d.prop)) upVarDefs.set(d.prop, d.value); });
const rootDecls = [];
const missing = [...usedVars].filter((v) => !ourVars.has(v) && !definedVars.has(v) && !INLINE_VARS.has(v)).sort();
const unresolved = [];
for (const v of missing) {
  if (ROOT_VARS[v]) rootDecls.push([v, ROOT_VARS[v]]);
  else if (upVarDefs.has(v) && !/-rgb$/.test(v)) rootDecls.push([v, convertValue(upVarDefs.get(v), v)]);
  else unresolved.push(v);
}
if (rootDecls.length) {
  const r = postcss.rule({ selector: ":root" });
  rootDecls.forEach(([prop, value]) => r.append(postcss.decl({ prop, value })));
  outRoot.prepend(r);
}
outRoot.prepend(postcss.comment({ text: `
 * Upstream JellyGlance styles for markup Barracks inherited from the 1.4.3 merge but never styled.
 * GENERATED by scripts/port-upstream-css.cjs (npm run upstream:css); do not edit by hand.
 * Only rules whose target is a class no Barracks
 * stylesheet defines, with every raw colour mapped onto a --barracks-* theme token.
 * Imported before the Barracks stylesheets, so Barracks rules win wherever both apply.
 ` }));
fs.writeFileSync(out, outRoot.toString().trim() + "\n");
console.log(JSON.stringify({ orphans: orphans.size, rules, rootVars: rootDecls.map((d) => d[0]), unresolved, unmapped: Object.fromEntries(unmapped) }, null, 1));
