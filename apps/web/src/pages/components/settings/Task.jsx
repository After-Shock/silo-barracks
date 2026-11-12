import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import i18next from "i18next";
import { RiLinksLine, RiPlayCircleLine, RiStopCircleLine, RiTimerLine } from "@remixicon/react";

import "../../css/settings/settings.css";

function Task({ task, taskState, processing, taskIntervals, updateTask, onClick, stopTask, webhookEvents }) {
  const intervals = [
    { value: 15, display: i18next.t("SETTINGS_PAGE.INTERVALS.15_MIN") },
    { value: 30, display: i18next.t("SETTINGS_PAGE.INTERVALS.30_MIN") },
    { value: 60, display: i18next.t("SETTINGS_PAGE.INTERVALS.1_HOUR") },
    { value: 720, display: i18next.t("SETTINGS_PAGE.INTERVALS.12_HOURS") },
    { value: 1440, display: i18next.t("SETTINGS_PAGE.INTERVALS.1_DAY") },
    { value: 10080, display: i18next.t("SETTINGS_PAGE.INTERVALS.1_WEEK") },
  ];
  const state = taskState ? taskState.find((state) => state.task === task.name) : null;
  const interval = taskIntervals?.[task.name]?.Interval || 15;
  const intervalLabel = intervals.find((item) => item.value === interval)?.display || `${interval} minutes`;
  const hasTaskWebhook = webhookEvents?.task_completed?.enabled || webhookEvents?.task_failed?.enabled || webhookEvents?.task_started?.enabled;

  return (
    <article className={`task-card ${state?.running ? "is-running" : ""}`}>
      <div className="task-card-top">
        <span>{task.group}</span>
        <strong>{state?.running ? "Running" : "Ready"}</strong>
      </div>

      <div className="task-card-main">
        <h2>{task.title}</h2>
        <p>{task.description}</p>
      </div>

      <div className="task-card-meta">
        <div>
          <RiTimerLine size={18} />
          <span>{task.type === "JOB" ? intervalLabel : "Manual"}</span>
        </div>
        <div className={hasTaskWebhook ? "is-enabled" : ""}>
          <RiLinksLine size={18} />
          <span>{hasTaskWebhook ? "Webhook wired" : "No task webhook"}</span>
        </div>
      </div>

      <div className="task-card-actions">
        {task.type === "JOB" ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="dropdown-basic task-interval-toggle">
                {intervalLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="task-interval-menu">
              {intervals.map((interval) => (
                <DropdownMenuItem onSelect={() => updateTask(task.name, interval.value)} value={interval.value} key={interval.value}>
                  {interval.display}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span />
        )}

        {state?.running ? (
          <Button variant="destructive" onClick={() => stopTask(task.name)} disabled={processing}>
            <RiStopCircleLine size={17} className="tw:size-[17px]" />
            Stop
          </Button>
        ) : (
          <Button onClick={() => onClick(task.link)} disabled={processing}>
            <RiPlayCircleLine size={17} className="tw:size-[17px]" />
            Start
          </Button>
        )}
      </div>
    </article>
  );
}

export default Task;
