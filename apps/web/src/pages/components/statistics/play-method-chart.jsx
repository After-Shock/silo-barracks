import SeriesAreaChart, { buildChartRows, buildChartSeries } from "./series-area-chart";

function PlayMethodChart({ stats, types }) {
  const series = buildChartSeries(types.map((type) => type.Name));
  const rows = buildChartRows(stats, series, (row, typeName) => Number.parseInt(row[typeName], 10) || 0);

  return <SeriesAreaChart data={rows} series={series} unit="Views" />;
}

export default PlayMethodChart;
