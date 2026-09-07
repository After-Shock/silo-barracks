import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_THEME,
  LEGACY_THEME_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyTheme,
  contrastRatio,
  ensureContrast,
  getStoredTheme,
  getThemeTokens,
  mixHex,
  normalizeThemeInput,
  relativeLuminance,
  resetTheme,
  resolveTheme,
  saveTheme,
} from "./theme.js";

const SEMANTIC_KEYS = [
  "canvas",
  "nav",
  "surfaceRaised",
  "surfaceInset",
  "surfaceInteractive",
  "overlay",
  "borderSubtle",
  "borderCanvas",
  "borderRaised",
  "borderInset",
  "borderStrong",
  "borderNav",
  "borderOverlay",
  "text",
  "textRaised",
  "textInset",
  "textInteractive",
  "textNav",
  "textOverlay",
  "textMuted",
  "textMutedRaised",
  "textInverse",
  "focus",
  "focusLight",
  "focusDark",
  "action",
  "actionText",
  "actionForeground",
  "accentSecondary",
  "live",
  "success",
  "warning",
  "danger",
  "dangerInteractive",
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
const WARM_TEXT_LIGHT = "#f5f0e7";
const WARM_TEXT_DARK = "#10100f";
const PURE_TEXT_LIGHT = "#ffffff";
const PURE_TEXT_DARK = "#000000";

function expectedNormalText(background) {
  const warmLightContrast = contrastRatio(WARM_TEXT_LIGHT, background);
  const warmDarkContrast = contrastRatio(WARM_TEXT_DARK, background);
  if (Math.max(warmLightContrast, warmDarkContrast) >= 4.5) {
    return warmLightContrast >= warmDarkContrast ? WARM_TEXT_LIGHT : WARM_TEXT_DARK;
  }

  return contrastRatio(PURE_TEXT_LIGHT, background) >= contrastRatio(PURE_TEXT_DARK, background)
    ? PURE_TEXT_LIGHT
    : PURE_TEXT_DARK;
}

function createStorage(initial = {}, { getItem, setItem, removeItem } = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    calls,
    getItem(key) {
      calls.push(["getItem", key]);
      return getItem ? getItem(key, values) : (values.has(key) ? values.get(key) : null);
    },
    setItem(key, value) {
      calls.push(["setItem", key, value]);
      if (setItem) {
        return setItem(key, value, values);
      }
      values.set(key, value);
      return undefined;
    },
    removeItem(key) {
      calls.push(["removeItem", key]);
      if (removeItem) {
        return removeItem(key, values);
      }
      values.delete(key);
      return undefined;
    },
  };
}

function createRoot(log = []) {
  const values = new Map();
  return {
    log,
    style: {
      colorScheme: "",
      values,
      setProperty(name, value) {
        log.push(["set", name, value]);
        values.set(name, value);
      },
    },
  };
}

function createEventTarget(log = []) {
  return {
    log,
    dispatchEvent(event) {
      log.push(["event", event.type, event.detail]);
      return true;
    },
  };
}

