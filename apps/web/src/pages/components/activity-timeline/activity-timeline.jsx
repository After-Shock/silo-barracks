/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import axios from "../../../lib/axios_instance";
import i18next from "i18next";
import { Trans } from "react-i18next";

import Timeline from "@mui/lab/Timeline";

import "../../css/timeline/activity-timeline.css";

import Config from "../../../lib/config.jsx";
import Loading from "../../../pages/components/general/loading.jsx";

import ActivityTimelineItem from "./activity-timeline-item.jsx";
import { groupAdjacentSeasons } from "./helpers.jsx";

export default function ActivityTimelineComponent(props) {
  const { userId, libraries, onStateChange } = props;
  const [timelineEntries, setTimelineEntries] = useState();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  const hasGoodContent = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const reportState = (state) => {
      if (!cancelled) onStateChange?.(state);
    };

    const fetchConfig = async () => {
      try {
        const newConfig = await Config.getConfig();
        if (!cancelled) setConfig(newConfig);
      } catch (fetchError) {
        console.log(fetchError);
        if (!cancelled) {
          setError(i18next.t("ACTIVITY_STATES.TIMELINE_CONFIG_ERROR"));
          reportState(hasGoodContent.current ? "partial" : "error");
        }
      }
    };

    const fetchTimeline = () => {
      if (!config) return;

      reportState(hasGoodContent.current ? "refreshing" : "loading");
      setError("");
      axios
        .post(
          "/api/getActivityTimeLine",
          { userId, libraries },
          {
            headers: {
              Authorization: `Bearer ${config.token}`,
              "Content-Type": "application/json",
            },
          }
        )
        .then((response) => {
          if (cancelled) return;
          const groupedEntries = groupAdjacentSeasons([...(response.data || [])]);
          setTimelineEntries(groupedEntries);
          hasGoodContent.current = groupedEntries.length > 0;
          reportState(groupedEntries.length > 0 ? "ready" : "empty");
        })
        .catch((fetchError) => {
          console.log(fetchError);
          if (!cancelled) {
            setError(i18next.t("ACTIVITY_STATES.TIMELINE_ACTIVITY_ERROR"));
            reportState(hasGoodContent.current ? "partial" : "error");
          }
        });
    };

    if (!config) fetchConfig();
    fetchTimeline();

    return () => {
      cancelled = true;
    };
  }, [userId, libraries, config, onStateChange]);

  if (timelineEntries === undefined && !error) {
    return <div className="timeline-loading" aria-busy="true"><Loading /></div>;
  }

  if (timelineEntries === undefined && error) {
    return <section className="timeline-state is-error" role="alert"><p>{error}</p></section>;
  }

  if (timelineEntries.length === 0) {
    return <section className="timeline-state is-empty"><p><Trans i18nKey="ACTIVITY_STATES.TIMELINE_EMPTY" /></p></section>;
  }

  return (
    <div className="timeline-results">
      {error ? <p className="timeline-notice is-error" role="alert">{error}</p> : null}
      <Timeline position="alternate">
        {timelineEntries.map((entry) => (
          <ActivityTimelineItem
            key={`${entry.Title}-${entry.FirstActivityDate}-${entry.LastActivityDate}`}
            {...entry}
          />
        ))}
      </Timeline>
    </div>
  );
}
