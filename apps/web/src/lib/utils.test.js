import test from "node:test";
import assert from "node:assert/strict";
import { cn } from "./utils.js";

test("cn resolves conflicting tw:-prefixed utilities, last one wins", () => {
  assert.equal(cn("tw:flex tw:p-6", "tw:grid tw:p-0"), "tw:grid tw:p-0");
  assert.equal(cn("tw:rounded-lg", "tw:rounded-[28px]"), "tw:rounded-[28px]");
});

test("cn leaves legacy unprefixed classes alone", () => {
  assert.equal(cn("navitem p-2", "tw:p-0"), "navitem p-2 tw:p-0");
});
