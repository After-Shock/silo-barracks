const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const { resolve } = require("node:path");

test("upstream documentation uses VitePress public asset paths", () => {
  const document = readFileSync(
    resolve(__dirname, "../docs/upstream-jellyglance.md"),
    "utf8",
  );

  assert.doesNotMatch(document, /(?:src|srcset)="docs\/public\//);
});
