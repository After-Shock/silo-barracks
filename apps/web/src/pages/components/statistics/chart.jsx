import SeriesAreaChart, { buildChartRows, buildChartSeries } from "./series-area-chart";

function Chart({ stats, libraries, viewName }) {
  const series = buildChartSeries(libraries.map((library) => library.Name));
  const rows = buildChartRows(stats, series, (row, libraryName) => row[libraryName]?.[viewName] ?? 0);

  return <SeriesAreaChart data={rows} series={series} unit={viewName === "count" ? "Views" : "Minutes"} />;
}

export default Chart;