function assertAccessibleTokens(tokens) {
  assert.ok(contrastRatio(tokens.text, tokens.canvas) >= 4.5);
  for (const [textKey, surfaceKey] of [
    ["textRaised", "surfaceRaised"],
    ["textInset", "surfaceInset"],
    ["textInteractive", "surfaceInteractive"],
    ["textNav", "nav"],
    ["textOverlay", "overlay"],
  ]) {
    assert.ok(contrastRatio(tokens[textKey], tokens[surfaceKey]) >= 4.5, `${textKey} is accessible on ${surfaceKey}`);
  }
  assert.ok(contrastRatio(tokens.textMuted, tokens.canvas) >= 4.5);
  assert.ok(contrastRatio(tokens.textMutedRaised, tokens.surfaceRaised) >= 4.5);
  for (const [borderKey, surfaceKey] of [
    ["borderCanvas", "canvas"],
    ["borderRaised", "surfaceRaised"],
    ["borderInset", "surfaceInset"],
    ["borderStrong", "surfaceInteractive"],
    ["borderNav", "nav"],
    ["borderOverlay", "overlay"],
  ]) {
    assert.ok(contrastRatio(tokens[borderKey], tokens[surfaceKey]) >= 3, `${borderKey} is visible on ${surfaceKey}`);
  }
  assert.ok(contrastRatio(tokens.danger, tokens.surfaceRaised) >= 3);
  assert.ok(contrastRatio(tokens.dangerInteractive, tokens.surfaceInteractive) >= 3);
  assert.ok(contrastRatio(tokens.action, tokens.surfaceInteractive) >= 3);
  assert.ok(contrastRatio(tokens.actionText, tokens.action) >= 4.5);
  assert.ok(contrastRatio(tokens.actionForeground, tokens.canvas) >= 4.5);
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
  assert.equal(tokens.borderCanvas, "#74706a");
  assert.equal(tokens.borderRaised, "#7b756d");
  assert.equal(tokens.borderInset, "#78736b");
  assert.equal(tokens.borderStrong, "#827d74");
  assert.equal(tokens.borderNav, "#78736c");
  assert.equal(tokens.borderOverlay, "#79746c");
  assert.equal(tokens.text, "#f5f0e7");
  assert.equal(tokens.textRaised, "#f5f0e7");
  assert.equal(tokens.textInset, "#f5f0e7");
  assert.equal(tokens.textInteractive, "#f5f0e7");
  assert.equal(tokens.textNav, "#f5f0e7");
  assert.equal(tokens.textOverlay, "#f5f0e7");
  assert.equal(tokens.textMuted, "#817e77");
  assert.equal(tokens.textMutedRaised, "#89847b");
  assert.equal(tokens.textInverse, "#10100f");
  assert.equal(tokens.focusLight, "#f5f0e7");
  assert.equal(tokens.focusDark, "#10100f");
  assert.equal(tokens.action, DEFAULT_THEME.primary);
  assert.equal(tokens.actionText, "#10100f");
  assert.equal(tokens.actionForeground, "#6f9bcf");
  assert.equal(tokens.dangerInteractive, "#e45f55");
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
  for (const [textKey, surfaceKey] of [
    ["textRaised", "surfaceRaised"],
    ["textInset", "surfaceInset"],
    ["textInteractive", "surfaceInteractive"],
    ["textNav", "nav"],
    ["textOverlay", "overlay"],
  ]) {
    const surface = tokens[surfaceKey];
    assert.equal(tokens[textKey], expectedNormalText(surface), `${textKey} uses strongest endpoint for ${surfaceKey}`);
  }
  assert.equal(tokens.borderSubtle, mixHex(tokens.surfaceRaised, tokens.textRaised, 0.18));
  for (const [borderKey, surfaceKey, textKey] of [
    ["borderCanvas", "canvas", "text"],
    ["borderRaised", "surfaceRaised", "textRaised"],
    ["borderInset", "surfaceInset", "textInset"],
    ["borderStrong", "surfaceInteractive", "textInteractive"],
    ["borderNav", "nav", "textNav"],
    ["borderOverlay", "overlay", "textOverlay"],
  ]) {
    assert.equal(
      tokens[borderKey],
      ensureContrast(mixHex(tokens[surfaceKey], tokens[textKey], 0.42), tokens[surfaceKey], 3),
      `${borderKey} starts from its named surface/text pair`,
    );
  }
  assert.equal(tokens.dangerInteractive, ensureContrast("#e45f55", tokens.surfaceInteractive, 3));
  assert.ok(contrastRatio(tokens.danger, tokens.surfaceRaised) >= 3);
  assert.ok(contrastRatio(tokens.dangerInteractive, tokens.surfaceInteractive) >= 3);
  assert.ok(contrastRatio(tokens.action, tokens.surfaceInteractive) >= 3);
  assert.ok(contrastRatio(tokens.actionText, tokens.action) >= 4.5);
  assert.equal(tokens.actionForeground, ensureContrast(normalized.primary, normalized.background, 4.5));
  assert.equal(tokens.focus, ensureContrast(normalized.primary, tokens.surfaceRaised, 3));
  assert.equal(tokens.accentSecondary, normalized.secondary);
  assert.equal(tokens.chartGrid, tokens.borderSubtle);
  assert.equal(tokens.chartTooltip, tokens.overlay);
  assert.equal(tokens.actionRgb, "141, 153, 164");
  assert.equal(tokens.accentSecondaryRgb, "254, 220, 186");
  assert.equal(tokens.surfaceRaisedRgb, "64, 64, 64");
  assertAccessibleTokens(tokens);
});

