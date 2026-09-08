import assert from "node:assert/strict";
import test from "node:test";

import { HOME_THEME_OPTIONS, normalizeHomeSettings } from "./home-settings.js";

test("home settings preserve the stored neon identifier for compatibility", () => {
  const normalized = normalizeHomeSettings({ theme: "neon" });

  assert.equal(normalized.theme, "neon");
});

test("the legacy neon kiosk theme is presented as Signal", () => {
  const signal = HOME_THEME_OPTIONS.find((option) => option.value === "neon");

  assert.deepEqual(signal, { value: "neon", label: "Signal" });
});
