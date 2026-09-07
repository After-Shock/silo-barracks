#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SUPPORTED_EXTENSIONS = new Set([".css", ".js", ".jsx"]);
const COLOR_FUNCTIONS = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
]);
const GRADIENT_FUNCTIONS = new Set(["linear-gradient", "radial-gradient", "conic-gradient"]);
const ALLOWED_COLOR_KEYWORDS = new Set(["transparent", "currentcolor", "inherit", "initial", "unset"]);
const ALLOWED_COLOR_SPACE_WORDS = new Set([
  "a98-rgb",
  "display-p3",
  "hsl",
  "hwb",
  "in",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "prophoto-rgb",
  "rec2020",
  "srgb",
  "srgb-linear",
  "xyz",
  "xyz-d50",
  "xyz-d65",
]);
const APPROVED_VARIABLE_DECLARATIONS = new Set([
  "--barracks-canvas",
  "--barracks-nav",
  "--barracks-surface-raised",
  "--barracks-surface-inset",
  "--barracks-surface-interactive",
  "--barracks-overlay",
  "--barracks-border-subtle",
  "--barracks-border-strong",
  "--barracks-text",
  "--barracks-text-muted",
  "--barracks-text-muted-raised",
  "--barracks-text-inverse",
  "--barracks-focus",
  "--barracks-focus-light",
  "--barracks-focus-dark",
  "--barracks-action",
  "--barracks-accent-secondary",
  "--barracks-state-live",
  "--barracks-state-success",
  "--barracks-state-warning",
  "--barracks-state-danger",
  "--barracks-state-unavailable",
  "--barracks-chart-grid",
  "--barracks-chart-tooltip",
  "--barracks-chart-1",
  "--barracks-chart-2",
  "--barracks-chart-3",
  "--barracks-chart-4",
  "--barracks-chart-5",
  "--barracks-chart-6",
  "--barracks-scrim",
  "--barracks-shadow",
  "--barracks-action-rgb",
  "--barracks-accent-secondary-rgb",
  "--barracks-surface-raised-rgb",
  "--primary-color",
  "--primary-rgb",
  "--primary-light-color",
  "--primary-light-rgb",
  "--primary-dark-color",
  "--secondary-color",
  "--secondary-rgb",
  "--background-color",
  "--secondary-background-color",
  "--tertiary-background-color",
  "--surface-color",
  "--surface-border-color",
  "--text-color",
  "--muted-text-color",
  "--subtle-text-color",
]);

// CSS Color 4 named colors, excluding transparent (an allowed keyword).
const CSS_NAMED_COLORS = new Set(`
aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid
mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise
palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown
salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan
teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
`.trim().split(/\s+/));

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function relativePath(root, file) {
  return toPosix(path.relative(root, file));
}

function isInsideRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function isExcluded(relative) {
  const segments = relative.split("/");
  if (segments.includes("node_modules") || segments.includes("dist") || segments.includes("generated")) {
    return true;
  }
  if (relative === "apps/web/src/lib/theme.js" || relative === "apps/web/public" || relative.startsWith("apps/web/public/")) {
    return true;
  }
  return false;
}

function isSupportedFile(file) {
  return SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function collectFiles(root, requestedFiles) {
  const requested = requestedFiles == null ? [] : Array.isArray(requestedFiles) ? requestedFiles : [requestedFiles];
  const roots = requested.length > 0
    ? requested.map((file) => path.resolve(root, file))
    : [path.join(root, "apps/web/src")];
  const found = new Map();

  function visit(target) {
    if (!isInsideRoot(root, target) || !fs.existsSync(target)) return;
    const relative = relativePath(root, target);
    if (relative && isExcluded(relative)) return;
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        visit(path.join(target, entry.name));
      }
      return;
    }
    if (stat.isFile() && isSupportedFile(target)) found.set(relative, target);
  }

  for (const target of roots) visit(target);
  return [...found.entries()].sort(([first], [second]) => first.localeCompare(second));
}