test("resolveTheme falls back to pure endpoints for saturated midtone surfaces", () => {
  const { tokens } = resolveTheme({
    primary: "#224466",
    secondary: "#cc8844",
    background: "#7c0e19",
    surface: "#825ec1",
  });

  for (const [textKey, surfaceKey] of [
    ["text", "canvas"],
    ["textRaised", "surfaceRaised"],
    ["textInset", "surfaceInset"],
    ["textInteractive", "surfaceInteractive"],
    ["textNav", "nav"],
    ["textOverlay", "overlay"],
  ]) {
    assert.equal(tokens[textKey], expectedNormalText(tokens[surfaceKey]), `${textKey} selects the strongest accessible endpoint`);
  }

  const warmCanvas = contrastRatio(WARM_TEXT_LIGHT, tokens.canvas) >= contrastRatio(WARM_TEXT_DARK, tokens.canvas)
    ? WARM_TEXT_LIGHT
    : WARM_TEXT_DARK;
  assert.equal(tokens.textInverse, warmCanvas === WARM_TEXT_LIGHT ? WARM_TEXT_DARK : WARM_TEXT_LIGHT);
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
  assert.ok(contrastRatio(tokens.actionText, tokens.action) >= 4.5);
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
    assert.ok(contrastRatio(tokens.action, tokens.surfaceInteractive) >= 3, `${palette.name}: action`);
    assert.ok(contrastRatio(tokens.actionText, tokens.action) >= 4.5, `${palette.name}: action text`);
    assert.equal(tokens.actionForeground, ensureContrast(palette.primary, palette.background, 4.5), `${palette.name}: action foreground`);
    assert.ok(contrastRatio(tokens.actionForeground, tokens.canvas) >= 4.5, `${palette.name}: action foreground contrast`);
  }
});

test("resolveTheme chooses accessible action pairs for opposing and deterministic random palettes", () => {
  const palettes = [
    {
      name: "opposing black and white surfaces",
      primary: "#222222",
      secondary: "#d9b36c",
      background: "#000000",
      surface: "#ffffff",
    },
    {
      name: "dark action on light interactive",
      primary: "#101010",
      secondary: "#d06b5e",
      background: "#101010",
      surface: "#ffffff",
    },
    {
      name: "light action on dark interactive",
      primary: "#eeeeee",
      secondary: "#d06b5e",
      background: "#000000",
      surface: "#101010",
    },
  ];
  const channel = (seed) => ((seed * 73 + 41) % 256).toString(16).padStart(2, "0");
  for (let index = 0; index < 24; index += 1) {
    const canvasTone = index % 2 === 0 ? 16 + ((index * 37) % 48) : 192 + ((index * 37) % 48);
    const surfaceTone = index % 2 === 0 ? 24 + ((index * 29) % 56) : 200 + ((index * 29) % 48);
    const canvas = canvasTone.toString(16).padStart(2, "0");
    const surface = surfaceTone.toString(16).padStart(2, "0");
    palettes.push({
      name: `seeded palette ${index}`,
      primary: `#${channel(index + 1)}${channel(index + 11)}${channel(index + 23)}`,
      secondary: `#${channel(index + 31)}${channel(index + 43)}${channel(index + 59)}`,
      background: `#${canvas}${canvas}${canvas}`,
      surface: `#${surface}${surface}${surface}`,
    });
  }

  for (const palette of palettes) {
    const { tokens } = resolveTheme(palette);
    assertAccessibleTokens(tokens);
    assert.ok(contrastRatio(tokens.action, tokens.surfaceInteractive) >= 3, `${palette.name}: action contrast`);
    assert.ok(contrastRatio(tokens.actionText, tokens.action) >= 4.5, `${palette.name}: action text contrast`);
    assert.ok(contrastRatio(tokens.actionForeground, tokens.canvas) >= 4.5, `${palette.name}: action foreground contrast`);
  }
});

