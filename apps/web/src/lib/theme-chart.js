import { DEFAULT_THEME, getThemeTokens, resolveTheme } from "./theme.js";

const THEME_EVENT = "silo-barracks-theme-updated";

export function getChartTheme(tokens = getThemeTokens() || resolveTheme(DEFAULT_THEME).tokens) {
  return {
    grid: tokens.chartGrid,
    tooltip: tokens.chartTooltip,
    series: [tokens.chart1, tokens.chart2, tokens.chart3, tokens.chart4, tokens.chart5, tokens.chart6],
  };
}

export function subscribeThemeTokens(eventTarget, callback) {
  if (!eventTarget?.addEventListener || typeof callback !== "function") {
    return () => {};
  }

  const handleThemeUpdate = (event) => callback(event.detail);
  eventTarget.addEventListener(THEME_EVENT, handleThemeUpdate);
  return () => eventTarget.removeEventListener?.(THEME_EVENT, handleThemeUpdate);
}