function maskComments(source) {
  const masked = source.split("");
  let mode = "normal";
  let quote = "";
  let escaped = false;
  let commentReturnMode = "normal";

  const blank = (index) => {
    if (masked[index] !== "\n" && masked[index] !== "\r") masked[index] = " ";
  };

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (mode === "line-comment") {
      if (current === "\n" || current === "\r") {
        mode = commentReturnMode;
      } else {
        blank(index);
      }
      continue;
    }
    if (mode === "block-comment") {
      if (current === "*" && next === "/") {
        blank(index);
        blank(index + 1);
        index += 1;
        mode = commentReturnMode;
      } else {
        blank(index);
      }
      continue;
    }
    if (mode === "quote") {
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === quote) {
        mode = "normal";
        quote = "";
      } else if (current === "/" && next === "*") {
        blank(index);
        blank(index + 1);
        index += 1;
        commentReturnMode = "quote";
        mode = "block-comment";
      }
      continue;
    }
    if (current === "/" && next === "/") {
      blank(index);
      blank(index + 1);
      index += 1;
      commentReturnMode = "normal";
      mode = "line-comment";
    } else if (current === "/" && next === "*") {
      blank(index);
      blank(index + 1);
      index += 1;
      commentReturnMode = "normal";
      mode = "block-comment";
    } else if (current === "'" || current === '"' || current === "`") {
      quote = current;
      escaped = false;
      mode = "quote";
    }
  }
  return masked.join("");
}

function isWordCharacter(character) {
  return Boolean(character) && /[A-Za-z0-9_-]/.test(character);
}

function isIdentifierStart(character) {
  return Boolean(character) && /[A-Za-z_-]/.test(character);
}

function readIdentifier(source, start) {
  let end = start;
  while (end < source.length && isWordCharacter(source[end])) end += 1;
  return { end, value: source.slice(start, end) };
}

function findBalancedFunctionEnd(source, openIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const current = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === quote) quote = "";
      continue;
    }
    if (current === "'" || current === '"' || current === "`") {
      quote = current;
    } else if (current === "(") {
      depth += 1;
    } else if (current === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return source.length - 1;
}

function findDeclarationProperty(source, offset) {
  let parenthesisDepth = 0;
  let quote = "";
  let escaped = false;
  let start = offset - 1;
  for (; start >= 0; start -= 1) {
    const current = source[start];
    if (quote) {
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === quote) quote = "";
      continue;
    }
    if (current === "'" || current === '"' || current === "`") {
      quote = current;
    } else if (current === ")") {
      parenthesisDepth += 1;
    } else if (current === "(" && parenthesisDepth > 0) {
      parenthesisDepth -= 1;
    } else if (parenthesisDepth === 0 && (current === ";" || current === "{" || current === "}")) {
      break;
    }
  }
  const segment = source.slice(start + 1, offset);
  const colon = segment.lastIndexOf(":");
  if (colon < 0) return null;
  const property = segment.slice(0, colon).trim().match(/(?:^|[;{])\s*([A-Za-z_-][A-Za-z0-9_-]*)\s*$/);
  return property ? property[1] : null;
}

function isInsideQuotedString(source, offset) {
  let quote = "";
  let escaped = false;
  for (let index = 0; index < offset; index += 1) {
    const current = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === quote) quote = "";
    } else if (current === "'" || current === '"' || current === "`") {
      quote = current;
    }
  }
  return Boolean(quote);
}