test("resolveTheme keeps normal and muted text readable for seeded saturated palettes", () => {
  const palettes = [
    {
      name: "seeded saturated blue",
      primary: "#bf3c79",
      secondary: "#20cf87",
      background: "#2078c9",
      surface: "#2083af",
    },
    {
      name: "seeded saturated violet",
      primary: "#e08a2e",
      secondary: "#2ac6d8",
      background: "#2e78d6",
      surface: "#2083af",
    },
    {
      name: "seeded saturated teal",
      primary: "#d650a0",
      secondary: "#f3c243",
      background: "#2078c9",
      surface: "#2783af",
    },
  ];

  for (const palette of palettes) {
    const { tokens } = resolveTheme(palette);
    for (const [textKey, surfaceKey] of [
      ["text", "canvas"],
      ["textRaised", "surfaceRaised"],
      ["textInset", "surfaceInset"],
      ["textInteractive", "surfaceInteractive"],
      ["textNav", "nav"],
      ["textOverlay", "overlay"],
    ]) {
      assert.ok(contrastRatio(tokens[textKey], tokens[surfaceKey]) >= 4.5, `${palette.name}: ${textKey}`);
    }
    assert.ok(contrastRatio(tokens.textMuted, tokens.canvas) >= 4.5, `${palette.name}: textMuted`);
    assert.ok(contrastRatio(tokens.textMutedRaised, tokens.surfaceRaised) >= 4.5, `${palette.name}: textMutedRaised`);
    for (const [borderKey, surfaceKey] of [
      ["borderCanvas", "canvas"],
      ["borderRaised", "surfaceRaised"],
      ["borderInset", "surfaceInset"],
      ["borderStrong", "surfaceInteractive"],
      ["borderNav", "nav"],
      ["borderOverlay", "overlay"],
    ]) {
      assert.ok(contrastRatio(tokens[borderKey], tokens[surfaceKey]) >= 3, `${palette.name}: ${borderKey}`);
    }
    assert.ok(contrastRatio(tokens.danger, tokens.surfaceRaised) >= 3, `${palette.name}: danger`);
    assert.ok(contrastRatio(tokens.dangerInteractive, tokens.surfaceInteractive) >= 3, `${palette.name}: dangerInteractive`);
  }
});

test("resolveTheme gives vivid custom palettes separate readable muted text roles", () => {
  const { tokens } = resolveTheme({
    primary: "#8caaac",
    secondary: "#9d1c7b",
    background: "#347008",
    surface: "#6ec621",
  });

  assert.ok(contrastRatio(tokens.textMuted, tokens.canvas) >= 4.5);
  assert.ok(contrastRatio(tokens.textMutedRaised, tokens.surfaceRaised) >= 4.5);
  assert.notEqual(tokens.textMuted, tokens.textMutedRaised);
  assertAccessibleTokens(tokens);
});

test("getStoredTheme validates each persisted field, ignores unknown fields, and falls back on read errors", () => {
  const storage = createStorage({
    [THEME_STORAGE_KEY]: JSON.stringify({
      primary: "invalid",
      secondary: " #010203 ",
      background: 42,
      surface: "#040506",
      ignored: "#abcdef",
    }),
  });
  assert.deepEqual(getStoredTheme({ storage }), {
    primary: DEFAULT_THEME.primary,
    secondary: "#010203",
    background: DEFAULT_THEME.background,
    surface: "#040506",
  });

  const failedStorage = createStorage({}, {
    getItem() {
      throw new Error("storage unavailable");
    },
  });
  assert.deepEqual(getStoredTheme({ storage: failedStorage }), DEFAULT_THEME);
});

