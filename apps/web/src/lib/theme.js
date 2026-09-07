export const THEME_STORAGE_KEY = "silo_barracks_theme";
export const LEGACY_THEME_STORAGE_KEY = "jellyglance_custom_theme";

export const DEFAULT_THEME = {
  primary: "#6f9bcf",
  secondary: "#a0977f",
  background: "#161410",
  surface: "#221c14",
};

export const THEME_PRESETS = [
  { name: "Silo Barracks", ...DEFAULT_THEME },
  { name: "Ocean", primary: "#2dd4bf", secondary: "#38bdf8", background: "#071015", surface: "#10212a" },
  { name: "Ember", primary: "#f97316", secondary: "#f43f5e", background: "#120b08", surface: "#1f1512" },
  { name: "Forest", primary: "#22c55e", secondary: "#eab308", background: "#08110d", surface: "#111d17" },
  { name: "Aurora", primary: "#a78bfa", secondary: "#22d3ee", background: "#090814", surface: "#17142a" },
  { name: "Rose", primary: "#fb7185", secondary: "#f9a8d4", background: "#130910", surface: "#23111c" },
  { name: "Solar", primary: "#facc15", secondary: "#fb923c", background: "#100d05", surface: "#201809" },
  { name: "Arctic", primary: "#93c5fd", secondary: "#67e8f9", background: "#06101a", surface: "#101d2b" },
  { name: "Grape", primary: "#c084fc", secondary: "#818cf8", background: "#0d0718", surface: "#1b102c" },
  { name: "Ruby", primary: "#ef4444", secondary: "#f97316", background: "#120707", surface: "#211010" },
  { name: "Mint", primary: "#34d399", secondary: "#a3e635", background: "#06110c", surface: "#102017" },
  { name: "Copper", primary: "#d97706", secondary: "#f59e0b", background: "#110b05", surface: "#21160c" },
  { name: "Lagoon", primary: "#06b6d4", secondary: "#14b8a6", background: "#041115", surface: "#0d2226" },
  { name: "Slate", primary: "#94a3b8", secondary: "#38bdf8", background: "#080b10", surface: "#151b24" },
  { name: "Mono", primary: "#e5e7eb", secondary: "#94a3b8", background: "#07080a", surface: "#15171c" },
  { name: "Midnight", primary: "#60a5fa", secondary: "#f472b6", background: "#050816", surface: "#101827" },
  { name: "Citrus", primary: "#84cc16", secondary: "#facc15", background: "#080f05", surface: "#14200d" },
  { name: "Coral", primary: "#fb7185", secondary: "#2dd4bf", background: "#10090b", surface: "#201316" },
  { name: "Matrix", primary: "#22c55e", secondary: "#86efac", background: "#020806", surface: "#08140f" },
  { name: "Nord", primary: "#88c0d0", secondary: "#b48ead", background: "#0b1118", surface: "#17202b" },
  { name: "Synth", primary: "#ff2bd6", secondary: "#00e5ff", background: "#080510", surface: "#171024" },
  { name: "Terminal", primary: "#4ade80", secondary: "#f8fafc", background: "#030604", surface: "#0b120d" },
  { name: "Peacock", primary: "#14b8a6", secondary: "#a3e635", background: "#031014", surface: "#0c2024" },
  { name: "Crimson", primary: "#dc2626", secondary: "#fbbf24", background: "#100405", surface: "#1f0d0f" },
  { name: "Iceberg", primary: "#7dd3fc", secondary: "#c4b5fd", background: "#071018", surface: "#121d29" },
  { name: "Limewire", primary: "#bef264", secondary: "#22d3ee", background: "#050b08", surface: "#101a14" },
  { name: "Noir", primary: "#fafafa", secondary: "#f43f5e", background: "#050505", surface: "#111111" },
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function normalizeHexColor(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const nextValue = value.trim();
  return HEX_COLOR_PATTERN.test(nextValue) ? nextValue : fallback;
}

export function normalizeThemeInput(theme = {}) {
  const source = theme && typeof theme === "object" ? theme : {};
  return {
    primary: normalizeHexColor(source.primary, DEFAULT_THEME.primary),
    secondary: normalizeHexColor(source.secondary, DEFAULT_THEME.secondary),
    background: normalizeHexColor(source.background, DEFAULT_THEME.background),
    surface: normalizeHexColor(source.surface, DEFAULT_THEME.surface),
  };
}

function hexToRgb(hexColor) {
  const normalized = normalizeHexColor(hexColor, "#000000").slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

export function mixHex(firstHexColor, secondHexColor, weight = 0.42) {
  const first = hexToRgb(firstHexColor);
  const second = hexToRgb(secondHexColor);
  const numericWeight = Number(weight);
  const normalizedWeight = Number.isFinite(numericWeight) ? Math.max(0, Math.min(1, numericWeight)) : 0.42;
  const channel = (firstValue, secondValue) => Math.max(0, Math.min(255, Math.round(firstValue * (1 - normalizedWeight) + secondValue * normalizedWeight)));
  return `#${[channel(first.r, second.r), channel(first.g, second.g), channel(first.b, second.b)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function relativeLuminance(hexColor) {
  const { r, g, b } = hexToRgb(hexColor);
  const linearize = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const TEXT_LIGHT = "#f5f0e7";
const TEXT_DARK = "#10100f";

function contrastAdjustment(candidate, endpoint, background, minimum) {
  if (contrastRatio(endpoint, background) < minimum) {
    return null;
  }

  let low = 0;
  let high = 1;
  for (let index = 0; index < 32; index += 1) {
    const weight = (low + high) / 2;
    if (contrastRatio(mixHex(candidate, endpoint, weight), background) >= minimum) {
      high = weight;
    } else {
      low = weight;
    }
  }

  let weight = high;
  let color = mixHex(candidate, endpoint, weight);
  let attempts = 0;
  while (contrastRatio(color, background) < minimum && weight < 1 && attempts < 10001) {
    weight = Math.min(1, weight + 0.0001);
    color = mixHex(candidate, endpoint, weight);
    attempts += 1;
  }
  return contrastRatio(color, background) >= minimum ? { color, weight } : null;
}

export function ensureContrast(foreground, background, minimum = 3) {
  const candidate = normalizeHexColor(foreground, "#000000");
  const backdrop = normalizeHexColor(background, "#000000");
  const threshold = Number.isFinite(Number(minimum)) ? Math.max(1, Number(minimum)) : 3;

  if (contrastRatio(candidate, backdrop) >= threshold) {
    return candidate;
  }

  const adjustments = [TEXT_LIGHT, TEXT_DARK]
    .map((endpoint) => contrastAdjustment(candidate, endpoint, backdrop, threshold))
    .filter(Boolean)
    .sort((first, second) => first.weight - second.weight);
  if (adjustments.length > 0) {
    return adjustments[0].color;
  }

  const lightContrast = contrastRatio(TEXT_LIGHT, backdrop);
  const darkContrast = contrastRatio(TEXT_DARK, backdrop);
  return lightContrast >= darkContrast ? TEXT_LIGHT : TEXT_DARK;
}

function closestMixToward(color, background, minimum = 4.5) {
  let closestColor = color;
  let closestWeight = 0;
  const steps = 4096;
  for (let index = 0; index <= steps; index += 1) {
    const weight = index / steps;
    const mixedColor = mixHex(color, background, weight);
    if (contrastRatio(mixedColor, background) >= minimum) {
      closestColor = mixedColor;
      closestWeight = weight;
    }
  }

  if (closestWeight > 0 || contrastRatio(closestColor, background) >= minimum) {
    return closestColor;
  }

  return ensureContrast(color, background, minimum);
}

function resolveActionPair(candidate, background) {
  const endpoints = [TEXT_LIGHT, TEXT_DARK];
  const steps = 4096;
  const pairs = [];

  for (const mixEndpoint of endpoints) {
    for (let index = 0; index <= steps; index += 1) {
      const weight = index / steps;
      const action = mixHex(candidate, mixEndpoint, weight);
      if (contrastRatio(action, background) < 3) {
        continue;
      }

      const textCandidates = endpoints
        .map((actionText) => ({ actionText, contrast: contrastRatio(actionText, action) }))
        .filter(({ contrast }) => contrast >= 4.5)
        .sort((first, second) => second.contrast - first.contrast);
      if (textCandidates.length > 0) {
        pairs.push({ action, actionText: textCandidates[0].actionText, weight });
        break;
      }
    }
  }

  if (pairs.length > 0) {
    return pairs.sort((first, second) => first.weight - second.weight)[0];
  }

  const action = ensureContrast(candidate, background, 3);
  return { action, actionText: strongestTextEndpoint(action), weight: 1 };
}

function strongestTextEndpoint(background) {
  return contrastRatio(TEXT_LIGHT, background) >= contrastRatio(TEXT_DARK, background) ? TEXT_LIGHT : TEXT_DARK;
}

function isDefaultThemeInput(input) {
  return Object.keys(DEFAULT_THEME).every((key) => input[key].toLowerCase() === DEFAULT_THEME[key].toLowerCase());
}

export function resolveTheme(theme) {
  const input = normalizeThemeInput(theme);
  const canvas = input.background;
  const nav = mixHex(input.surface, canvas, 0.35);
  const surfaceRaised = input.surface;
  const text = strongestTextEndpoint(canvas);
  const textInverse = text === TEXT_LIGHT ? TEXT_DARK : TEXT_LIGHT;
  const surfaceInset = mixHex(input.surface, canvas, 0.38);
  const surfaceInteractive = mixHex(input.surface, text, 0.06);
  const overlay = mixHex(input.surface, canvas, 0.18);
  const borderSubtle = mixHex(input.surface, text, 0.18);
  const borderStrong = ensureContrast(mixHex(surfaceInteractive, text, 0.42), surfaceInteractive, 3);
  const textMuted = closestMixToward(text, canvas);
  const textMutedRaised = closestMixToward(strongestTextEndpoint(surfaceRaised), surfaceRaised);
  const focus = ensureContrast(input.primary, surfaceRaised, 3);
  const { action, actionText } = resolveActionPair(input.primary, surfaceInteractive);
  const actionForeground = ensureContrast(input.primary, canvas, 4.5);
  const statusCandidates = {
    live: "#ff6f63",
    success: "#70b981",
    warning: "#ffa64f",
    danger: "#e45f55",
    unavailable: "#a0977f",
  };
  const live = ensureContrast(statusCandidates.live, surfaceRaised, 3);
  const success = ensureContrast(statusCandidates.success, surfaceRaised, 3);
  const warning = ensureContrast(statusCandidates.warning, surfaceRaised, 3);
  const danger = ensureContrast(statusCandidates.danger, surfaceRaised, 3);
  const unavailable = ensureContrast(statusCandidates.unavailable, surfaceRaised, 3);
  const chartCandidates = [input.primary, live, warning, input.secondary, success, danger];
  const charts = chartCandidates.map((candidate) => ensureContrast(candidate, surfaceInset, 3));
  const rgb = (hexColor) => rgbString(hexColor);
  const scrim = isDefaultThemeInput(input) ? "rgba(8, 7, 5, 0.72)" : `rgba(${rgb(canvas)}, 0.72)`;
  const tokens = {
    canvas,
    nav,
    surfaceRaised,
    surfaceInset,
    surfaceInteractive,
    overlay,
    borderSubtle,
    borderStrong,
    text,
    textMuted,
    textMutedRaised,
    textInverse,
    focus,
    focusLight: TEXT_LIGHT,
    focusDark: TEXT_DARK,
    action,
    actionText,
    actionForeground,
    accentSecondary: input.secondary,
    live,
    success,
    warning,
    danger,
    unavailable,
    chartGrid: borderSubtle,
    chartTooltip: overlay,
    chart1: charts[0],
    chart2: charts[1],
    chart3: charts[2],
    chart4: charts[3],
    chart5: charts[4],
    chart6: charts[5],
    scrim,
    shadow: `0 12px 32px rgba(${rgb(canvas)}, 0.28)`,
    actionRgb: rgb(action),
    accentSecondaryRgb: rgb(input.secondary),
    surfaceRaisedRgb: rgb(surfaceRaised),
  };

  return { input, tokens };
}

function rgbString(hexColor) {
  const { r, g, b } = hexToRgb(hexColor);
  return `${r}, ${g}, ${b}`;
}

let lastAppliedTokens = null;

function getGlobalStorage() {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function getDocumentRoot() {
  try {
    return typeof document === "undefined" ? undefined : document.documentElement;
  } catch {
    return undefined;
  }
}

function getGlobalEventTarget() {
  try {
    return typeof window === "undefined" ? undefined : window;
  } catch {
    return undefined;
  }
}

function readStoredValue(storage, key) {
  try {
    const value = storage?.getItem(key);
    if (value === null || typeof value === "undefined") {
      return { status: "absent" };
    }
    return { status: "present", value: JSON.parse(value) };
  } catch {
    return { status: "failed" };
  }
}

function isThemeRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function writeStoredValue(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Storage is optional and may be unavailable or full; the in-memory theme still applies.
  }
}

function removeStoredValue(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage removal is best effort; reset still applies in memory.
  }
}

export function getStoredTheme({ storage = getGlobalStorage() } = {}) {
  const stored = readStoredValue(storage, THEME_STORAGE_KEY);
  if (stored.status === "present") {
    return normalizeThemeInput(stored.value);
  }
  if (stored.status === "failed") {
    return normalizeThemeInput();
  }

  const legacy = readStoredValue(storage, LEGACY_THEME_STORAGE_KEY);
  if (legacy.status !== "present" || !isThemeRecord(legacy.value)) {
    return normalizeThemeInput();
  }

  const normalizedLegacy = normalizeThemeInput(legacy.value);
  writeStoredValue(storage, THEME_STORAGE_KEY, JSON.stringify(normalizedLegacy));
  return normalizedLegacy;
}

const semanticPropertyMap = [
  ["--barracks-canvas", "canvas"],
  ["--barracks-nav", "nav"],
  ["--barracks-surface-raised", "surfaceRaised"],
  ["--barracks-surface-inset", "surfaceInset"],
  ["--barracks-surface-interactive", "surfaceInteractive"],
  ["--barracks-overlay", "overlay"],
  ["--barracks-border-subtle", "borderSubtle"],
  ["--barracks-border-strong", "borderStrong"],
  ["--barracks-text", "text"],
  ["--barracks-text-muted", "textMuted"],
  ["--barracks-text-muted-raised", "textMutedRaised"],
  ["--barracks-text-inverse", "textInverse"],
  ["--barracks-focus", "focus"],
  ["--barracks-focus-light", "focusLight"],
  ["--barracks-focus-dark", "focusDark"],
  ["--barracks-action", "action"],
  ["--barracks-action-text", "actionText"],
  ["--barracks-action-foreground", "actionForeground"],
  ["--barracks-accent-secondary", "accentSecondary"],
  ["--barracks-state-live", "live"],
  ["--barracks-state-success", "success"],
  ["--barracks-state-warning", "warning"],
  ["--barracks-state-danger", "danger"],
  ["--barracks-state-unavailable", "unavailable"],
  ["--barracks-chart-grid", "chartGrid"],
  ["--barracks-chart-tooltip", "chartTooltip"],
  ["--barracks-chart-1", "chart1"],
  ["--barracks-chart-2", "chart2"],
  ["--barracks-chart-3", "chart3"],
  ["--barracks-chart-4", "chart4"],
  ["--barracks-chart-5", "chart5"],
  ["--barracks-chart-6", "chart6"],
  ["--barracks-scrim", "scrim"],
  ["--barracks-shadow", "shadow"],
  ["--barracks-action-rgb", "actionRgb"],
  ["--barracks-accent-secondary-rgb", "accentSecondaryRgb"],
  ["--barracks-surface-raised-rgb", "surfaceRaisedRgb"],
];

function getCssPropertyValues(tokens) {
  const primaryLightColor = mixHex(tokens.action, tokens.focusLight, 0.42);
  const primaryDarkColor = mixHex(tokens.action, tokens.focusDark, 0.28);
  return {
    ...Object.fromEntries(semanticPropertyMap.map(([property, key]) => [property, tokens[key]])),
    "--primary-color": tokens.action,
    "--primary-rgb": tokens.actionRgb,
    "--primary-light-color": primaryLightColor,
    "--primary-light-rgb": rgbString(primaryLightColor),
    "--primary-dark-color": primaryDarkColor,
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
}

function writeThemeToRoot(root, tokens) {
  if (!root?.style?.setProperty) {
    return;
  }
  const values = getCssPropertyValues(tokens);
  root.style.colorScheme = tokens.text === TEXT_DARK ? "light" : "dark";
  for (const [property, value] of Object.entries(values)) {
    root.style.setProperty(property, value);
  }
}

export function applyTheme(theme, { root = getDocumentRoot(), storage = getGlobalStorage() } = {}) {
  const sourceTheme = theme === undefined ? getStoredTheme({ storage }) : theme;
  const { tokens } = resolveTheme(sourceTheme);
  lastAppliedTokens = { ...tokens };
  writeThemeToRoot(root, tokens);
}

export function getThemeTokens() {
  return lastAppliedTokens ? { ...lastAppliedTokens } : null;
}

function dispatchThemeEvent(eventTarget, type, detail) {
  if (!eventTarget?.dispatchEvent) {
    return;
  }
  try {
    const event = typeof CustomEvent === "function"
      ? new CustomEvent(type, { detail })
      : { type, detail };
    eventTarget.dispatchEvent(event);
  } catch {
    // Consumers must not prevent a theme from being applied.
  }
}

export function saveTheme(theme, { storage = getGlobalStorage(), root = getDocumentRoot(), eventTarget = getGlobalEventTarget() } = {}) {
  const nextTheme = normalizeThemeInput(theme);
  writeStoredValue(storage, THEME_STORAGE_KEY, JSON.stringify(nextTheme));
  applyTheme(nextTheme, { root, storage });
  dispatchThemeEvent(eventTarget, "jellyglance-theme-updated", nextTheme);
  dispatchThemeEvent(eventTarget, "silo-barracks-theme-updated", getThemeTokens());
  return nextTheme;
}

export function resetTheme({ storage = getGlobalStorage(), root = getDocumentRoot(), eventTarget = getGlobalEventTarget() } = {}) {
  const nextTheme = normalizeThemeInput(DEFAULT_THEME);
  removeStoredValue(storage, THEME_STORAGE_KEY);
  writeStoredValue(storage, THEME_STORAGE_KEY, JSON.stringify(nextTheme));
  applyTheme(nextTheme, { root, storage });
  dispatchThemeEvent(eventTarget, "jellyglance-theme-updated", nextTheme);
  dispatchThemeEvent(eventTarget, "silo-barracks-theme-updated", getThemeTokens());
  return nextTheme;
}
