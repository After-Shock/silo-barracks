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
  "--barracks-border-canvas",
  "--barracks-border-raised",
  "--barracks-border-inset",
  "--barracks-border-nav",
  "--barracks-border-overlay",
  "--barracks-text",
  "--barracks-text-raised",
  "--barracks-text-inset",
  "--barracks-text-interactive",
  "--barracks-text-nav",
  "--barracks-text-overlay",
  "--barracks-text-muted",
  "--barracks-text-muted-raised",
  "--barracks-text-inverse",
  "--barracks-focus",
  "--barracks-focus-light",
  "--barracks-focus-dark",
  "--barracks-action",
  "--barracks-action-text",
  "--barracks-action-foreground",
  "--barracks-accent-secondary",
  "--barracks-state-live",
  "--barracks-state-success",
  "--barracks-state-warning",
  "--barracks-state-danger",
  "--barracks-state-danger-interactive",
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

function compareStrings(first, second) {
  return first < second ? -1 : first > second ? 1 : 0;
}

function relativePath(root, file) {
  return toPosix(path.relative(root, file));
}

function isInsideRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function isExcluded(relative, explicit = false) {
  const segments = relative.split("/");
  if (segments.includes("node_modules") || segments.includes("dist") || segments.includes("generated")) {
    return true;
  }
  if (!explicit && /\.test\.(?:js|jsx)$/i.test(relative)) {
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

function inputViolation(message, value = "") {
  return { kind: "input", file: "<input>", line: 1, column: 1, value, message };
}

function collectFiles(root, realRoot, requestedFiles) {
  const requested = requestedFiles == null ? [] : Array.isArray(requestedFiles) ? requestedFiles : [requestedFiles];
  const invalidRequest = requested.findIndex((file) => typeof file !== "string" || !file.trim());
  if (invalidRequest >= 0) {
    return {
      entries: [],
      errors: [inputViolation(`Invalid files entry at index ${invalidRequest}; each entry must be a nonempty string path.`, String(requested[invalidRequest] ?? ""))],
    };
  }
  const roots = requested.length > 0
    ? requested.map((file) => path.resolve(root, file))
    : [path.join(root, "apps/web/src")];
  const found = new Map();
  const errors = [];

  function visit(target, explicit = false) {
    if (!isInsideRoot(root, target)) {
      if (explicit) errors.push(inputViolation(`Path ${target} is outside the audit root.`, target));
      return;
    }
    if (!fs.existsSync(target)) {
      if (explicit) errors.push(inputViolation(`Path ${target} does not exist.`, target));
      return;
    }
    const relative = relativePath(root, target);
    if (relative && isExcluded(relative, explicit)) return;
    const stat = fs.lstatSync(target);
    let realTarget;
    try {
      realTarget = fs.realpathSync(target);
    } catch (error) {
      if (explicit) errors.push(inputViolation(`Unable to resolve path ${target}: ${error.message}`, target));
      return;
    }
    if (!isInsideRoot(realRoot, realTarget)) {
      if (explicit) errors.push(inputViolation(`Path ${target} resolves through a symlink outside the audit root.`, target));
      return;
    }
    if (stat.isSymbolicLink()) {
      if (explicit) errors.push(inputViolation(`Explicit path ${target} is a symlink; use a real path inside the audit root.`, target));
      return;
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target, { withFileTypes: true }).sort((a, b) => compareStrings(a.name, b.name))) {
        visit(path.join(target, entry.name), explicit);
      }
      return;
    }
    if (stat.isFile() && isSupportedFile(target)) {
      found.set(relative, target);
    } else if (stat.isFile() && explicit) {
      errors.push(inputViolation(`Path ${target} has an unsupported file type; expected .css, .js, or .jsx.`, target));
    }
  }

  for (const target of roots) visit(target, requested.length > 0);
  return {
    entries: [...found.entries()].sort(([first], [second]) => compareStrings(first, second)),
    errors,
  };
}