test("applyTheme(undefined) loads the injected stored theme and emits no event", () => {
  const theme = { primary: "#123456", secondary: "#654321", background: "#202020", surface: "#303030" };
  const storage = createStorage({ [THEME_STORAGE_KEY]: JSON.stringify(theme) });
  const root = createRoot();
  const eventLog = [];
  const eventTarget = createEventTarget(eventLog);
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    enumerable: previousWindow?.enumerable ?? false,
    writable: true,
    value: eventTarget,
  });

  try {
    applyTheme(undefined, { storage, root });
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      delete globalThis.window;
    }
  }

  assert.deepEqual(getThemeTokens(), resolveTheme(theme).tokens);
  assert.equal(eventLog.length, 0);
  assert.ok(root.style.values.has("--barracks-canvas"));
});

test("applyTheme calculates the complete palette before the first style write", () => {
  const reads = new Set();
  const theme = {};
  for (const [key, value] of Object.entries({
    primary: "#123456",
    secondary: "#654321",
    background: "#202020",
    surface: "#303030",
  })) {
    Object.defineProperty(theme, key, {
      get() {
        reads.add(key);
        return value;
      },
    });
  }
  const root = createRoot();
  const expectedReads = ["primary", "secondary", "background", "surface"];
  let firstWriteReads;
  const originalSetProperty = root.style.setProperty;
  root.style.setProperty = (...args) => {
    firstWriteReads = [...reads];
    originalSetProperty.apply(root.style, args);
  };

  applyTheme(theme, { root, storage: createStorage() });

  assert.deepEqual(firstWriteReads.sort(), expectedReads.sort());
});

test("applyTheme writes semantic tokens, RGB companions, and legacy aliases as one complete map", () => {
  const root = createRoot();
  const theme = { primary: "#123456", secondary: "#fedcba", background: "#202020", surface: "#404040" };
  const { tokens } = resolveTheme(theme);
  applyTheme(theme, { root, storage: createStorage() });
  const values = root.style.values;
  const expected = {
    "--barracks-canvas": tokens.canvas,
    "--barracks-nav": tokens.nav,
    "--barracks-surface-raised": tokens.surfaceRaised,
    "--barracks-surface-inset": tokens.surfaceInset,
    "--barracks-surface-interactive": tokens.surfaceInteractive,
    "--barracks-overlay": tokens.overlay,
    "--barracks-border-subtle": tokens.borderSubtle,
    "--barracks-border-canvas": tokens.borderCanvas,
    "--barracks-border-raised": tokens.borderRaised,
    "--barracks-border-inset": tokens.borderInset,
    "--barracks-border-strong": tokens.borderStrong,
    "--barracks-border-nav": tokens.borderNav,
    "--barracks-border-overlay": tokens.borderOverlay,
    "--barracks-text": tokens.text,
    "--barracks-text-raised": tokens.textRaised,
    "--barracks-text-inset": tokens.textInset,
    "--barracks-text-interactive": tokens.textInteractive,
    "--barracks-text-nav": tokens.textNav,
    "--barracks-text-overlay": tokens.textOverlay,
    "--barracks-text-muted": tokens.textMuted,
    "--barracks-text-muted-raised": tokens.textMutedRaised,
    "--barracks-text-inverse": tokens.textInverse,
    "--barracks-focus": tokens.focus,
    "--barracks-focus-light": tokens.focusLight,
    "--barracks-focus-dark": tokens.focusDark,
    "--barracks-action": tokens.action,
    "--barracks-action-text": tokens.actionText,
    "--barracks-action-foreground": tokens.actionForeground,
    "--barracks-accent-secondary": tokens.accentSecondary,
    "--barracks-state-live": tokens.live,
    "--barracks-state-success": tokens.success,
    "--barracks-state-warning": tokens.warning,
    "--barracks-state-danger": tokens.danger,
    "--barracks-state-danger-interactive": tokens.dangerInteractive,
    "--barracks-state-unavailable": tokens.unavailable,
    "--barracks-chart-grid": tokens.chartGrid,
    "--barracks-chart-tooltip": tokens.chartTooltip,
    "--barracks-chart-1": tokens.chart1,
    "--barracks-chart-2": tokens.chart2,
    "--barracks-chart-3": tokens.chart3,
    "--barracks-chart-4": tokens.chart4,
    "--barracks-chart-5": tokens.chart5,
    "--barracks-chart-6": tokens.chart6,
    "--barracks-scrim": tokens.scrim,
    "--barracks-shadow": tokens.shadow,
    "--barracks-action-rgb": tokens.actionRgb,
    "--barracks-accent-secondary-rgb": tokens.accentSecondaryRgb,
    "--barracks-surface-raised-rgb": tokens.surfaceRaisedRgb,
    "--primary-color": tokens.action,
    "--primary-rgb": tokens.actionRgb,
    "--primary-light-color": mixHex(tokens.action, tokens.focusLight, 0.42),
    "--primary-light-rgb": "185, 190, 192",
    "--primary-dark-color": mixHex(tokens.action, tokens.focusDark, 0.28),
    "--secondary-color": tokens.accentSecondary,
    "--secondary-rgb": tokens.accentSecondaryRgb,
    "--background-color": tokens.canvas,
    "--secondary-background-color": tokens.surfaceRaised,
    "--tertiary-background-color": tokens.surfaceInteractive,
    "--surface-color": `rgba(${tokens.surfaceRaisedRgb}, 0.86)`,
    "--surface-border-color": tokens.borderSubtle,
    "--text-color": tokens.text,
    "--muted-text-color": tokens.textMuted,
    "--subtle-text-color": tokens.unavailable,
  };
  assert.deepEqual(Object.fromEntries(values), expected);
});

