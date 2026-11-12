import { useEffect, useState } from "react";
import axios from "../../../lib/axios_instance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MoonClearLineIcon from "remixicon-react/MoonClearLineIcon";

const DAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
];
const INTRO_PATTERN = /(intro|credit|outro|media ?segment|skip ?detect)/i;

// Mirrors apps/api/classes/quiet-hours.js classifyTask for the normalised task shape.
export function quietHoursKind(task = {}) {
  const key = String(task.key || "");
  const name = `${task.name || ""} ${task.category || ""}`;
  if (key === "RefreshLibrary" || /scan (media )?librar/i.test(name)) return "scan";
  if (INTRO_PATTERN.test(key) || INTRO_PATTERN.test(name)) return "intro";
  return null;
}

export function isHeldByQuietHours(quiet, task) {
  if (!quiet?.enabled) return false;
  const kind = quietHoursKind(task);
  return (kind === "scan" && quiet.scans) || (kind === "intro" && quiet.intros);
}

function formatTime(value, timeZone) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

export default function QuietHoursPanel({ quiet, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (quiet) setDraft({ ...quiet });
  }, [quiet]);

  if (!draft) return null;
  const tz = quiet.effectiveTimeZone;
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const toggleDay = (day) =>
    set("days", draft.days.includes(day) ? draft.days.filter((entry) => entry !== day) : [...draft.days, day]);

  async function save(extra = {}) {
    setSaving(true);
    setError("");
    try {
      const { enabled, start, end, timeZone, days, scans, intros, runDeferred } = draft;
      const response = await axios.put("/server-tasks/quiet-hours", {
        enabled,
        start,
        end,
        timeZone,
        days,
        scans,
        intros,
        runDeferred,
        ...extra,
      });
      onSaved?.(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Unable to save quiet hours");
    } finally {
      setSaving(false);
    }
  }

  let status = "Off";
  if (quiet.enabled && quiet.active) status = `In quiet hours until ${formatTime(quiet.nextChangeAt, tz)}`;
  else if (quiet.enabled) status = quiet.nextChangeAt ? `Next quiet hours ${formatTime(quiet.nextChangeAt, tz)}` : "On";

  return (
    <article className={`server-management-panel quiet-hours-panel${quiet.enabled && quiet.active ? " is-quiet" : ""}`}>
      <div className="server-management-panel-heading">
        <MoonClearLineIcon size={22} />
        <div>
          <h2>Quiet hours</h2>
          <p>Hold library scans and intro/credits detection while people are watching.</p>
        </div>
        <span className={`quiet-hours-status${quiet.enabled && quiet.active ? " is-active" : ""}`}>{status}</span>
      </div>

      <label className="form-check form-switch">
        <input
          id="quiet-hours-enabled"
          type="checkbox"
          role="switch"
          className="form-check-input"
          checked={draft.enabled}
          onChange={(event) => set("enabled", event.target.checked)}
        />
        <span>Enable quiet hours</span>
      </label>
      <div className="quiet-hours-times">
        <div>
          <Label htmlFor="quiet-hours-start">From</Label>
          <Input type="time" id="quiet-hours-start" value={draft.start} onChange={(event) => set("start", event.target.value)} />
        </div>
        <div>
          <Label htmlFor="quiet-hours-end">Until</Label>
          <Input type="time" id="quiet-hours-end" value={draft.end} onChange={(event) => set("end", event.target.value)} />
        </div>
        <div>
          <Label htmlFor="quiet-hours-tz">Time zone</Label>
          <Input
            id="quiet-hours-tz"
            value={draft.timeZone}
            placeholder={`Server (${quiet.serverTimeZone})`}
            onChange={(event) => set("timeZone", event.target.value.trim())}
          />
        </div>
      </div>
      <div className="quiet-hours-days" role="group" aria-label="Quiet hours days">
        {DAYS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={draft.days.includes(key) ? "is-active" : ""}
            aria-pressed={draft.days.includes(key)}
            onClick={() => toggleDay(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="quiet-hours-options">
        <label className="form-check">
          <input
            id="quiet-hours-scans"
            type="checkbox"
            className="form-check-input"
            checked={draft.scans}
            onChange={(event) => set("scans", event.target.checked)}
          />
          <span>Hold library scans</span>
        </label>
        <label className="form-check">
          <input
            id="quiet-hours-intros"
            type="checkbox"
            className="form-check-input"
            checked={draft.intros}
            onChange={(event) => set("intros", event.target.checked)}
          />
          <span>Hold intro / credits detection</span>
        </label>
        <label className="form-check">
          <input
            id="quiet-hours-run-deferred"
            type="checkbox"
            className="form-check-input"
            checked={draft.runDeferred}
            onChange={(event) => set("runDeferred", event.target.checked)}
          />
          <span>Run held jobs once quiet hours end</span>
        </label>
      </div>
      <small className="quiet-hours-note">
        A window that crosses midnight belongs to the day it starts. Jobs Jellyfin starts on its own schedule are stopped and
        {draft.runDeferred ? " run once when the window ends" : " wait for their next Jellyfin schedule"}. Pressing Run here always works,
        even in quiet hours.
      </small>
      {quiet.deferred?.length ? (
        <div className="quiet-hours-deferred">
          <span>Waiting for quiet hours to end</span>
          <ul>
            {quiet.deferred.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.name}</strong> · held {formatTime(entry.deferredAt, tz)}
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" disabled={saving} onClick={() => save({ clearDeferred: true })}>
            Forget held jobs
          </Button>
        </div>
      ) : null}
      {error ? <small className="text-danger">{error}</small> : null}
      <div>
        <Button type="button" disabled={saving} onClick={() => save()}>
          {saving ? "Saving..." : "Save quiet hours"}
        </Button>
      </div>
    </article>
  );
}
