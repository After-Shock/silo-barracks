import { useEffect, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { getChartTheme, subscribeThemeTokens } from "../../../lib/theme-chart";

function PlayMethodChart({ stats, types }) {
  const [chartTheme, setChartTheme] = useState(() => getChartTheme());

  useEffect(() => subscribeThemeTokens(typeof window === "undefined" ? undefined : window, (tokens) => setChartTheme(getChartTheme(tokens))), []);

  const colors = chartTheme.series;
  const CustomTooltip = ({ payload, label, active }) => {
    if (!active) return null;
    return (
      <div className="stats-tooltip">
        <p className="stats-tooltip-title">{label}</p>
        {types.map((type, index) => (
          <p key={type.Id} className="stats-tooltip-row" style={{ color: colors[index % colors.length] }}>
            {`${type.Name} : ${payload?.[index]?.value ?? 0} Views`}
          </p>
        ))}
      </div>
    );
  };

  const max = (stats || []).reduce((highest, datum) => (
    Math.max(highest, ...Object.entries(datum).filter(([key]) => key !== "Key").map(([, value]) => Number.parseInt(value, 10) || 0))
  ), 0) + 10;

  return (
    <ResponsiveContainer width="100%">
      <AreaChart data={stats} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          {types.map((type, index) => (
            <linearGradient key={type.Id} id={`chart-method-${type.Id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors[index % colors.length]} stopOpacity={0.8} />
              <stop offset="95%" stopColor={colors[index % colors.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <XAxis dataKey="Key" interval={0} angle={-60} textAnchor="end" height={100} stroke={chartTheme.grid} tick={{ fill: "var(--barracks-text-muted-raised)" }} />
        <YAxis domain={[0, max]} stroke={chartTheme.grid} tick={{ fill: "var(--barracks-text-muted-raised)" }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend verticalAlign="bottom" wrapperStyle={{ color: "var(--barracks-text-interactive)" }} />
        {types.map((type, index) => (
          <Area
            key={type.Id}
            type="monotone"
            dataKey={type.Name}
            stroke={colors[index % colors.length]}
            fillOpacity={1}
            fill={`url(#chart-method-${type.Id})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default PlayMethodChart;
