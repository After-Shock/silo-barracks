import assert from "node:assert/strict";
import test from "node:test";

import { getChartTheme, subscribeThemeTokens } from "./theme-chart.js";

test("getChartTheme maps semantic tokens to chart-ready grid, tooltip, and six series colors", () => {
  const tokens = {
    chartGrid: "#111111",
    chartTooltip: "#222222",
    chart1: "#333333",
    chart2: "#444444",
    chart3: "#555555",
    chart4: "#666666",
    chart5: "#777777",
    chart6: "#888888",
  };

  assert.deepEqual(getChartTheme(tokens), {
    grid: "#111111",
    tooltip: "#222222",
    series: ["#333333", "#444444", "#555555", "#666666", "#777777", "#888888"],
  });
});

test("subscribeThemeTokens only observes silo-barracks theme updates and unsubscribes cleanly", () => {
  const listeners = new Map();
  const eventTarget = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const updates = [];
  const unsubscribe = subscribeThemeTokens(eventTarget, (tokens) => updates.push(tokens));

  assert.deepEqual([...listeners.keys()], ["silo-barracks-theme-updated"]);
  listeners.get("silo-barracks-theme-updated")({ detail: { chart1: "#abc123" } });
  assert.deepEqual(updates, [{ chart1: "#abc123" }]);

  unsubscribe();
  assert.equal(listeners.size, 0);
});