test("getThemeTokens returns a defensive copy of the last applied tokens", () => {
  const root = createRoot();
  applyTheme(DEFAULT_THEME, { root, storage: createStorage() });
  const first = getThemeTokens();
  first.canvas = "#000000";
  const second = getThemeTokens();
  assert.notEqual(first, second);
  assert.equal(second.canvas, resolveTheme(DEFAULT_THEME).tokens.canvas);
});

test("applyTheme chooses a matching color scheme for dark and light canvases", () => {
  const darkRoot = createRoot();
  applyTheme(DEFAULT_THEME, { root: darkRoot, storage: createStorage() });
  assert.equal(darkRoot.style.colorScheme, "dark");

  const lightRoot = createRoot();
  applyTheme({ primary: "#123456", secondary: "#654321", background: "#ffffff", surface: "#f0f0f0" }, {
    root: lightRoot,
    storage: createStorage(),
  });
  assert.equal(lightRoot.style.colorScheme, "light");
});

test("saveTheme applies before emitting normalized and resolved theme events", () => {
  const log = [];
  const root = createRoot(log);
  const eventTarget = createEventTarget(log);
  const storage = createStorage();
  const theme = { primary: "invalid", secondary: " #010203 ", background: 42, surface: "#040506", ignored: true };
  const normalized = { primary: DEFAULT_THEME.primary, secondary: "#010203", background: DEFAULT_THEME.background, surface: "#040506" };

  assert.deepEqual(saveTheme(theme, { storage, root, eventTarget }), normalized);
  assert.deepEqual(log.filter(([type]) => type === "event"), [
    ["event", "jellyglance-theme-updated", normalized],
    ["event", "silo-barracks-theme-updated", resolveTheme(normalized).tokens],
  ]);
  assert.ok(log.findIndex(([type, name]) => type === "set" && name === "--barracks-canvas") < log.findIndex(([type, name]) => type === "event" && name === "silo-barracks-theme-updated"));
});

test("resetTheme returns defaults and emits each exact event once after application", () => {
  const log = [];
  const root = createRoot(log);
  const eventTarget = createEventTarget(log);
  const storage = createStorage({ [THEME_STORAGE_KEY]: JSON.stringify({ primary: "#123456" }) });

  assert.deepEqual(resetTheme({ storage, root, eventTarget }), DEFAULT_THEME);
  assert.deepEqual(log.filter(([type]) => type === "event"), [
    ["event", "jellyglance-theme-updated", DEFAULT_THEME],
    ["event", "silo-barracks-theme-updated", resolveTheme(DEFAULT_THEME).tokens],
  ]);
  assert.equal(log.filter(([type, name]) => type === "event" && name === "jellyglance-theme-updated").length, 1);
  assert.equal(log.filter(([type, name]) => type === "event" && name === "silo-barracks-theme-updated").length, 1);
});

