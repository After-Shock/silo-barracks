"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("library pagination compares window scroll with the reachable document height", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "apps/web/src/pages/components/library/library-items.jsx"),
    "utf8",
  );

  assert.match(source, /window\.innerHeight \+ window\.scrollY >= document\.documentElement\.scrollHeight - 100/);
  assert.doesNotMatch(source, /window\.innerHeight \+ window\.scrollY >= document\.body\.offsetHeight/);
});
