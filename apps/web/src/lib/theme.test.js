import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_THEME,
  contrastRatio,
  ensureContrast,
  mixHex,
  normalizeThemeInput,
  relativeLuminance,
  resolveTheme,
} from "./theme.js";

const SEMANTIC_KEYS = [
  "canvas",
  "nav",
  "surfaceRaised",
  "surfaceInset",
  "surfaceInteractive",
  "overlay",
  "borderSubtle",
  "borderStrong",
  "text",
  "textMuted",
  "textInverse",
  "focus",
  "focusLight",
  "focusDark",
  "action",
  "accentSecondary",
  "live",
  "success",
  "warning",
  "danger",
  "unavailable",
  "chartGrid",
  "chartTooltip",
  "chart1",
  "chart2",
  "chart3",
  "chart4",
  "chart5",
  "chart6",
  "scrim",
  "shadow",
  "actionRgb",
  "accentSecondaryRgb",
  "surfaceRaisedRgb",
];

const STATE_KEYS = ["live", "success", "warning", "danger", "unavailable"];
const CHART_KEYS = ["chart1", "chart2", "chart3", "chart4", "chart5", "chart6"];

function assertAccessibleTokens(tokens) {
  assert.ok(contrastRatio(tokens.text, tokens.canvas) >= 4.5);
  assert.ok(contrastRatio(tokens.textMuted, tokens.canvas) >= 4.5);
  assert.ok(contrastRatio(tokens.textMuted, tokens.surfaceRaised) >= 4.5);
  assert.ok(contrastRatio(tokens.borderStrong, tokens.surfaceInteractive) >= 3);
  for (const key of STATE_KEYS) {
    assert.ok(contrastRatio(tokens[key], tokens.surfaceRaised) >= 3, `${key} is accessible on raised surface`);
  }
  for (const key of CHART_KEYS) {
    assert.ok(contrastRatio(tokens[key], tokens.surfaceInset) >= 3, `${key} is accessible on inset surface`);
  }
}

test("normalizeThemeInput keeps valid siblings and falls back malformed fields individually", () => {
  const cases = [
    [
      "missing input",
      undefined,
      DEFAULT_THEME,
    ],
    [
      "malformed primary",
      { primary: "purple", secondary: "#ABCDEF", background: " #010203 ", surface: "#040506" },
      { primary: DEFAULT_THEME.primary, secondary: "#ABCDEF", background: "#010203", surface: "#040506" },
    ],
    [
      "malformed secondary",
      { primary: "#010203", secondary: 42, background: "#040506", surface: "#070809" },
      { primary: "#010203", secondary: DEFAULT_THEME.secondary, background: "#040506", surface: "#070809" },
    ],
    [
      "malformed background",
      { primary: "#010203", secondary: "#040506", background: "#12345", surface: "#070809" },
      { primary: "#010203", secondary: "#040506", background: DEFAULT_THEME.background, surface: "#070809" },
    ],
    [
      "malformed surface",
      { primary: "#010203", secondary: "#040506", background: "#070809", surface: "#ffffff00" },
      { primary: "#010203", secondary: "#040506", background: "#070809", surface: DEFAULT_THEME.surface },
    ],
  ];

  for (const [name, input, expected] of cases) {
    assert.deepEqual(normalizeThemeInput(input), expected, name);
  }
});

test("mixHex uses rounded linear RGB coefficients", () => {
  const cases = [
    ["#000000", "#ffffff", 0, "#000000"],
    ["#000000", "#ffffff", 0.35, "#595959"],
    ["#102030", "#a0b0c0", 0.25, "#344454"],
    ["#ffffff", "#000000", 0.42, "#949494"],
    ["#102030", "#a0b0c0", 1, "#a0b0c0"],
  ];

  for (const [first, second, weight, expected] of cases) {
    assert.equal(mixHex(first, second, weight), expected);
  }
});

test("relative luminance and contrastRatio follow WCAG calculations", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#ffffff"), 1);
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#ffffff", "#000000"), 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
  assert.ok(Math.abs(contrastRatio("#777777", "#ffffff") - 4.478089453577214) < 1e-12);
});

test("resolveTheme derives every semantic token for the default palette", () => {
  const { input, tokens } = resolveTheme(DEFAULT_THEME);

  assert.deepEqual(input, DEFAULT_THEME);
  for (const key of SEMANTIC_KEYS) {
    assert.ok(Object.hasOwn(tokens, key), `missing semantic token ${key}`);
    assert.equal(typeof tokens[key], "string", `${key} is a CSS string`);
  }

  assert.equal(tokens.canvas, DEFAULT_THEME.background);
  assert.equal(tokens.nav, "#1e1913");
  assert.equal(tokens.surfaceRaised, DEFAULT_THEME.surface);
  assert.equal(tokens.surfaceInset, "#1d1912");
  assert.equal(tokens.surfaceInteractive, "#2f2921");
  assert.equal(tokens.overlay, "#201b13");
  assert.equal(tokens.borderSubtle, "#48423a");
  assert.equal(tokens.text, "#f5f0e7");
  assert.equal(tokens.textInverse, "#10100f");
  assert.equal(tokens.focusLight, "#f5f0e7");
  assert.equal(tokens.focusDark, "#10100f");
  assert.equal(tokens.accentSecondary, DEFAULT_THEME.secondary);
  assert.equal(tokens.chartGrid, tokens.borderSubtle);
  assert.equal(tokens.chartTooltip, tokens.overlay);
  assert.equal(tokens.scrim, "rgba(8, 7, 5, 0.72)");
  assert.equal(tokens.shadow, "0 12px 32px rgba(22, 20, 16, 0.28)");
  assert.equal(tokens.actionRgb, "111, 155, 207");
  assert.equal(tokens.accentSecondaryRgb, "160, 151, 127");
  assert.equal(tokens.surfaceRaisedRgb, "34, 28, 20");
  assertAccessibleTokens(tokens);
});

