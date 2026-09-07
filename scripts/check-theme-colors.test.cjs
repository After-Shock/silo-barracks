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

test("only reports hashes and names in CSS declarations or embedded style and SVG contexts", () => {
  const fixture = createFixture();
  try {
    const css = fixture.write("apps/web/src/context.css", `
#abc { background-image: url(#abcdef); }
.card { color: #fff; background-image: url(http://cdn.example/red.svg); font-family: red; content: "red"; }
`);
    const jsx = fixture.write("apps/web/src/context.jsx", `
const privateValue = this.#abc;
const text = "ticket #abc and red";
const asset = "url(red.svg)";
const arbitrary = "red";
const style = { color: "#def", backgroundColor: "ReD" };
element.style.color = "orange";
const css = "background: #123; color: rgb(1, 2, 3)";
const svg = '<svg fill="#456" stroke="blue"></svg>';
`);
    const result = fixture.audit([css, jsx]);
    assert.deepEqual(values(result), ["#fff", "#def", "ReD", "orange", "#123", "rgb(1, 2, 3)", "#456", "blue"]);
  } finally {
    fixture.cleanup();
  }
});

test("masks comments according to source language without breaking URLs or regexes", () => {
  const fixture = createFixture();
  try {
    const css = fixture.write("apps/web/src/comments-language.css", ".asset { background: url(http://cdn.example/red.svg); color: #abc; }");
    const js = fixture.write("apps/web/src/comments-language.js", `
const pattern = /https?:\\/\\/cdn\\/red/;
const colorPattern = /color: #abc/;
const svgPattern = /fill="#def"/;
if (ready) /fill="#fed"/.test(value);
const factory = () => /color: #bed/;
do /fill="#ace"/;
await /stroke="#f0f"/;
const style = "color: #def";
`);
    const result = fixture.audit([css, js]);
    assert.deepEqual(values(result), ["#abc", "#def"]);
  } finally {
    fixture.cleanup();
  }
});

