const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { auditSources } = require("./check-theme-colors.cjs");

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "barracks-theme-colors-"));
  return {
    root,
    write(relativePath, contents) {
      const target = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
      return target;
    },
    audit(files, exceptions = []) {
      return auditSources({ root, files, exceptions });
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function values(result) {
  return result.violations
    .filter((violation) => violation.kind === "color")
    .map((violation) => violation.value);
}

function colorViolations(result) {
  return result.violations.filter((violation) => violation.kind === "color");
}

test("detects CSS hex and functional color grammars", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/colors.css", `
.palette {
  color: #abc;
  color: #abcd;
  color: #aabbcc;
  color: #aabbccdd;
  color: rgb(1 2 3);
  color: RGBA(1, 2, 3, 0.5);
  color: hsl(20deg 30% 40%);
  color: hsla(20, 30%, 40%, .5);
  color: hwb(20deg 10% 20% / .5);
  color: lab(50% 20 30 / .5);
  color: lch(50% 20 30 / .5);
  color: oklab(60% .1 .2 / .5);
  color: oklch(60% .1 .2 / .5);
  color: color(display-p3 1 0 0 / .5);
}
`);
    const result = fixture.audit([source]);
    assert.deepEqual(values(result), [
      "#abc",
      "#abcd",
      "#aabbcc",
      "#aabbccdd",
      "rgb(1 2 3)",
      "RGBA(1, 2, 3, 0.5)",
      "hsl(20deg 30% 40%)",
      "hsla(20, 30%, 40%, .5)",
      "hwb(20deg 10% 20% / .5)",
      "lab(50% 20 30 / .5)",
      "lch(50% 20 30 / .5)",
      "oklab(60% .1 .2 / .5)",
      "oklch(60% .1 .2 / .5)",
      "color(display-p3 1 0 0 / .5)",
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("detects case-insensitive CSS named colors", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/named.css", ".palette { color: ReD; background: CornflowerBlue; border-color: DARKslateGray; }");
    const result = fixture.audit([source]);
    assert.deepEqual(values(result), ["ReD", "CornflowerBlue", "DARKslateGray"]);
  } finally {
    fixture.cleanup();
  }
});

test("allows CSS keywords, custom properties, and token-only gradients", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/allowed.css", `
.allowed {
  color: transparent;
  border-color: currentColor;
  outline-color: inherit;
  accent-color: initial;
  caret-color: unset;
  background: var(--any-theme-value);
  box-shadow: 0 0 8px rgba(var(--barracks-action-rgb), .5);
  background-image: linear-gradient(var(--barracks-action), var(--barracks-surface-raised));
}
`);
    const result = fixture.audit([source]);
    assert.deepEqual(colorViolations(result), []);
  } finally {
    fixture.cleanup();
  }
});

test("detects literal gradient stops alongside semantic tokens", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/gradient.css", ".hero { background: linear-gradient(var(--barracks-action), #fff 20%, rgba(0, 0, 0, .4)); }");
    const result = fixture.audit([source]);
    assert.deepEqual(values(result), ["#fff", "rgba(0, 0, 0, .4)"]);
  } finally {
    fixture.cleanup();
  }
});

test("rejects gradients that reference non-Barracks custom properties", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/gradient-vars.css", ".hero { background: linear-gradient(var(--brand-start), var(--barracks-action)); }");
    const result = fixture.audit([source]);
    assert.deepEqual(values(result), ["linear-gradient(var(--brand-start), var(--barracks-action))"]);
  } finally {
    fixture.cleanup();
  }
});

test("ignores comments while preserving diagnostic line numbers", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/comments.css", `/* hidden #bad */
.card {
  /* hidden rgba(0, 0, 0, 1) */
  color: #abc;
}
`);
    const result = fixture.audit([source]);
    assert.equal(colorViolations(result).length, 1);
    assert.equal(colorViolations(result)[0].value, "#abc");
    assert.equal(colorViolations(result)[0].line, 4);
  } finally {
    fixture.cleanup();
  }
});

test("detects quoted embedded CSS and SVG literals in JSX", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/Icon.jsx", `
const style = "background: #abc; color: rgb(1, 2, 3)";
const icon = \`<svg fill="#def"><path stroke='ReD' /></svg>\`;
export default () => <div style={{ color: "hsl(20 30% 40%)" }}>{icon}</div>;
`);
    const result = fixture.audit([source]);
    assert.deepEqual(values(result), ["#abc", "rgb(1, 2, 3)", "#def", "ReD", "hsl(20 30% 40%)"]);
    assert.deepEqual(colorViolations(result).map((violation) => violation.line), [2, 2, 3, 3, 4]);
  } finally {
    fixture.cleanup();
  }
});

