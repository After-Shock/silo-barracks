import { useEffect, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { getChartTheme, subscribeThemeTokens } from "../../../lib/theme-chart";

function Chart({ stats, libraries, viewName }) {
  const [chartTheme, setChartTheme] = useState(() => getChartTheme());

  useEffect(() => subscribeThemeTokens(typeof window === "undefined" ? undefined : window, (tokens) => setChartTheme(getChartTheme(tokens))), []);

  const colors = chartTheme.series;
  const flattenedStats = stats.map((item) => {
    const flatItem = { Key: item.Key };
    for (const [libraryName, data] of Object.entries(item)) {
      if (libraryName === "Key") continue;
      flatItem[libraryName] = data[viewName] ?? 0;
    }
    return flatItem;
  });

  const CustomTooltip = ({ payload, label, active }) => {
    if (!active) return null;
    return (
      <div className="stats-tooltip">
        <p className="stats-tooltip-title">{label}</p>
        {libraries.map((library, index) => (
          <p key={library.Id} className="stats-tooltip-row" style={{ color: colors[index % colors.length] }}>
            {`${library.Name} : ${payload?.find((entry) => entry.dataKey === library.Name)?.value ?? 0} ${viewName === "count" ? "Views" : "Minutes"}`}
          </p>
        ))}
      </div>
    );
  };

  const max = flattenedStats.reduce((highest, datum) => (
    Math.max(highest, ...libraries.map((library) => Number.parseFloat(datum[library.Name]) || 0))
  ), 0) + 10;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={flattenedStats} margin={{ top: 12, right: 24, left: 0, bottom: 8 }}>
        <defs>
          {libraries.map((library, index) => (
            <linearGradient key={library.Id} id={`chart-library-${library.Id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors[index % colors.length]} stopOpacity={0.72} />
              <stop offset="95%" stopColor={colors[index % colors.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <XAxis dataKey="Key" interval={0} angle={-42} textAnchor="end" height={86} stroke={chartTheme.grid} tick={{ fill: "var(--barracks-text-muted-raised)", fontSize: 11, fontWeight: 700 }} />
        <YAxis domain={[0, max]} stroke={chartTheme.grid} tick={{ fill: "var(--barracks-text-muted-raised)", fontSize: 11, fontWeight: 700 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend verticalAlign="bottom" wrapperStyle={{ color: "var(--barracks-text-interactive)", fontSize: 12, fontWeight: 800 }} />
        {libraries.map((library, index) => (
          <Area
            key={library.Id}
            type="monotone"
            dataKey={library.Name}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            fillOpacity={1}
            fill={`url(#chart-library-${library.Id})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default Chart;