function looksLikeRegexStart(source, index) {
  let previous = index - 1;
  while (previous >= 0 && /\s/.test(source[previous])) previous -= 1;
  if (previous < 0 || /[=([{!?,:;\/~%^&|*+\-<>]/.test(source[previous])) return true;
  if (source[previous] === ")") {
    let depth = 0;
    for (let cursor = previous; cursor >= 0; cursor -= 1) {
      if (source[cursor] === ")") depth += 1;
      else if (source[cursor] === "(") {
        depth -= 1;
        if (depth === 0) {
          let end = cursor - 1;
          while (end >= 0 && /\s/.test(source[end])) end -= 1;
          let start = end;
          while (start >= 0 && /[A-Za-z]/.test(source[start])) start -= 1;
          if (["if", "while", "for", "switch", "catch", "with"].includes(source.slice(start + 1, end + 1))) return true;
          break;
        }
      }
    }
  }
  const wordEnd = previous + 1;
  while (previous >= 0 && /[A-Za-z]/.test(source[previous])) previous -= 1;
  const word = source.slice(previous + 1, wordEnd);
  return ["await", "case", "delete", "do", "else", "extends", "in", "instanceof", "new", "of", "return", "throw", "typeof", "void", "yield"].includes(word);
}

function maskComments(source, extension = ".css") {
  const masked = source.split("");
  let mode = "normal";
  let quote = "";
  let escaped = false;
  let commentReturnMode = "normal";
  let regexClass = false;
  const javascript = extension !== ".css";

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
    if (mode === "regex") {
      if (current === "\n" || current === "\r") {
        mode = "normal";
        continue;
      }
      blank(index);
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === "[") regexClass = true;
      else if (current === "]") regexClass = false;
      else if (current === "/" && !regexClass) mode = "normal";
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
    if (javascript && current === "/" && next === "/") {
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
    } else if (javascript && current === "/" && looksLikeRegexStart(source, index)) {
      regexClass = false;
      escaped = false;
      blank(index);
      mode = "regex";
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

function findDeclarationProperty(source, offset, { lineDelimited = false } = {}) {
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
    } else if (parenthesisDepth === 0 && (current === ";" || current === "{" || current === "}"
      || (lineDelimited && (current === "\n" || current === "\r")))) {
      break;
    }
  }
  const segment = source.slice(start + 1, offset);
  const colon = segment.lastIndexOf(":");
  if (colon < 0) return null;
  const property = segment.slice(0, colon).trim().match(/(?:^|[;,{])\s*["']?([A-Za-z_-][A-Za-z0-9_-]*)["']?\s*$/);
  return property ? property[1] : null;
}

function findContainingFunction(source, offset) {
  let depth = 0;
  for (let index = offset - 1; index >= 0; index -= 1) {
    const current = source[index];
    if (current === ")") {
      depth += 1;
    } else if (current === "(") {
      if (depth > 0) {
        depth -= 1;
      } else {
        let end = index - 1;
        while (end >= 0 && /\s/.test(source[end])) end -= 1;
        let start = end;
        while (start >= 0 && /[A-Za-z-]/.test(source[start])) start -= 1;
        return {
          name: source.slice(start + 1, end + 1).toLowerCase(),
          openIndex: index,
        };
      }
    }
  }
  return null;
}

function isInsideFunction(source, offset, functionName) {
  const containing = findContainingFunction(source, offset);
  return Boolean(containing && containing.name === functionName);
}

function isDataSvgUrl(source, offset) {
  const containing = findContainingFunction(source, offset);
  if (!containing || containing.name !== "url") return false;
  const end = findBalancedFunctionEnd(source, containing.openIndex);
  const body = source.slice(containing.openIndex + 1, end);
  return /^\s*["']?\s*data:image\/svg\+xml(?:;[^,]*)?,/i.test(body);
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

function isColorProperty(property) {
  if (!property) return false;
  return /(?:color|background|border|outline|shadow|fill|stroke|filter|caret|accent|decoration|column-rule|stop-color|flood-color|lighting-color)/i.test(property);
}

function isPaletteName(name) {
  return /(?:^|[-_])(color|colors|colour|colours|palette|palettes|swatch|swatches)(?:$|[-_])/.test(name.toLowerCase())
    || /[a-z](?:Color|Colors|Colour|Colours|Palette|Palettes|Swatch|Swatches)(?:$|[-_]|[A-Z])/.test(name);
}

function isPaletteKey(name) {
  return isColorProperty(name)
    || /^(?:primary|secondary|accent|action|surface|canvas|border|text|status|success|warning|danger|error|muted|focus|shadow|grid|tooltip|chart)(?:$|[-_])/i.test(name || "");
}

function isPaletteContext(source, offset) {
  const stack = [];
  let quote = "";
  let escaped = false;
  for (let index = 0; index < offset; index += 1) {
    const current = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === quote) quote = "";
      continue;
    }
    if (current === "'" || current === '"' || current === "`") {
      quote = current;
    } else if (current === "[" || current === "{" || current === "(") {
      stack.push({ current, index });
    } else if ((current === "]" && stack.at(-1)?.current === "[")
      || (current === "}" && stack.at(-1)?.current === "{")
      || (current === ")" && stack.at(-1)?.current === "(")) {
      stack.pop();
    }
  }
  for (let stackIndex = stack.length - 1; stackIndex >= 0; stackIndex -= 1) {
    const context = stack[stackIndex];
    if (context.current !== "[" && context.current !== "{") continue;
    const before = source.slice(Math.max(0, context.index - 160), context.index);
    const declaration = before.match(/(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*$/)
      || before.match(/(?:^|[,;{])\s*["']?([A-Za-z_$][A-Za-z0-9_$-]*)["']?\s*:\s*$/);
    if (declaration && isPaletteName(declaration[1])) {
      if (context.current === "[" || isPaletteKey(findDeclarationProperty(source, offset, { lineDelimited: true }))) return true;
    }
  }
  return false;
}

function isColorContext(source, original, start, extension, contextRequired = true) {
  if (!contextRequired) return true;
  if (isInsideFunction(source, start, "url")) {
    return isDataSvgUrl(source, start);
  }
  const declaration = findDeclarationProperty(source, start, { lineDelimited: extension !== ".css" });
  if (extension === ".css") {
    if (isInsideQuotedString(source, start) && !isColorProperty(declaration) && !declaration?.startsWith("--")) return false;
    return Boolean(declaration);
  }
  if (isPaletteContext(source, start)) return true;
  if (declaration && isColorProperty(declaration)) return true;
  const before = source.slice(Math.max(0, start - 120), start);
  const embeddedProperty = before.match(/([A-Za-z_-][A-Za-z0-9_-]*)\s*:\s*$/);
  if (embeddedProperty && isColorProperty(embeddedProperty[1])) return true;
  const assignment = before.match(/(?:^|[.\["'])\s*([A-Za-z_-][A-Za-z0-9_-]*)\s*=\s*$/);
  if (assignment && isColorProperty(assignment[1])) return true;
  const svgAttribute = before.match(/(?:fill|stroke|color|stop-color|flood-color|lighting-color)\s*=\s*["']?\s*$/i);
  return Boolean(svgAttribute);
}

function lineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\r") {
      if (source[index + 1] === "\n") index += 1;
      starts.push(index + 1);
    } else if (source[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineAndColumn(starts, offset) {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= offset) low = middle;
    else high = middle;
  }
  return { line: low + 1, column: offset - starts[low] + 1 };
}

function normalizeExceptionPath(file) {
  if (typeof file !== "string" || !file.trim()) return null;
  const normalized = toPosix(path.posix.normalize(file.trim().replaceAll("\\", "/"))).replace(/^\.\//, "");
  if (path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) return null;
  return normalized;
}

function normalizeExceptions(input) {
  if (input && input.__parseError) {
    return {
      allowed: new Set(),
      violations: [{ kind: "exception", file: "<exceptions>", line: 1, column: 1, value: "", message: `Unable to parse theme-color-exceptions.json: ${input.__parseError}` }],
    };
  }
  let entries;
  const violations = [];
  if (Array.isArray(input)) {
    entries = input;
  } else if (input && Object.prototype.hasOwnProperty.call(input, "exceptions") && Array.isArray(input.exceptions)) {
    entries = input.exceptions;
  } else {
    return {
      allowed: new Set(),
      violations: [{ kind: "exception", file: "<exceptions>", line: 1, column: 1, value: "", message: "Theme color exceptions must be an array or an object with an exceptions array (schema)." }],
    };
  }
  const allowed = new Set();
  const references = [];
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
    const invalidValue = values.find((value) => {
      const candidate = value.trim();
      const occurrences = scanColors(candidate, ".css", { contextRequired: false });
      return candidate !== value || occurrences.length !== 1
        || occurrences[0].start !== 0
        || occurrences[0].end !== candidate.length - 1
        || occurrences[0].isGradient;
    });
    if (invalidValue !== undefined) {
      violations.push({ kind: "exception", file: "<exceptions>", line: index + 1, column: 1, value: invalidValue, message: `Exception ${index + 1} must list real CSS color literal values.` });
      return;
    }
    if (typeof reason !== "string" || !reason.trim()) {
      violations.push({ kind: "exception", file: "<exceptions>", line: index + 1, column: 1, value: "", message: `Exception ${index + 1} must include a nonempty reason or purpose.` });
      return;
    }
    references.push({ file, index });
    for (const value of values) allowed.add(`${file}\u0000${value.toLowerCase()}`);
  });
  return { allowed, violations, references };
}

function addColorOccurrence(occurrences, source, start, end) {
  if (end < start) return;
  occurrences.push({ start, end, value: source.slice(start, end + 1), isGradient: false });
}

function variableFallbackOccurrences(bodySource, bodyMasked, extension, baseOffset) {
  const occurrences = [];
  for (let index = 0; index < bodyMasked.length; index += 1) {
    if (!bodyMasked.startsWith("var", index) || /[A-Za-z0-9_-]/.test(bodyMasked[index - 1] || "")) continue;
    let open = index + 3;
    while (/\s/.test(bodyMasked[open] || "")) open += 1;
    if (bodyMasked[open] !== "(") continue;
    const end = findBalancedFunctionEnd(bodyMasked, open);
    let depth = 0;
    let comma = -1;
    for (let cursor = open + 1; cursor < end; cursor += 1) {
      if (bodyMasked[cursor] === "(") depth += 1;
      else if (bodyMasked[cursor] === ")" && depth > 0) depth -= 1;
      else if (bodyMasked[cursor] === "," && depth === 0) {
        comma = cursor;
        break;
      }
    }
    if (comma >= 0) {
      const fallbackStart = comma + 1;
      const fallback = bodySource.slice(fallbackStart, end);
      const nested = scanColors(fallback, extension, {
        contextRequired: false,
        baseOffset: baseOffset + fallbackStart,
      });
      occurrences.push(...nested);
    }
    index = end;
  }
  return occurrences;
}

function isSemanticVariableColorBody(body) {
  const variables = [...body.matchAll(/var\s*\(\s*(--[A-Za-z0-9_-]+)/gi)].map((match) => match[1]);
  if (!variables.length || variables.some((variable) => !variable.toLowerCase().startsWith("--barracks-"))) return false;
  const withoutVariables = body.replace(/var\s*\([^)]*\)/gi, " ");
  if (/(?:#[0-9a-f]{3,8}\b|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\()/i.test(withoutVariables)) return false;
  const words = withoutVariables.match(/[A-Za-z][A-Za-z0-9-]*/g) || [];
  return words.every((word) => ALLOWED_COLOR_SPACE_WORDS.has(word.toLowerCase()));
}

function scanColors(source, extension, { contextRequired = true, baseOffset = 0 } = {}) {
  const masked = maskComments(source, extension);
  const occurrences = [];
  for (let index = 0; index < masked.length; index += 1) {
    const current = masked[index];
    if (current === "#") {
      const previous = masked[index - 1];
      if (isWordCharacter(previous)) continue;
      const match = masked.slice(index).match(/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![A-Za-z0-9_-])/i);
      if (match && isColorContext(masked, source, index, extension, contextRequired)) {
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
      const fallback = variableFallbackOccurrences(source.slice(next + 1, end), body, extension, baseOffset + next + 1);
      const variables = [...body.matchAll(/var\s*\(\s*(--[A-Za-z0-9_-]+)/gi)].map((match) => match[1]);
      const nonBarracksVariable = variables.some((variable) => !variable.toLowerCase().startsWith("--barracks-"));
      const colorContext = isColorContext(masked, source, index, extension, contextRequired);
      if (fallback.length) {
        occurrences.push(...fallback);
      }
      if (nonBarracksVariable && colorContext) {
        addColorOccurrence(occurrences, source, index, end);
      } else if (!fallback.length && !isSemanticVariableColorBody(body) && colorContext) {
        addColorOccurrence(occurrences, source, index, end);
      }
      index = end;
      continue;
    }
    const declaration = findDeclarationProperty(masked, index);
    const namedContext = !contextRequired ? true : extension === ".css"
      ? Boolean((declaration && (isColorProperty(declaration) || declaration.startsWith("--"))) || isDataSvgUrl(masked, index))
      : isColorContext(masked, source, index, extension, contextRequired);
    if (CSS_NAMED_COLORS.has(lower) && !ALLOWED_COLOR_KEYWORDS.has(lower)
      && namedContext && (contextRequired ? (!isInsideFunction(masked, index, "url") || isDataSvgUrl(masked, index)) : true)) {
      addColorOccurrence(occurrences, source, index, identifier.end - 1);
      index = identifier.end - 1;
    } else {
      index = identifier.end - 1;
    }
  }
  if (baseOffset) {
    for (const occurrence of occurrences) occurrence.start += baseOffset;
  }
  return occurrences;
}

function scanGradientViolations(source, extension) {
  const masked = maskComments(source, extension);
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
    const variables = [...body.matchAll(/var\s*\(\s*(--[A-Za-z0-9_-]+)/gi)].map((match) => match[1]);
    const bodySource = source.slice(next + 1, end);
    const literalStops = scanColors(bodySource, extension, { contextRequired: false }).length > 0
      || variableFallbackOccurrences(bodySource, body, extension, next + 1).length > 0;
    const nonBarracksVariable = variables.some((variable) => !variable.toLowerCase().startsWith("--barracks-"));
    if ((literalStops || nonBarracksVariable) && isColorContext(masked, source, index, extension)) {
      occurrences.push({ start: index, end, value: source.slice(index, end + 1), isGradient: true });
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
    return { __parseError: error.message };
  }
}

function auditSources({ root = process.cwd(), files, exceptions } = {}) {
  const absoluteRoot = path.resolve(root);
  let rootIsDirectory = false;
  try {
    rootIsDirectory = fs.statSync(absoluteRoot).isDirectory();
  } catch {
    rootIsDirectory = false;
  }
  if (!rootIsDirectory) {
    return {
      scannedFiles: [],
      violations: [inputViolation(`Invalid root ${absoluteRoot}; root must be an existing directory.`, absoluteRoot)],
    };
  }
  let realRoot;
  try {
    realRoot = fs.realpathSync(absoluteRoot);
  } catch (error) {
    return {
      scannedFiles: [],
      violations: [inputViolation(`Invalid root ${absoluteRoot}; unable to resolve root: ${error.message}`, absoluteRoot)],
    };
  }
  const collected = collectFiles(absoluteRoot, realRoot, files);
  const sourceEntries = collected.entries;
  const eligibleEntries = collectFiles(absoluteRoot, realRoot).entries;
  const exceptionInput = exceptions === undefined ? loadExceptions(absoluteRoot) : exceptions;
  const normalizedExceptions = normalizeExceptions(exceptionInput);
  const violations = [...collected.errors, ...normalizedExceptions.violations];
  const scannedFiles = sourceEntries.map(([relative]) => relative);
  const eligibleFileSet = new Set(eligibleEntries.map(([relative]) => relative));
  for (const reference of normalizedExceptions.references || []) {
    if (!eligibleFileSet.has(reference.file)) {
      violations.push({
        kind: "exception",
        file: "<exceptions>",
        line: reference.index + 1,
        column: 1,
        value: reference.file,
        message: `Exception ${reference.index + 1} references ${reference.file}, which does not resolve to an in-scope scanned source file.`,
      });
    }
  }
  for (const [relative, file] of sourceEntries) {
    const source = fs.readFileSync(file, "utf8");
    const extension = path.extname(file).toLowerCase();
    const variablesFile = path.basename(file).toLowerCase() === "variables.css";
    const occurrences = [...scanColors(source, extension), ...scanGradientViolations(source, extension)];
    const starts = lineStarts(source);
    const maskedSource = variablesFile ? maskComments(source, extension) : null;
    for (const occurrence of occurrences) {
      const property = variablesFile ? findDeclarationProperty(maskedSource, occurrence.start) : null;
      if (!occurrence.isGradient && variablesFile && property && APPROVED_VARIABLE_DECLARATIONS.has(property)) continue;
      if (!occurrence.isGradient && normalizedExceptions.allowed.has(`${relative}\u0000${occurrence.value.toLowerCase()}`)) continue;
      const position = lineAndColumn(starts, occurrence.start);
      violations.push({
        kind: "color",
        file: relative,
        line: position.line,
        column: position.column,
        value: occurrence.value,
        property,
        message: occurrence.isGradient
          ? `Gradient ${occurrence.value} contains literal color stops or non-Barracks variables; use only --barracks-* semantic tokens.`
          : variablesFile
          ? `Color literal ${occurrence.value} is not allowed in variables.css declaration ${property || "<unknown>"}; use an approved semantic token declaration.`
          : `Color literal ${occurrence.value} is not allowed; use a --barracks-* semantic token or an approved exact exception.`,
      });
    }
  }
  violations.sort((first, second) => compareStrings(first.file, second.file)
    || first.line - second.line
    || first.column - second.column
    || compareStrings(first.value, second.value)
    || compareStrings(first.kind, second.kind));
  return { scannedFiles, violations };
}

function parseCliArgs(argv) {
  let root = process.cwd();
  const files = [];
  const errors = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      if (!argv[index + 1] || argv[index + 1].startsWith("-")) {
        errors.push(inputViolation("The --root option requires a directory path."));
      } else {
        root = path.resolve(argv[index + 1]);
      }
      index += 1;
    } else if (argument.startsWith("--root=")) {
      const value = argument.slice("--root=".length);
      if (!value) errors.push(inputViolation("The --root option requires a directory path."));
      else root = path.resolve(value);
    } else if (argument !== "--") {
      if (argument.startsWith("-")) errors.push(inputViolation(`Unknown option ${argument}.`));
      else files.push(argument);
    }
  }
  return { root, files, errors };
}

function formatViolation(violation) {
  const value = violation.value ? ` value=${JSON.stringify(violation.value)}` : "";
  return `${violation.file}:${violation.line}:${violation.column}: ${violation.message}${value}`;
}

function main() {
  const { root, files, errors } = parseCliArgs(process.argv.slice(2));
  const result = auditSources({ root, files });
  result.violations.push(...errors);
  result.violations.sort((first, second) => compareStrings(first.file, second.file)
    || first.line - second.line
    || first.column - second.column
    || compareStrings(first.value, second.value)
    || compareStrings(first.kind, second.kind));
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