test("resolveTheme preserves the four public inputs and all token relationships", () => {
  const input = {
    primary: "#123456",
    secondary: "#fedcba",
    background: "#202020",
    surface: "#404040",
  };
  const { input: normalized, tokens } = resolveTheme(input);

  assert.deepEqual(normalized, input);
  assert.equal(tokens.canvas, normalized.background);
  assert.equal(tokens.nav, mixHex(normalized.surface, normalized.background, 0.35));
  assert.equal(tokens.surfaceRaised, normalized.surface);
  assert.equal(tokens.surfaceInset, mixHex(normalized.surface, normalized.background, 0.38));
  assert.equal(tokens.surfaceInteractive, mixHex(normalized.surface, tokens.text, 0.06));
  assert.equal(tokens.overlay, mixHex(normalized.surface, normalized.background, 0.18));
  assert.equal(tokens.borderSubtle, mixHex(normalized.surface, tokens.text, 0.18));
  assert.equal(tokens.borderStrong, ensureContrast(mixHex(tokens.surfaceInteractive, tokens.text, 0.42), tokens.surfaceInteractive, 3));
  assert.equal(tokens.action, ensureContrast(normalized.primary, tokens.surfaceInteractive, 3));
  assert.equal(tokens.focus, ensureContrast(normalized.primary, tokens.surfaceRaised, 3));
  assert.equal(tokens.accentSecondary, normalized.secondary);
  assert.equal(tokens.chartGrid, tokens.borderSubtle);
  assert.equal(tokens.chartTooltip, tokens.overlay);
  assert.equal(tokens.actionRgb, "141, 153, 164");
  assert.equal(tokens.accentSecondaryRgb, "254, 220, 186");
  assert.equal(tokens.surfaceRaisedRgb, "64, 64, 64");
  assertAccessibleTokens(tokens);
});

test("resolveTheme adjusts only inaccessible fixed status and chart candidates", () => {
  const { tokens } = resolveTheme({
    primary: "#222222",
    secondary: "#222222",
    background: "#222222",
    surface: "#222222",
  });
  const statusCandidates = {
    live: "#ff6f63",
    success: "#70b981",
    warning: "#ffa64f",
    danger: "#e45f55",
    unavailable: "#a0977f",
  };
  for (const [key, candidate] of Object.entries(statusCandidates)) {
    if (contrastRatio(candidate, tokens.surfaceRaised) >= 3) {
      assert.equal(tokens[key], candidate);
    } else {
      assert.notEqual(tokens[key], candidate);
      assert.ok(contrastRatio(tokens[key], tokens.surfaceRaised) >= 3);
    }
  }
  assert.ok(contrastRatio(tokens.action, tokens.surfaceInteractive) >= 3);
  assert.ok(contrastRatio(tokens.borderStrong, tokens.surfaceInteractive) >= 3);
  assertAccessibleTokens(tokens);
});

test("resolveTheme keeps contrast guarantees for degenerate custom palettes", () => {
  const palettes = [
    {
      name: "primary equals background",
      primary: "#101010",
      secondary: "#d06b5e",
      background: "#101010",
      surface: "#29231b",
    },
    {
      name: "all inputs match",
      primary: "#222222",
      secondary: "#222222",
      background: "#222222",
      surface: "#222222",
    },
    {
      name: "opposing black and white surfaces",
      primary: "#222222",
      secondary: "#d9b36c",
      background: "#000000",
      surface: "#ffffff",
    },
  ];

  for (const palette of palettes) {
    const { tokens } = resolveTheme(palette);
    assertAccessibleTokens(tokens);
    assert.ok(contrastRatio(tokens.text, tokens.canvas) >= 4.5, `${palette.name}: text/canvas`);
    assert.equal(tokens.focus, ensureContrast(palette.primary, tokens.surfaceRaised, 3), `${palette.name}: focus`);
    assert.equal(tokens.focusLight, "#f5f0e7", `${palette.name}: focus light`);
    assert.equal(tokens.focusDark, "#10100f", `${palette.name}: focus dark`);
    assert.equal(tokens.action, ensureContrast(palette.primary, tokens.surfaceInteractive, 3), `${palette.name}: action`);
  }
});
