import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

// The theme ships six categorical slots (--chart-1..6). Colors are assigned in
// that fixed order and never cycled: past six series the tail folds into "Other".
export const CHART_SERIES_SLOTS = 6;

export function buildChartSeries(names) {
  const keep = names.length > CHART_SERIES_SLOTS ? CHART_SERIES_SLOTS - 1 : names.length;
  const series = names.slice(0, keep).map((name, index) => ({
    key: `s${index}`,
    label: name,
    color: `var(--chart-${index + 1})`,
    sources: [name],
  }));
  if (names.length > keep) {
    series.push({ key: "other", label: "Other", color: `var(--chart-${CHART_SERIES_SLOTS})`, sources: names.slice(keep) });
  }
  return series;
}

// Rows keyed by stable series keys, so names with dots or spaces are safe as recharts dataKeys.
export function buildChartRows(rows, series, readValue) {
  return (rows || []).map((row) => {
    const next = { Key: row.Key };
    for (const item of series) {
      next[item.key] = item.sources.reduce((sum, source) => sum + (Number(readValue(row, source)) || 0), 0);
    }
    return next;
  });
}

function SeriesTooltipRow({ value, label, color, unit }) {
  return (
    <div className="tw:flex tw:w-full tw:items-center tw:gap-2">
      <span aria-hidden="true" className="tw:h-0.5 tw:w-3 tw:shrink-0 tw:rounded-full" style={{ backgroundColor: color }} />
      <span className="tw:font-semibold tw:tabular-nums tw:text-foreground">
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit ? <span className="tw:font-normal tw:text-muted-foreground"> {unit}</span> : null}
      </span>
      <span className="tw:ml-auto tw:pl-3 tw:text-muted-foreground">{label}</span>
    </div>
  );
}

const tick = { fontSize: 11, fontWeight: 600 };

/**
 * Stacked-in-z (not summed) area chart for one measure over time.
 * One y-axis, 2px lines, ~10% area wash, hairline grid, value-first tooltip
 * listing every series, legend only when there is more than one series.
 */
export default function SeriesAreaChart({ data, series, unit, className }) {
  const config = Object.fromEntries(series.map((item) => [item.key, { label: item.label, color: item.color }]));

  return (
    <ChartContainer config={config} className={className ?? "tw:aspect-auto tw:h-full tw:w-full"}>
      <AreaChart data={data} margin={{ top: 12, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
        <XAxis dataKey="Key" interval={0} angle={-42} textAnchor="end" height={86} tickLine={false} axisLine={false} tickMargin={6} tick={tick} />
        <YAxis domain={[0, "auto"]} allowDecimals={false} tickLine={false} axisLine={false} width={44} tick={tick} />
        <ChartTooltip
          cursor={{ strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              className="tw:min-w-44"
              formatter={(value, name, item) => (
                <SeriesTooltipRow value={value} unit={unit} label={config[item.dataKey]?.label ?? name} color={item.color} />
              )}
            />
          }
        />
        {series.length > 1 ? <ChartLegend verticalAlign="bottom" itemSorter={null} content={<ChartLegendContent className="tw:flex-wrap tw:gap-x-4 tw:gap-y-1" />} /> : null}
        {series.map((item) => (
          <Area
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            strokeWidth={2}
            fill={item.color}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