test("masks regex literals after expression operators without swallowing division", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/operator-regex.js", `
const andValue = ready && /color: #abc/;
const orValue = ready || /fill="#def"/;
const nullishValue = ready ?? /stroke="#fed"/;
const multiplyValue = ready * /color: #bed/;
const remainderValue = ready % /fill="#ace"/;
const plusValue = ready + /stroke="#f0f"/;
const lessValue = ready < /color: #123/;
const equalValue = ready === /fill="#456"/;
const bitValue = ready & /stroke="#789"/;
const notValue = !/color: #987/;
const invertValue = ~ /fill="#654"/;
const ternaryValue = ready ? /stroke="#321"/ : null;
const commaValue = (ready, /color: #fed/);
const assignmentValue = result = /fill="#cba"/;
const ratio = total / 2;
const style = { color: "#abc" };
const later = /stroke="#def"/;
const finalStyle = { color: "#fed" };
`);
    const result = fixture.audit([source]);
    assert.deepEqual(values(result), ["#abc", "#fed"]);
  } finally {
    fixture.cleanup();
  }
});

test("detects colors in named palette arrays and palette objects without scanning arbitrary data", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/palette.jsx", `
const colors = ["#abc", "rgb(1, 2, 3)", "ReD"];
const chartColors = ["#fed"];
const palette = { primary: "#def", "secondary-color": "hsl(20 30% 40%)", label: "blue" };
const metadata = { label: "#123", description: "red" };
const arbitrary = ["#456", "green"];
`);
    const result = fixture.audit([source]);
    assert.deepEqual(values(result), ["#abc", "rgb(1, 2, 3)", "ReD", "#fed", "#def", "hsl(20 30% 40%)"]);
  } finally {
    fixture.cleanup();
  }
});

test("detects quoted and hyphenated CSS-in-JS color keys", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/inline-style.jsx", `
const style = {
  "background-color": "#abc",
  'border-top-color': "rgb(1, 2, 3)",
  "data-value": "red",
};
`);
    const result = fixture.audit([source]);
    assert.deepEqual(values(result), ["#abc", "rgb(1, 2, 3)"]);
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

test("reports literal fallbacks inside semantic var-backed functions", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/fallback.css", ".card { color: rgba(var(--barracks-action-rgb, #fff), .5); }");
    const result = fixture.audit([source]);
    assert.deepEqual(values(result), ["#fff"]);
  } finally {
    fixture.cleanup();
  }
});

test("detects literal gradient stops alongside semantic tokens", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/gradient.css", ".hero { background: linear-gradient(var(--barracks-action), #fff 20%, rgba(0, 0, 0, .4)); }");
    const result = fixture.audit([source]);
    assert.deepEqual(values(result), [
      "linear-gradient(var(--barracks-action), #fff 20%, rgba(0, 0, 0, .4))",
      "#fff",
      "rgba(0, 0, 0, .4)",
    ]);
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

test("enforces gradient token rules independently from literal exceptions and variables allowlists", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/gradient-independent.css", `
.card { background: linear-gradient(var(--brand-start), #fff); }
`);
    const variables = fixture.write("apps/web/src/pages/css/variables.css", `
:root { --barracks-shadow: linear-gradient(var(--brand-start), var(--barracks-action)); }
`);
    const result = fixture.audit([source, variables], [{
      path: "apps/web/src/gradient-independent.css",
      values: ["#fff"],
      reason: "Official embedded provider artwork.",
    }]);
    assert.deepEqual(values(result), [
      "linear-gradient(var(--brand-start), #fff)",
      "linear-gradient(var(--brand-start), var(--barracks-action))",
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("reports literal-only gradients independently from literal exceptions and approved variables", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/literal-gradient.css", `
.card { background: linear-gradient(#abc, #def); }
`);
    const variables = fixture.write("apps/web/src/pages/css/variables.css", `
:root { --barracks-shadow: linear-gradient(#123, #456); }
`);
    const result = fixture.audit([source, variables], [
      {
        path: "apps/web/src/literal-gradient.css",
        values: ["#abc", "#def"],
        reason: "Official provider artwork.",
      },
      {
        path: "apps/web/src/pages/css/variables.css",
        values: ["#123", "#456"],
        reason: "Official provider artwork.",
      },
    ]);
    assert.deepEqual(values(result), [
      "linear-gradient(#abc, #def)",
      "linear-gradient(#123, #456)",
    ]);
    assert.ok(colorViolations(result).every((violation) => /gradient.*literal|literal.*gradient/i.test(violation.message)));
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
    const baseline = fixture.audit([source]);
    assert.deepEqual(values(baseline), ["#ABC"]);
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

test("rejects malformed exception documents and non-color exception values", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/provider-logo.css", ".provider { color: #abc; }");
    const malformed = fixture.audit([source], { exceptions: "not-an-array" });
    assert.ok(malformed.violations.some((violation) => violation.kind === "exception" && /schema/i.test(violation.message)));
    const invalidValue = fixture.audit([source], [{
      path: "apps/web/src/provider-logo.css",
      values: ["not-a-color"],
      reason: "Official provider logo.",
    }]);
    assert.deepEqual(values(invalidValue), ["#abc"]);
    assert.ok(invalidValue.violations.some((violation) => violation.kind === "exception" && /color literal/i.test(violation.message)));
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

test("scans data SVG URL colors while ignoring external URL fragments", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/embedded-images.css", `
.external { background: url(https://cdn.example/logo.svg#abcdef); }
.embedded { background: url("data:image/svg+xml,<svg fill='#abc'><path stroke='red'/></svg>"); }
`);
    const result = fixture.audit([source]);
    assert.deepEqual(values(result), ["#abc", "red"]);
  } finally {
    fixture.cleanup();
  }
});

test("keeps quoted CSS content strings out of the color audit", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/content.css", `
.label {
  content: "#abc";
  content: "rgb(1, 2, 3)";
  color: #def;
}
`);
    const result = fixture.audit([source]);
    assert.deepEqual(values(result), ["#def"]);
  } finally {
    fixture.cleanup();
  }
});

test("reports non-Barracks variables independently from excepted fallbacks", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/non-barracks-fallback.css", ".card { color: rgba(var(--brand, #fff), .5); }");
    const result = fixture.audit([source], [{
      path: "apps/web/src/non-barracks-fallback.css",
      values: ["#fff"],
      reason: "Official provider logo fallback.",
    }]);
    assert.deepEqual(values(result), ["rgba(var(--brand, #fff), .5)"]);
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
    assert.deepEqual(values(result), ["#abc"]);
    assert.ok(!result.scannedFiles.includes(path.relative(fixture.root, outside).replaceAll(path.sep, "/")));
    const exactResult = fixture.audit([exactFile]);
    assert.deepEqual(exactResult.scannedFiles, ["apps/web/src/nested/two.jsx"]);
    assert.deepEqual(values(exactResult), []);
  } finally {
    fixture.cleanup();
  }
});

test("rejects explicit paths whose symlink target escapes the audit root", () => {
  const fixture = createFixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "barracks-theme-colors-outside-"));
  try {
    fixture.write("apps/web/src/placeholder.css", ".placeholder { color: transparent; }");
    const outsideFile = path.join(outside, "outside.css");
    fs.writeFileSync(outsideFile, ".outside { color: #abc; }");
    const link = path.join(fixture.root, "apps/web/src/outside-link.css");
    fs.symlinkSync(outsideFile, link);
    const result = fixture.audit([link]);
    assert.deepEqual(result.scannedFiles, []);
    assert.ok(result.violations.some((violation) => violation.kind === "input" && /symlink|root/i.test(violation.message)));
  } finally {
    fixture.cleanup();
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("rejects invalid files entries without falling back to the default scan", () => {
  const fixture = createFixture();
  try {
    fixture.write("apps/web/src/app.css", ".app { color: #abc; }");
    for (const files of [[null], [""]]) {
      const result = fixture.audit(files);
      assert.deepEqual(result.scannedFiles, []);
      assert.ok(result.violations.some((violation) => violation.kind === "input" && /files entry/i.test(violation.message)));
    }
  } finally {
    fixture.cleanup();
  }
});

test("rejects exception paths that do not resolve to scanned in-scope files", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/app.css", ".app { color: #abc; }");
    const result = fixture.audit([source], [{
      path: "apps/web/src/missing-provider.css",
      values: ["#def"],
      reason: "Official provider artwork.",
    }]);
    assert.ok(result.violations.some((violation) => violation.kind === "exception" && /does not resolve|scanned/i.test(violation.message)));
  } finally {
    fixture.cleanup();
  }
});

test("valid exceptions outside a selected batch remain globally valid and do not expand diagnostics", () => {
  const fixture = createFixture();
  try {
    const selected = fixture.write("apps/web/src/a.css", ".a { color: #abc; }");
    fixture.write("apps/web/src/b.css", ".b { color: #def; }");
    const result = fixture.audit([selected], [{
      path: "apps/web/src/b.css",
      values: ["#def"],
      reason: "Official provider artwork.",
    }]);
    assert.deepEqual(result.scannedFiles, ["apps/web/src/a.css"]);
    assert.deepEqual(values(result), ["#abc"]);
    assert.deepEqual(result.violations.filter((violation) => violation.kind === "exception"), []);
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

test("counts CR-only line endings when reporting positions", () => {
  const fixture = createFixture();
  try {
    const source = fixture.write("apps/web/src/cr-only.css", ".a { color: #abc; }\r.b { color: red; }");
    const result = fixture.audit([source]);
    assert.deepEqual(colorViolations(result).map((violation) => violation.line), [1, 2]);
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

test("CLI exits one with actionable diagnostics for invalid roots and paths", () => {
  const fixture = createFixture();
  try {
    const script = path.resolve(__dirname, "check-theme-colors.cjs");
    const missingRoot = spawnSync(process.execPath, [script, "--root", path.join(fixture.root, "missing")], { encoding: "utf8" });
    assert.equal(missingRoot.status, 1);
    assert.match(missingRoot.stderr, /invalid root/i);
    const missingPath = spawnSync(process.execPath, [script, "missing.css"], { cwd: fixture.root, encoding: "utf8" });
    assert.equal(missingPath.status, 1);
    assert.match(missingPath.stderr, /does not exist|missing/i);
    const outsidePath = path.join(os.tmpdir(), `barracks-theme-colors-outside-${process.pid}.css`);
    fs.writeFileSync(outsidePath, ".outside { color: #abc; }");
    try {
      const outside = spawnSync(process.execPath, [script, outsidePath], { cwd: fixture.root, encoding: "utf8" });
      assert.equal(outside.status, 1);
      assert.match(outside.stderr, /outside the audit root/i);
    } finally {
      fs.rmSync(outsidePath, { force: true });
    }
    const unsupported = path.join(fixture.root, "apps/web/src/app.txt");
    fs.mkdirSync(path.dirname(unsupported), { recursive: true });
    fs.writeFileSync(unsupported, "plain text");
    const unsupportedPath = spawnSync(process.execPath, [script, unsupported], { cwd: fixture.root, encoding: "utf8" });
    assert.equal(unsupportedPath.status, 1);
    assert.match(unsupportedPath.stderr, /unsupported/i);
  } finally {
    fixture.cleanup();
  }
});