function isNamedColorCandidate(source, original, start, end, extension) {
  const before = source.slice(Math.max(0, start - 80), start);
  if (extension === ".css") return Boolean(findDeclarationProperty(source, start));
  if (isInsideQuotedString(original, start)) return true;
  if (findDeclarationProperty(source, start)) return true;
  return /(?:[:,([=]|\b(?:fill|stroke|color|background)\s*)\s*$/.test(before);
}

function lineAndColumn(source, offset) {
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

function normalizeExceptionPath(file) {
  if (typeof file !== "string" || !file.trim()) return null;
  const normalized = toPosix(path.posix.normalize(file.trim().replaceAll("\\", "/"))).replace(/^\.\//, "");
  if (path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) return null;
  return normalized;
}

function normalizeExceptions(input) {
  const entries = Array.isArray(input) ? input : input && Array.isArray(input.exceptions) ? input.exceptions : [];
  const allowed = new Set();
  const violations = [];
  entries.forEach((entry, index) => {
    const file = normalizeExceptionPath(entry && (entry.file ?? entry.path));
    const rawValues = entry && (entry.values ?? entry.value ?? entry.literal);
    const values = Array.isArray(rawValues) ? rawValues : rawValues == null ? [] : [rawValues];
    const reason = entry && (entry.reason ?? entry.purpose);
    const wildcard = typeof entry?.file === "string" && /[*?\[\]]/.test(entry.file)
      || typeof entry?.path === "string" && /[*?\[\]]/.test(entry.path);
    if (!file || wildcard) {
      violations.push({ kind: "exception", file: "<exceptions>", line: index + 1, column: 1, value: "", message: `Exception ${index + 1} must use an exact file path; wildcard paths are not allowed.` });
      return;
    }
    if (!values.length || values.some((value) => typeof value !== "string" || !value)) {
      violations.push({ kind: "exception", file: "<exceptions>", line: index + 1, column: 1, value: "", message: `Exception ${index + 1} must include one or more exact literal values.` });
      return;
    }
    if (typeof reason !== "string" || !reason.trim()) {
      violations.push({ kind: "exception", file: "<exceptions>", line: index + 1, column: 1, value: "", message: `Exception ${index + 1} must include a nonempty reason or purpose.` });
      return;
    }
    for (const value of values) allowed.add(`${file}\u0000${value.toLowerCase()}`);
  });
  return { allowed, violations };
}

function addColorOccurrence(occurrences, source, start, end) {
  if (end < start) return;
  occurrences.push({ start, end, value: source.slice(start, end + 1) });
}

function isSemanticVariableColorBody(body) {
  const variables = [...body.matchAll(/var\s*\(\s*(--[A-Za-z0-9_-]+)/gi)].map((match) => match[1]);
  if (!variables.length || variables.some((variable) => !variable.toLowerCase().startsWith("--barracks-"))) return false;
  const withoutVariables = body.replace(/var\s*\([^)]*\)/gi, " ");
  if (/(?:#[0-9a-f]{3,8}\b|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\()/i.test(withoutVariables)) return false;
  const words = withoutVariables.match(/[A-Za-z][A-Za-z0-9-]*/g) || [];
  return words.every((word) => ALLOWED_COLOR_SPACE_WORDS.has(word.toLowerCase()));
}

function scanColors(source, extension) {
  const masked = maskComments(source);
  const occurrences = [];
  for (let index = 0; index < masked.length; index += 1) {
    const current = masked[index];
    if (current === "#") {
      const previous = masked[index - 1];
      if (isWordCharacter(previous)) continue;
      const match = masked.slice(index).match(/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![A-Za-z0-9_-])/i);
      if (match) {
        addColorOccurrence(occurrences, source, index, index + match[0].length - 1);
        index += match[0].length - 1;
      }
      continue;
    }
    if (!isIdentifierStart(current)) continue;
    const identifier = readIdentifier(masked, index);
    const lower = identifier.value.toLowerCase();
    let next = identifier.end;
    while (/\s/.test(masked[next] || "")) next += 1;
    if (COLOR_FUNCTIONS.has(lower) && masked[next] === "(") {
      const end = findBalancedFunctionEnd(masked, next);
      const body = masked.slice(next + 1, end);
      if (!isSemanticVariableColorBody(body)) addColorOccurrence(occurrences, source, index, end);
      index = end;
      continue;
    }
    if (CSS_NAMED_COLORS.has(lower) && !ALLOWED_COLOR_KEYWORDS.has(lower)
      && isNamedColorCandidate(masked, source, index, identifier.end, extension)) {
      addColorOccurrence(occurrences, source, index, identifier.end - 1);
      index = identifier.end - 1;
    } else {
      index = identifier.end - 1;
    }
  }
  return occurrences;
}

function scanGradientViolations(source, extension) {
  const masked = maskComments(source);
  const occurrences = [];
  for (let index = 0; index < masked.length; index += 1) {
    if (!isIdentifierStart(masked[index])) continue;
    const identifier = readIdentifier(masked, index);
    const lower = identifier.value.toLowerCase();
    let next = identifier.end;
    while (/\s/.test(masked[next] || "")) next += 1;
    if (!GRADIENT_FUNCTIONS.has(lower) || masked[next] !== "(") {
      index = identifier.end - 1;
      continue;
    }
    const end = findBalancedFunctionEnd(masked, next);
    const body = masked.slice(next + 1, end);
    const nestedColors = scanColors(source.slice(next + 1, end), extension);
    if (!nestedColors.length) {
      const variables = [...body.matchAll(/var\s*\(\s*(--[A-Za-z0-9_-]+)/gi)].map((match) => match[1]);
      if (variables.length && variables.some((variable) => !variable.toLowerCase().startsWith("--barracks-"))) {
        addColorOccurrence(occurrences, source, index, end);
      }
    }
    index = end;
  }
  return occurrences;
}

function loadExceptions(root) {
  const file = path.join(root, "apps/web/theme-color-exceptions.json");
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return [{ __invalid: error.message }];
  }
}

function auditSources({ root = process.cwd(), files, exceptions } = {}) {
  const absoluteRoot = path.resolve(root);
  const sourceEntries = collectFiles(absoluteRoot, files);
  const exceptionInput = exceptions === undefined ? loadExceptions(absoluteRoot) : exceptions;
  const normalizedExceptions = normalizeExceptions(exceptionInput);
  const violations = [...normalizedExceptions.violations];
  if (Array.isArray(exceptionInput) && exceptionInput.some((entry) => entry && entry.__invalid)) {
    violations.push({ kind: "exception", file: "<exceptions>", line: 1, column: 1, value: "", message: `Unable to parse theme-color-exceptions.json: ${exceptionInput.find((entry) => entry.__invalid).__invalid}` });
  }
  const scannedFiles = sourceEntries.map(([relative]) => relative);
  for (const [relative, file] of sourceEntries) {
    const source = fs.readFileSync(file, "utf8");
    const extension = path.extname(file).toLowerCase();
    const variablesFile = path.basename(file).toLowerCase() === "variables.css";
    const occurrences = [...scanColors(source, extension), ...scanGradientViolations(source, extension)];
    for (const occurrence of occurrences) {
      const property = variablesFile ? findDeclarationProperty(maskComments(source), occurrence.start) : null;
      if (variablesFile && property && APPROVED_VARIABLE_DECLARATIONS.has(property)) continue;
      if (normalizedExceptions.allowed.has(`${relative}\u0000${occurrence.value.toLowerCase()}`)) continue;
      const position = lineAndColumn(source, occurrence.start);
      violations.push({
        kind: "color",
        file: relative,
        line: position.line,
        column: position.column,
        value: occurrence.value,
        property,
        message: variablesFile
          ? `Color literal ${occurrence.value} is not allowed in variables.css declaration ${property || "<unknown>"}; use an approved semantic token declaration.`
          : `Color literal ${occurrence.value} is not allowed; use a --barracks-* semantic token or an approved exact exception.`,
      });
    }
  }
  violations.sort((first, second) => first.file.localeCompare(second.file)
    || first.line - second.line
    || first.column - second.column
    || first.value.localeCompare(second.value)
    || first.kind.localeCompare(second.kind));
  return { scannedFiles, violations };
}

function parseCliArgs(argv) {
  let root = process.cwd();
  const files = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      root = path.resolve(argv[index + 1] || process.cwd());
      index += 1;
    } else if (argument.startsWith("--root=")) {
      root = path.resolve(argument.slice("--root=".length));
    } else if (argument !== "--") {
      files.push(argument);
    }
  }
  return { root, files };
}

function formatViolation(violation) {
  const value = violation.value ? ` value=${JSON.stringify(violation.value)}` : "";
  return `${violation.file}:${violation.line}:${violation.column}: ${violation.message}${value}`;
}

function main() {
  const { root, files } = parseCliArgs(process.argv.slice(2));
  const result = auditSources({ root, files });
  for (const violation of result.violations) console.error(formatViolation(violation));
  if (result.violations.length) process.exitCode = 1;
}

module.exports = {
  auditSources,
  APPROVED_VARIABLE_DECLARATIONS,
  CSS_NAMED_COLORS,
  maskComments,
};

if (require.main === module) main();