test("allows literals only on approved variables.css declarations", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/pages/css/variables.css", `
:root {
  --barracks-canvas: #161410;
  --barracks-shadow: 0 12px 32px rgba(22, 20, 16, .28);
  --barracks-action-rgb: 111, 155, 207;
  --primary-light-color: hsl(210 40% 75%);
  --primary-light-rgb: 167, 191, 217;
}
`);
    const result = fixture.audit([source]);
    assert.deepEqual(colorViolations(result), []);
  } finally {
    fixture.cleanup();
  }
});

test("rejects literals on unknown variables.css declarations", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/pages/css/variables.css", `
:root {
  --unknown-color: #fff;
  color: red;
}
`);
    const result = fixture.audit([source]);
    assert.deepEqual(values(result), ["#fff", "red"]);
  } finally {
    fixture.cleanup();
  }
});

test("suppresses only an approved exact file and literal exception", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/provider-logo.css", ".provider { background-image: url(data:image/svg+xml,<svg fill='#ABC'/>); }");
    const result = fixture.audit([source], [{
      path: "apps/web/src/provider-logo.css",
      values: ["#abc"],
      reason: "Official provider logo embedded in the provider badge.",
    }]);
    assert.deepEqual(colorViolations(result), []);
  } finally {
    fixture.cleanup();
  }
});

test("rejects wildcard-like exception paths and does not match them", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/provider-logo.css", ".provider { color: #abc; }");
    const result = fixture.audit([source], [{
      file: "apps/web/src/*.css",
      values: ["#abc"],
      reason: "Provider brand color.",
    }]);
    assert.deepEqual(values(result), ["#abc"]);
    assert.ok(result.violations.some((violation) => violation.kind === "exception" && /wildcard/i.test(violation.message)));
  } finally {
    fixture.cleanup();
  }
});

test("rejects exceptions with missing reasons", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/provider-logo.css", ".provider { color: #abc; }");
    const result = fixture.audit([source], [{
      file: "apps/web/src/provider-logo.css",
      values: ["#abc"],
    }]);
    assert.deepEqual(values(result), ["#abc"]);
    assert.ok(result.violations.some((violation) => violation.kind === "exception" && /reason|purpose/i.test(violation.message)));
  } finally {
    fixture.cleanup();
  }
});

test("does not suppress mismatched exception paths or values", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/provider-logo.css", ".provider { color: #abc; }");
    const result = fixture.audit([source], [
      { file: "apps/web/src/other.css", values: ["#abc"], reason: "Provider brand color." },
      { file: "apps/web/src/provider-logo.css", values: ["#def"], reason: "Provider brand color." },
    ]);
    assert.deepEqual(values(result), ["#abc"]);
  } finally {
    fixture.cleanup();
  }
});

test("excludes public, generated, dependency, and theme resolver sources by default", () => {
  const fixture = createFixture();
  try {
    fixture.write("apps/web/public/logo.css", ".logo { color: #public; }");
    fixture.write("apps/web/dist/bundle.css", ".bundle { color: #bad; }");
    fixture.write("apps/web/generated/generated.css", ".generated { color: #bad; }");
    fixture.write("node_modules/example/index.css", ".dependency { color: #bad; }");
    fixture.write("apps/web/src/lib/theme.js", "export const theme = '#resolver';");
    fixture.write("apps/web/src/app.css", ".app { color: #abc; }");
    const result = fixture.audit();
    assert.deepEqual(result.scannedFiles, ["apps/web/src/app.css"]);
    assert.deepEqual(values(result), ["#abc"]);
  } finally {
    fixture.cleanup();
  }
});

test("directory and exact-file arguments constrain recursive scans", () => {
  const fixture = createFixture();
  try {
    const directory = fixture.write("apps/web/src/nested/one.css", ".one { color: #abc; }");
    const exactFile = fixture.write("apps/web/src/nested/two.jsx", "export const two = '#def';");
    const outside = fixture.write("apps/web/src/outside.css", ".outside { color: #ghi; }");
    const result = fixture.audit([path.dirname(directory)]);
    assert.deepEqual(result.scannedFiles, [
      "apps/web/src/nested/one.css",
      "apps/web/src/nested/two.jsx",
    ]);
    assert.deepEqual(values(result), ["#abc", "#def"]);
    assert.ok(!result.scannedFiles.includes(path.relative(fixture.root, outside).replaceAll(path.sep, "/")));
    const exactResult = fixture.audit([exactFile]);
    assert.deepEqual(exactResult.scannedFiles, ["apps/web/src/nested/two.jsx"]);
    assert.deepEqual(values(exactResult), ["#def"]);
  } finally {
    fixture.cleanup();
  }
});

test("sorts diagnostics and exposes stable file, line, and value fields", () => {
  const fixture = createFixture();
  try {
    fixture.write("apps/web/src/z.css", ".z { color: #def; }");
    fixture.write("apps/web/src/a.css", ".a { color: #abc; }\n.b { color: red; }");
    const result = fixture.audit();
    assert.deepEqual(result.violations.map(({ file, line, value }) => ({ file, line, value })), [
      { file: "apps/web/src/a.css", line: 1, value: "#abc" },
      { file: "apps/web/src/a.css", line: 2, value: "red" },
      { file: "apps/web/src/z.css", line: 1, value: "#def" },
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("CLI exits one and prints actionable diagnostics for violations", () => {
  const fixture = createFixture();
  try {
    fixture.write("apps/web/src/app.css", ".app { color: #abc; }");
    const script = path.resolve(__dirname, "check-theme-colors.cjs");
    const run = spawnSync(process.execPath, [script], { cwd: fixture.root, encoding: "utf8" });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /apps\/web\/src\/app\.css:1:.*#abc/);
  } finally {
    fixture.cleanup();
  }
});