test("resetTheme persists defaults so a legacy theme cannot re-migrate after reload", () => {
  const legacyTheme = { primary: "#123456", secondary: "#654321", background: "#202020", surface: "#303030" };
  const storage = createStorage({ [LEGACY_THEME_STORAGE_KEY]: JSON.stringify(legacyTheme) });
  const root = createRoot();
  const eventTarget = createEventTarget();

  resetTheme({ storage, root, eventTarget });

  assert.deepEqual(storage.calls.filter(([operation, key]) => operation === "setItem" && key === THEME_STORAGE_KEY), [
    ["setItem", THEME_STORAGE_KEY, JSON.stringify(DEFAULT_THEME)],
  ]);
  assert.deepEqual(getStoredTheme({ storage }), DEFAULT_THEME);
  assert.equal(root.style.values.get("--barracks-canvas"), DEFAULT_THEME.background);
});

test("failed storage writes and removals do not prevent applying themes in memory", () => {
  const saveRoot = createRoot();
  const saveEvents = createEventTarget();
  const failingStorage = createStorage({}, {
    setItem() {
      throw new Error("quota exceeded");
    },
    removeItem() {
      throw new Error("storage unavailable");
    },
  });
  assert.doesNotThrow(() => saveTheme(DEFAULT_THEME, { storage: failingStorage, root: saveRoot, eventTarget: saveEvents }));
  assert.equal(saveRoot.style.values.get("--barracks-canvas"), DEFAULT_THEME.background);
  assert.doesNotThrow(() => resetTheme({ storage: failingStorage, root: saveRoot, eventTarget: saveEvents }));
  assert.equal(saveRoot.style.values.get("--barracks-canvas"), DEFAULT_THEME.background);
  assert.deepEqual(saveEvents.log.map(([, type]) => type), [
    "jellyglance-theme-updated",
    "silo-barracks-theme-updated",
    "jellyglance-theme-updated",
    "silo-barracks-theme-updated",
  ]);
});

test("legacy theme migrates once when the Barracks key is absent and remains best effort", () => {
  const legacyTheme = { primary: "#123456", secondary: "invalid", background: "#202020", surface: "#303030", ignored: true };
  const normalized = { primary: "#123456", secondary: DEFAULT_THEME.secondary, background: "#202020", surface: "#303030" };
  const storage = createStorage({ [LEGACY_THEME_STORAGE_KEY]: JSON.stringify(legacyTheme) });
  const root = createRoot();
  assert.deepEqual(getStoredTheme({ storage }), normalized);
  assert.deepEqual(storage.calls.filter(([operation, key]) => operation === "setItem" && key === THEME_STORAGE_KEY), [
    ["setItem", THEME_STORAGE_KEY, JSON.stringify(normalized)],
  ]);
  applyTheme(undefined, { storage, root });
  assert.equal(root.style.values.get("--barracks-canvas"), normalized.background);

  const barracksWins = createStorage({
    [THEME_STORAGE_KEY]: JSON.stringify({ primary: "#abcdef" }),
    [LEGACY_THEME_STORAGE_KEY]: JSON.stringify(legacyTheme),
  });
  assert.deepEqual(getStoredTheme({ storage: barracksWins }), { ...DEFAULT_THEME, primary: "#abcdef" });
  assert.equal(barracksWins.calls.some(([operation, key]) => operation === "setItem" && key === THEME_STORAGE_KEY), false);

  const failedMigration = createStorage({ [LEGACY_THEME_STORAGE_KEY]: JSON.stringify(legacyTheme) }, {
    setItem() {
      throw new Error("quota exceeded");
    },
  });
  const failedRoot = createRoot();
  assert.doesNotThrow(() => applyTheme(undefined, { storage: failedMigration, root: failedRoot }));
  assert.equal(failedRoot.style.values.get("--barracks-canvas"), normalized.background);
});
