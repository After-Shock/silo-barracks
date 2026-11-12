/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import axios from "../../../lib/axios_instance";
import i18next from "i18next";
import { Trans } from "react-i18next";

import Timeline from "@mui/lab/Timeline";
import { useMediaQuery, useTheme } from "@mui/material";
import { Button } from "@/components/ui/button";

import "../../css/timeline/activity-timeline.css";

import Config from "../../../lib/config.jsx";
import Loading from "../../../pages/components/general/loading.jsx";

import ActivityTimelineItem from "./activity-timeline-item.jsx";
import { groupAdjacentSeasons } from "./helpers.jsx";

const PAGE_SIZE = 40;

export default function ActivityTimelineComponent(props) {
  const { userId, libraries, onStateChange } = props;
  const theme = useTheme();
  const shouldRenderVertically = useMediaQuery(theme.breakpoints.down("sm"));

  const [timelineEntries, setTimelineEntries] = useState(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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
      const controller = new AbortController();
      axios
        .post(
          "/api/getActivityTimeLine",
          { userId, libraries: libraries || [], limit: PAGE_SIZE, offset: 0 },
          {
            headers: {
              Authorization: `Bearer ${config.token}`,
              "Content-Type": "application/json",
            },
            signal: controller.signal,
          }
        )
        .then((response) => {
          if (cancelled) return;
          const payload = Array.isArray(response.data) ? { results: response.data, hasMore: false } : response.data;
          const entries = [...(payload.results || [])];
          setTimelineEntries(entries);
          setHasMore(Boolean(payload.hasMore));
          hasGoodContent.current = entries.length > 0;
          reportState(entries.length > 0 ? "ready" : "empty");
        })
        .catch((fetchError) => {
          console.log(fetchError);
          if (!cancelled && fetchError.code !== "ERR_CANCELED") {
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

  const loadMore = () => {
    if (isLoadingMore || !hasMore || !config) {
      return;
    }

    setIsLoadingMore(true);
    axios
      .post(
        "/api/getActivityTimeLine",
        {
          userId,
          libraries: libraries || [],
          limit: PAGE_SIZE,
          offset: (timelineEntries || []).length,
        },
        {
          headers: {
            Authorization: `Bearer ${config.token}`,
            "Content-Type": "application/json",
          },
        }
      )
      .then((response) => {
        const payload = Array.isArray(response.data) ? { results: response.data, hasMore: false } : response.data;
        const existing = timelineEntries || [];
        setTimelineEntries([...existing, ...(payload.results || [])]);
        setHasMore(Boolean(payload.hasMore));
        hasGoodContent.current = true;
      })
      .catch((fetchError) => {
        console.log(fetchError);
      })
      .finally(() => {
        setIsLoadingMore(false);
      });
  };

  if (timelineEntries === undefined && !error) {
    return <div className="timeline-loading" aria-busy="true"><Loading /></div>;
  }

  if (timelineEntries === undefined && error) {
    return <section className="timeline-state is-error" role="alert"><p>{error}</p></section>;
  }

  if (timelineEntries.length === 0) {
    return (
      <section className="timeline-state is-empty">
        {error ? <p className="timeline-notice is-error" role="alert">{error}</p> : null}
        <p><Trans i18nKey="ACTIVITY_STATES.TIMELINE_EMPTY" /></p>
      </section>
    );
  }

  const groupedEntries = groupAdjacentSeasons([...timelineEntries]);

  return (
    <div className="timeline-results">
      {error ? <p className="timeline-notice is-error" role="alert">{error}</p> : null}
      <Timeline position="alternate">
        {groupedEntries.map((entry, index) => (
          <ActivityTimelineItem
            key={`${entry.NowPlayingItemId}-${entry.FirstActivityDate}-${entry.LastActivityDate}`}
            shouldRenderVertically={shouldRenderVertically}
            eager={index < 6}
            {...entry}
          />
        ))}
      </Timeline>
      {hasMore && (
        <div className="activity-timeline-more">
          <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
            {isLoadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
