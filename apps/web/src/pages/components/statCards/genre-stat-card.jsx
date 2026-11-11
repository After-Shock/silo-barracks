import { useEffect, useState } from "react";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import ErrorBoundary from "../general/ErrorBoundary.jsx";

import "../../css/genres.css";
import { Trans } from "react-i18next";
import i18next from "i18next";

function GenreStatCard(props) {
  const [maxRange, setMaxRange] = useState(100);
  const [data, setData] = useState(props.data);
  useEffect(() => {
    const maxDuration = props.data.reduce((max, item) => {
      return Math.max(max, parseFloat((props.dataKey == "duration" ? item.duration : item.plays) || 0));
    }, 0);
    setMaxRange(maxDuration);

    let sorted = [...props.data]
      .sort((a, b) => {
        const valueA = parseFloat(props.dataKey === "duration" ? a.duration : a.plays) || 0;
        const valueB = parseFloat(props.dataKey === "duration" ? b.duration : b.plays) || 0;
        return valueB - valueA; // Descending order
      })
      .slice(0, 15); // Take only the top 10

    // Sort top 10 genres alphabetically
    sorted = sorted.sort((a, b) => a.genre.localeCompare(b.genre));

    setData(sorted);
  }, [props.data, props.dataKey]);

  const chartConfig = { [props.dataKey]: { label: props.dataKey == "duration" ? i18next.t("SETTINGS_PAGE.DURATION") : i18next.t("TOTAL_PLAYS"), color: "var(--chart-1)" } };

  function formatTotalWatchTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    let timeString = "";

    if (hours > 0) {
      timeString += `${hours} ${hours === 1 ? i18next.t("UNITS.HOUR").toLowerCase() : i18next.t("UNITS.HOURS").toLowerCase()} `;
    }

    if (minutes > 0) {
      timeString += `${minutes} ${
        minutes === 1 ? i18next.t("UNITS.MINUTE").toLowerCase() : i18next.t("UNITS.MINUTES").toLowerCase()
      } `;
    }

    if (remainingSeconds > 0) {
      timeString += `${remainingSeconds} ${
        remainingSeconds === 1 ? i18next.t("UNITS.SECOND").toLowerCase() : i18next.t("UNITS.SECONDS").toLowerCase()
      }`;
    }

    return timeString.trim();
  }

  return (
    <div className="genre-stats">
      <h1 className="my-3 text-center">
        <Trans i18nKey={props.dataKey == "duration" ? "SETTINGS_PAGE.DURATION" : "TOTAL_PLAYS"} />
      </h1>
      <ErrorBoundary>
        <ChartContainer config={chartConfig} className="tw:aspect-auto tw:h-full tw:w-full">
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
            <PolarGrid gridType="circle" stroke="var(--border)" />
            <PolarAngleAxis dataKey="genre" tick={{ fill: "var(--barracks-text-muted-raised)", fontSize: 12 }} />
            <PolarRadiusAxis domain={[0, maxRange]} tick={false} axisLine={false} />
            <Radar
              name={chartConfig[props.dataKey].label}
              dataKey={props.dataKey}
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="var(--chart-1)"
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.genre}
                  formatter={(value) => (
                    <div className="tw:flex tw:items-center tw:gap-2">
                      <span aria-hidden="true" className="tw:h-0.5 tw:w-3 tw:shrink-0 tw:rounded-full tw:bg-chart-1" />
                      <span className="tw:font-semibold tw:tabular-nums tw:text-foreground">
                        {props.dataKey == "duration" ? formatTotalWatchTime(value) : `${value} ${i18next.t("UNITS.PLAYS")}`}
                      </span>
                    </div>
                  )}
                />
              }
            />
          </RadarChart>
        </ChartContainer>
      </ErrorBoundary>
    </div>
  );
}

export default GenreStatCard;
