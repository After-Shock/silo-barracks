/* eslint-disable react/prop-types */
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import axios from "../../../lib/axios_instance";

import { RiAccountCircleFill, RiArrowDownSLine, RiChatSmile2Line, RiPauseFill, RiPlayFill, RiStopCircleLine } from "@remixicon/react";

import { PlatformIcon } from "../../../lib/platform-icons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import IpInfoModal from "../ip-info";
import { Trans } from "react-i18next";
import baseUrl from "../../../lib/baseurl";
import siloIcon from "../../../../public/brand/barracks-mark.svg";

import SessionGlanceStrip from "./session-glance-strip";
import TranscodeExplainer from "./transcode-explainer";
import { formatTicks, getSessionProgress } from "../../../lib/session-progress";


function formatTranscodeReasons(session) {
  const reasons = session?.TranscodingInfo?.TranscodeReasons;
  if (Array.isArray(reasons) && reasons.length) {
    return reasons
      .map((reason) => String(reason).replace(/([a-z])([A-Z])/g, "$1 $2"))
      .join(", ");
  }
  const transcoding = session?.TranscodingInfo;
  if (!transcoding) return "";
  const parts = [];
  if (transcoding.IsVideoDirect === false) parts.push("Video remux/transcode");
  if (transcoding.IsAudioDirect === false) parts.push("Audio remux/transcode");
  return parts.join(", ");
}

function readTwelveHour() {
  try {
    return Boolean(JSON.parse(localStorage.getItem("12hr")));
  } catch {
    return false;
  }
}

function publicSiloPoster(value) {
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Missing artwork uses the local Silo placeholder. */ }
  return siloIcon;
}

function ticksToTimeString(ticks) {
  // Convert ticks to seconds
  const seconds = Math.floor(ticks / 10000000);
  // Calculate hours, minutes, and remaining seconds
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  // Format the time string as hh:MM:ss
  const timeString = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;

  return timeString;
}

function getETA(NowPlayingItem, PlayState) {
  if (NowPlayingItem.ChannelType && NowPlayingItem.ChannelType === "TV") {
    return NowPlayingItem.CurrentProgram?.EndDate
      ? new Date(NowPlayingItem.CurrentProgram.EndDate).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: JSON.parse(localStorage.getItem("12hr")),
        })
      : "";
  }
  const ticks = Math.max(0, Number(NowPlayingItem.RunTimeTicks || 0) - Number(PlayState.PositionTicks || 0));
  return getETAFromTicks(ticks);


function getETAFromTicks(ticks) {
  // Get current date
  const currentDate = Date.now();

  // Calculate ETA
  const etaMillis = currentDate + ticks / 10000;
  const eta = new Date(etaMillis);
  const twelve_hr = JSON.parse(localStorage.getItem("12hr"));

  // Return formated string in user locale
  return eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: twelve_hr });
}
}

function lastStreamPart(value) {
  const parts = String(value || "").split("->");
  return parts[parts.length - 1].trim();
}

// Short, client-agnostic pills: playback method, resolution/codec and bitrate.
function getSessionPills(session) {
  const item = session.NowPlayingItem || {};
  const transcoding = session.TranscodingInfo;
  const pills = [];
  const videoTranscode = Boolean(transcoding) && transcoding.IsVideoDirect === false;
  const audioTranscode = Boolean(transcoding) && transcoding.IsAudioDirect === false;

  if (videoTranscode) {
    pills.push({ key: "method", label: "Video transcode", tone: "warn" });
  } else {
    pills.push({ key: "method", label: session.PlayState?.PlayMethod === "DirectStream" ? "Direct stream" : "Direct play", tone: "ok" });
  }
  if (audioTranscode) {
    pills.push({ key: "audio", label: "Audio transcode", tone: "warn" });
  }

  const videoMatch = /\(([^-\s)]+)-([^\s)]+)/.exec(item.VideoStream || "");
  if (videoMatch) {
    const target = /->\s*([^-\s)]+)-([^\s)]+)/.exec(item.VideoStream || "");
    const codec = target ? target[1] : videoMatch[1];
    const resolution = target ? target[2] : videoMatch[2];
    pills.push({ key: "video", label: `${resolution} · ${codec}` });
  }

  const bitrate = lastStreamPart(item.VideoBitrateStream);
  if (bitrate) {
    pills.push({ key: "bitrate", label: bitrate });
  }
  return pills;
}

function formatStreamDetail(value) {
  const inner = /\((.*)\)/.exec(String(value || ""));
  return (inner ? inner[1] : String(value || ""))
    .replace(/->/g, "→")
    .replace(/-(\d+)Ch/gi, " $1ch")
    .trim();
}

function formatClock(date) {
  if (!date) return "";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: JSON.parse(localStorage.getItem("12hr")),
  });
}

function getLiveTvEnd(nowPlaying) {
  const endDate = nowPlaying.CurrentProgram?.EndDate;
  return endDate ? new Date(endDate) : null;
}

function SessionDetailItem({ label, value, wide = false }) {
  if (!value) return null;

  return (
    <div className={`session-popout-detail${wide ? " is-wide" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SessionCardDetailRow({ label, children, className = "", short = false }) {
  return (
    <div className={`session-details-row ${className}`.trim()}>
      <span className="session-details-title text-end text-uppercase">{label}</span>
      <div className={`ellipse session-details-value${short ? " session-details-value-short" : ""}`}>{children}</div>
    </div>
  );
}

// Hover hint on a single element (replaces the MUI `<Tooltip title>` API).
// Renders the child untouched when there is no text to show.
function HintTooltip({ title, children }) {
  if (!title) return children;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>{title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SessionField({ label, value, title }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="session-field">
      <span className="session-field-label">{label}</span>
      <HintTooltip title={title || (typeof value === "string" ? value : "")}>
        <span className="session-field-value">{value}</span>
      </HintTooltip>

    </div>
  );
}

function defaultMessageDateTime(minutesAhead = 15) {
  const date = new Date(Date.now() + minutesAhead * 60 * 1000);
  date.setSeconds(0, 0);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function tonightMessageDateTime() {
  const date = new Date();
  date.setHours(22, 0, 0, 0);
  if (date.getTime() <= Date.now()) {
    date.setDate(date.getDate() + 1);
  }
  return defaultMessageDateTime(Math.max(1, Math.round((date.getTime() - Date.now()) / 60000)));
}

function formatMessageTime(value) {
  if (!value) return "the scheduled time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  let twelveHour;
  try {
    twelveHour = JSON.parse(localStorage.getItem("12hr"));
  } catch {
    twelveHour = false;
  }
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: Boolean(twelveHour),
  });
}

function applySessionMessageTemplate(template, session, title, timeValue) {
  return String(template || "")
    .replaceAll("{user}", session.UserName || "there")
    .replaceAll("{device}", session.DeviceName || session.Client || "your device")
    .replaceAll("{title}", title || session.NowPlayingItem?.Name || "this")
    .replaceAll("{time}", formatMessageTime(timeValue));
}

const SESSION_MESSAGE_TEMPLATES = [
  { id: "custom", label: "Custom", emoji: "✏️", group: "Write your own", text: "" },
  { id: "pause", label: "Please pause", emoji: "⏸️", group: "Playback", text: "{user}, please pause when you can." },
  { id: "enjoy", label: "No rush", emoji: "🎬", group: "Playback", text: "No rush — enjoy {title}." },
  { id: "credits", label: "Skip credits", emoji: "⏭️", group: "Playback", text: "Skip the credits when you can so the next episode does not autoplay." },
  { id: "volume", label: "Volume down", emoji: "🔉", group: "Playback", text: "Please turn the volume down a bit." },
  { id: "buffer", label: "Buffering?", emoji: "🔄", group: "Playback", text: "If {title} is buffering, try pausing for a few seconds or dropping quality." },
  { id: "stopping", label: "Stopping soon", emoji: "⏹️", group: "Playback", text: "Playback may be stopped at {time}.", needsTime: true, defaultMinutes: 10 },
  { id: "dinner", label: "Dinner's ready", emoji: "🍽️", group: "Household", text: "Dinner's ready — pause {title} when you get to a good spot." },
  { id: "bedtime", label: "Bedtime", emoji: "🌙", group: "Household", text: "Heading to bed around {time}. Please wrap up {title} soon.", needsTime: true, defaultMinutes: 20 },
  { id: "downstairs", label: "Come downstairs", emoji: "🏠", group: "Household", text: "{user}, can you come downstairs when you hit a pause?" },
  { id: "phone", label: "Someone needs you", emoji: "📞", group: "Household", text: "{user}, someone needs you — pause when you can." },
  { id: "leaving", label: "Leaving soon", emoji: "🚗", group: "Household", text: "We are heading out at {time}. Please pause {title} and wrap up.", needsTime: true, defaultMinutes: 30 },
  { id: "checkin", label: "Check in", emoji: "👋", group: "Household", text: "Hi {user} on {device} — can you check in when you get a moment?" },
  { id: "quality", label: "Lower quality", emoji: "📉", group: "Server", text: "This stream is loading the server. Please drop quality or switch to direct play if you can." },
  { id: "busy", label: "Server is busy", emoji: "🔥", group: "Server", text: "The server is busy right now. Please pause or lower quality on {device}." },
  { id: "direct", label: "Direct play please", emoji: "📡", group: "Server", text: "Please switch to Direct Play if your client allows it — transcoding is heavy right now." },
  { id: "wifi", label: "Wi-Fi issue", emoji: "📶", group: "Server", text: "Wi-Fi looks unhappy. Pause {title}, move closer to the access point, then resume." },
  { id: "maintenance", label: "Maintenance soon", emoji: "🛠️", group: "Maintenance", text: "Server maintenance starts at {time}. Please pause {title} and save your place.", needsTime: true, defaultMinutes: 20 },
  { id: "restart", label: "Restarting Jellyfin", emoji: "🔁", group: "Maintenance", text: "Jellyfin is restarting at {time}. Playback on {device} will drop — pause before then.", needsTime: true, defaultMinutes: 10 },
  { id: "scheduled", label: "Scheduled restart", emoji: "🗓️", group: "Maintenance", text: "Scheduled server restart at {time}. Please pause {title} on {device} before it drops.", needsTime: true, defaultMinutes: 15 },
  { id: "scheduled-15", label: "Restart in 15 min", emoji: "⏰", group: "Maintenance", text: "Scheduled restart at {time} (about 15 minutes). Wrap up {title} soon.", needsTime: true, defaultMinutes: 15 },
  { id: "scheduled-tonight", label: "Restart tonight", emoji: "🌙", group: "Maintenance", text: "The server restarts tonight at {time}. Finish {title} before then if you can.", needsTime: true, defaultTonight: true },
  { id: "update", label: "Update in progress", emoji: "⬆️", group: "Maintenance", text: "The server is updating. {title} may stop. You can resume after maintenance." },
  { id: "downtime", label: "Short downtime", emoji: "⛔", group: "Maintenance", text: "Short downtime at {time}. Wrap up {title} when you hit a good stopping point.", needsTime: true, defaultMinutes: 15 },
  { id: "library-scan", label: "Library scan", emoji: "📚", group: "Maintenance", text: "A library scan is running, so streams may hitch. Pause if it gets choppy." },
  { id: "disk", label: "Storage work", emoji: "💾", group: "Maintenance", text: "Disk / storage work is in progress. Please pause playback until it finishes." },
  { id: "back-up", label: "We're back", emoji: "✅", group: "Maintenance", text: "Maintenance is done. You can start {title} again on {device}." },
];

const SESSION_MESSAGE_TEMPLATE_GROUPS = [...new Set(SESSION_MESSAGE_TEMPLATES.map((template) => template.group))];

function SessionCard(props) {
  const session = props.data.session;
  const hideIpAddress = Boolean(props.hideIpAddress);
  const canManage = Boolean(props.canManage) && !props.kiosk;
  const nowPlaying = session.NowPlayingItem;
  const playState = session.PlayState;
  const mediaItemId = props.data.session.NowPlayingItem.SeriesId
    ? props.data.session.NowPlayingItem.SeriesId
    : props.data.session.NowPlayingItem.Id;
  const [sessionModalVisible, setSessionModalVisible] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [controlCapabilities, setControlCapabilities] = useState(null);
  const [controlPending, setControlPending] = useState("");
  const [controlNotice, setControlNotice] = useState(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [messageTemplateId, setMessageTemplateId] = useState("custom");
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [messageWhen, setMessageWhen] = useState(() => defaultMessageDateTime(15));
  const canControl = Boolean(props.canControl) && !props.kiosk;
  const twelveHour = readTwelveHour();
  const [positionAnchor, setPositionAnchor] = useState(() => ({
    sessionId: session.Id,
    positionTicks: Number(playState.PositionTicks || 0),
    receivedAt: Date.now(),
    paused: Boolean(playState.IsPaused),
  }));
  const isSilo = session.MediaServerProvider === "silo";
  const diagnostics = session.SiloDiagnostics || {};
  // Silo's client label already carries the version ("Findroid 1.2.0").
  const clientLabel = String(session.Client || 'Unknown').includes(session.ApplicationVersion || '\0')
    ? String(session.Client) : `${session.Client || 'Unknown'} ${session.ApplicationVersion || ''}`.trim();
  // Additional-server IDs must never navigate into primary-server catalog/users.
  const LocalLink = ({ to, target, ...rest }) => (session.FleetServerId && session.FleetServerId !== 'primary')
    || (to.startsWith('/libraries/') && nowPlaying.SiloUnattributed)
    ? <span {...rest} /> : <Link to={to} target={target} {...rest} />;
  const posterUrl = isSilo ? publicSiloPoster(nowPlaying.SiloPosterUrl)
    : `${baseUrl}/proxy/Items/Images/Primary?id=${encodeURIComponent(mediaItemId)}&fillHeight=420&fillWidth=280&quality=68`;
  const backdropUrl = isSilo ? posterUrl
    : `${baseUrl}/proxy/Items/Images/Backdrop?id=${encodeURIComponent(mediaItemId)}&fillWidth=1200&quality=58`;

  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const now = Date.now();
    setPositionAnchor({
      sessionId: session.Id,
      positionTicks: Number(playState.PositionTicks || 0),
      receivedAt: now,
      paused: Boolean(playState.IsPaused),
    });
    setClockNow(now);
  }, [session.Id, playState.PositionTicks, playState.IsPaused]);

  useEffect(() => {
    if (positionAnchor.paused) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [positionAnchor.paused, positionAnchor.sessionId]);

  useEffect(() => {
    if (!messageOpen) setTemplateMenuOpen(false);
  }, [messageOpen]);

  const cardStyle = {
    backgroundColor: "var(--barracks-surface-raised)",
  };

  const cardBgStyle = {
    backgroundColor: "var(--barracks-surface-raised)",
  };
  const rawPositionTicks = positionAnchor.paused
    ? positionAnchor.positionTicks
    : positionAnchor.positionTicks + Math.max(0, clockNow - positionAnchor.receivedAt) * 10000;
  const currentPositionTicks = nowPlaying.RunTimeTicks
    ? Math.min(Number(nowPlaying.RunTimeTicks), Math.max(0, rawPositionTicks))
    : Math.max(0, rawPositionTicks);
  const currentPlayState = { ...playState, PositionTicks: currentPositionTicks };
  const progressPercent = nowPlaying.RunTimeTicks
    ? Math.min(
        100,
        Math.max(0, (currentPositionTicks / nowPlaying.RunTimeTicks) * 100)
      )
    : 0;
  const progress = getSessionProgress(nowPlaying, playState);
  const eta =
    nowPlaying.RunTimeTicks || nowPlaying.ChannelType === "TV"
      ? getETA(nowPlaying, currentPlayState)
      : formatClock(progress.endsAt);

  const rawTranscodePercent = Number(session.TranscodingInfo?.CompletionPercentage);
  const transcodePositionPercent = nowPlaying.RunTimeTicks
    ? Number(session.TranscodingInfo?.TranscodingPositionTicks) / nowPlaying.RunTimeTicks * 100
    : 0;
  const transcodePercent = Number.isFinite(rawTranscodePercent)
    ? Math.min(100, Math.max(0, rawTranscodePercent))
    : Number.isFinite(transcodePositionPercent)
      ? Math.min(100, Math.max(0, transcodePositionPercent))
      : null;
  const isLiveTv = nowPlaying.ChannelType === "TV";
  const timeLeft = isLiveTv
    ? eta && `Ends ${eta}`
    : progress.remainingTicks === null
      ? ""
      : progress.isPaused
        ? formatTicks(progress.remainingTicks)
        : `${formatTicks(progress.remainingTicks)} · ends ${eta}`;

  const playbackMethod = playState.PlayMethod || "Unknown";
  const isTranscoding = Boolean(session.TranscodingInfo);
  const transcodeReason = formatTranscodeReasons(session);
  const title =
    nowPlaying.Type === "Episode" && nowPlaying.SeriesName
      ? nowPlaying.SeriesName
      : nowPlaying.Name;
  const subtitle =
    nowPlaying.Type === "Episode"
      ? `${nowPlaying.Name} · S${nowPlaying.ParentIndexNumber} E${nowPlaying.IndexNumber}`
      : nowPlaying.Type === "Audio" && nowPlaying.Artists?.length > 0
        ? nowPlaying.Artists[0]
        : nowPlaying.SeriesName || nowPlaying.Type;
  const timecode = `${ticksToTimeString(currentPositionTicks)}${nowPlaying.RunTimeTicks ? `/${ticksToTimeString(nowPlaying.RunTimeTicks)}` : ""}`;

  function timeForTemplate(template) {
    if (template?.defaultTonight) return tonightMessageDateTime();
    return defaultMessageDateTime(Number(template?.defaultMinutes || 15));
  }


  const ipv4Regex = new RegExp(
    /\b(?!(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168))(?:(?:2(?:[0-4][0-9]|5[0-5])|[0-1]?[0-9]?[0-9])\.){3}(?:(?:2([0-4][0-9]|5[0-5])|[0-1]?[0-9]?[0-9]))\b/
  );

  const [ipModalVisible, setIPModalVisible] = React.useState(false);
  const [ipAddressLookup, setIPAddressLookup] = React.useState();

  const isRemoteSession = (ipAddress) => {
    ipv4Regex.lastIndex = 0;
    if (ipv4Regex.test(ipAddress ?? ipAddressLookup)) {
      return true;
    }
    return false;
  };

  function showIPDataModal(ipAddress) {
    ipv4Regex.lastIndex = 0;
    setIPAddressLookup(ipAddress);
    if (!isRemoteSession) {
      return;
    }

    setIPModalVisible(true);
  }

  function handleCardClick(event) {
    if (event.target.closest("a, button, [data-session-card-ignore]")) {
      return;
    }

    setSessionModalVisible(true);
  }

  function handleCardKeyDown(event) {
    if (event.target.closest("a, button, input, textarea, select, [contenteditable='true'], [data-session-card-ignore]")) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSessionModalVisible(true);
    }
  }

  useEffect(() => {
    if (!sessionModalVisible || !(canControl || canManage)) return undefined;
    let active = true;
    setControlNotice(null);
    const endpoint = session.FleetServerId
      ? `/fleet/sessions/${encodeURIComponent(session.FleetServerId)}/capabilities`
      : "/api/session-controls/capabilities";
    axios.get(endpoint).then(response => {
      if (active) setControlCapabilities(response.data);
    }).catch(error => {
      if (active) setControlNotice({ type: "error", text: error.response?.data?.error || "Playback controls are unavailable." });
    });
    return () => { active = false; };
  }, [sessionModalVisible, canControl, session.FleetServerId]);

  const selectedMessageTemplate = SESSION_MESSAGE_TEMPLATES.find((item) => item.id === messageTemplateId) || SESSION_MESSAGE_TEMPLATES[0];
  function fillMessageTemplate(template, when = messageWhen) {
    return applySessionMessageTemplate(template?.text, session, title, when, twelveHour);
  }
  function closeMessage() {
    setMessageOpen(false);
    setTemplateMenuOpen(false);
  }

  async function runControl(action, text) {
    if (controlPending) return;
    if (["stop", "terminate"].includes(action) && !window.confirm(
      action === "terminate" ? "Terminate this playback session and revoke its authority?" : "Stop this playback session?"
    )) return;
    const message = String(text ?? "").trim();
    const payload = action === "message" ? { message, title: "Barracks administrator" } : {};
    if (action === "message" && !message) {
      setControlNotice({ type: "error", text: "Enter a message first." });
      return;
    }
    const endpoint = session.FleetServerId
      ? `/fleet/sessions/${encodeURIComponent(session.FleetServerId)}/${encodeURIComponent(session.Id)}/${action}`
      : `/api/session-controls/${encodeURIComponent(session.Id)}/${action}`;
    setControlPending(action);
    setControlNotice(null);
    try {
      await axios.post(endpoint, payload);
      setControlNotice({ type: "success", text: `${action === "message" ? "Message" : action[0].toUpperCase() + action.slice(1)} command accepted.` });
      if (action === "message") {
        closeMessage();
        setMessageText("");
        setMessageTemplateId("custom");
        setMessageWhen(defaultMessageDateTime(15));
      }
    } catch (error) {
      setControlNotice({ type: "error", text: error.response?.data?.error || error.response?.data?.message || "Playback command failed." });
    } finally {
      setControlPending("");
    }
  }

  const controlActions = new Set(controlCapabilities?.actions || []);

  return (
    <div
      className="session-card"
      style={cardStyle}
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      aria-label={`Open session details for ${title}`}
    >
      <div className="card-device-image-overlay">
        {session.SiloJellyfinCompat ? (
          <HintTooltip title="Connected through Silo's Jellyfin compatibility layer">
            <span role="img" aria-label="Jellyfin compatibility connection"><PlatformIcon className="card-device-image" client="jellyfin" /></span>
          </HintTooltip>
        ) : isSilo ? <img className="card-device-image" src={siloIcon} alt="Silo" /> : <PlatformIcon
          className="card-device-image"
          client={props.data.session.Client}
          deviceName={props.data.session.DeviceName}
        />}
      </div>
      <IpInfoModal show={ipModalVisible} onHide={() => setIPModalVisible(false)} ipAddress={ipAddressLookup} />
      <Dialog
        open={sessionModalVisible}
        onOpenChange={(open) => {
          if (!open) {
            setSessionModalVisible(false);
          }
        }}
      >
        <DialogContent
          className="session-popout-modal tw:max-w-[min(940px,calc(100vw-28px))] tw:sm:max-w-[min(940px,calc(100vw-28px))]"
          showCloseButton={false}
        >
          <DialogTitle className="tw:sr-only">Session details</DialogTitle>
          <DialogDescription className="tw:sr-only">Playback session details and controls</DialogDescription>
          <div className="session-popout-body">
          <button
            type="button"
            className="session-popout-close"
            onClick={() => setSessionModalVisible(false)}
            aria-label="Close session details"
          >
            ×
          </button>
          <div
            className="session-popout-hero"
            style={{
              backgroundImage: `linear-gradient(90deg, var(--barracks-scrim), transparent), url(${JSON.stringify(backdropUrl)})`,
            }}
          >
            <img
              className="session-popout-poster"
              src={posterUrl}
              loading="lazy"
              decoding="async"
              alt=""
            />
            <div className="session-popout-copy">
              <div className="session-popout-status">
                <span className={playState.IsPaused ? "is-paused" : "is-playing"}>
                  {playState.IsPaused ? "Paused" : "Playing"}
                </span>
                <span>{playbackMethod}</span>
                {isTranscoding ? <span className="is-transcoding">Transcoding</span> : <span>Direct</span>}
              </div>
              {transcodeReason ? <p className="session-popout-reason">{transcodeReason}</p> : null}
              {canManage && isTranscoding ? <TranscodeExplainer session={session} defaultOpen /> : null}
              <h2>{title}</h2>
              <p>{subtitle}</p>
              {transcodeReason ? <p className="session-popout-reason">{transcodeReason}</p> : null}
              <div className="session-popout-progress" aria-label={`Playback progress ${Math.round(progressPercent)} percent`}>
                <div className="session-playback-progress" style={{ width: `${progressPercent}%` }} />
                {isTranscoding && transcodePercent !== null ? (
                  <div
                    className="session-transcode-progress"
                    style={{ width: `${transcodePercent}%` }}
                    aria-label={`Transcode progress ${Math.round(transcodePercent)} percent`}
                  />
                ) : null}
              </div>
              <div className="session-popout-time">
                <strong>{timecode}</strong>
                <span>{eta ? `Ends ${eta}` : progress.isPaused && progress.remainingTicks !== null ? `${formatTicks(progress.remainingTicks)} left · paused` : "Live or unknown runtime"}</span>
              </div>
            </div>
          </div>
          <div className="session-popout-grid">
            <SessionDetailItem label="Server" value={session.FleetServerName || session.ServerId} />
            <div className="session-popout-detail">
              <span>Viewer</span>
              <div className="session-popout-viewer">
                {!isSilo && session.UserPrimaryImageTag !== undefined ? (
                  <img
                    src={`${baseUrl}/proxy/Users/Images/Primary?id=${session.UserId}&fillWidth=72&quality=55`}
                    loading="lazy"
                    decoding="async"
                    alt=""
                  />
                ) : (
                  <RiAccountCircleFill aria-hidden="true" />
                )}
                <strong>{session.UserName}{session.ProfileName ? ` · ${session.ProfileName}` : ""}</strong>
              </div>
            </div>
            <SessionDetailItem label="Device" value={session.DeviceName} />
            <div className="session-popout-detail">
              <span>Client</span>
              <div className="session-popout-client">
                <PlatformIcon
                  client={session.Client}
                  deviceName={session.DeviceName}
                  className={`session-popout-client-icon${String(session.Client || "").toLowerCase().includes("roku") ? " is-roku" : ""}`}
                />
                <strong>{clientLabel}</strong>
              </div>
            </div>
            {session.SiloJellyfinCompat ? <SessionDetailItem label="Connection" value="Jellyfin compatibility" /> : null}
            {transcodeReason ? <SessionDetailItem label="Transcode reason" value={transcodeReason} wide /> : null}
            {!hideIpAddress ? <SessionDetailItem label="IP address" value={session.RemoteEndPoint} /> : null}
            <SessionDetailItem label="Container" value={nowPlaying.ContainerStream} />
            <SessionDetailItem label="Video" value={nowPlaying.VideoStream} wide />
            <SessionDetailItem label="Video bitrate" value={nowPlaying.VideoBitrateStream} />
            <SessionDetailItem label="Audio" value={nowPlaying.AudioStream} wide />
            <SessionDetailItem label="Audio bitrate" value={nowPlaying.AudioBitrateStream} />
            <SessionDetailItem label="Subtitles" value={nowPlaying.SubtitleStream} />
            <SessionDetailItem label="Client build" value={diagnostics.clientBuild} />
            <SessionDetailItem label="Client channel" value={diagnostics.clientChannel} />
            <SessionDetailItem label="Hardware acceleration" value={diagnostics.hardwareAcceleration} />
            <SessionDetailItem label="Tone mapping" value={diagnostics.toneMapMode} />
            <SessionDetailItem label="Execution node" value={diagnostics.executionNode} />
            <SessionDetailItem label="Egress node" value={diagnostics.egressNode} />
            <SessionDetailItem label="Source audio" value={[diagnostics.sourceAudioCodec, diagnostics.sourceAudioChannels != null ? `${diagnostics.sourceAudioChannels} channels` : ''].filter(Boolean).join(' · ')} />
            <SessionDetailItem label="Target audio" value={[diagnostics.targetAudioCodec, diagnostics.targetAudioChannels != null ? `${diagnostics.targetAudioChannels} channels` : ''].filter(Boolean).join(' · ')} />
            <SessionDetailItem label="Reported stream bitrate" value={diagnostics.reportedBitrate != null ? `${(diagnostics.reportedBitrate / 1000000).toFixed(2)} Mbps` : ''} />
          </div>
          {(canControl || canManage) && <section className="session-controls" data-session-card-ignore>
            <div className="session-controls-heading">
              <div><strong>Administrator controls</strong><span>Commands affect only this session on {session.FleetServerName || "the primary server"}.</span></div>
              {controlCapabilities && <small>{controlCapabilities.available && controlCapabilities.allowed ? "Available" : controlCapabilities.state || "Unavailable"}</small>}
            </div>
            {controlNotice && <p role={controlNotice.type === "error" ? "alert" : "status"} className={`session-control-notice is-${controlNotice.type}`}>{controlNotice.text}</p>}
            {!controlCapabilities && !controlNotice && <p role="status" className="session-control-notice">Checking upstream permissions…</p>}
            {controlCapabilities?.available && controlCapabilities?.allowed && <>
              <div className="session-popout-actions">
                {playState.IsPaused
                  ? controlActions.has("resume") && <button type="button" className="session-command" disabled={Boolean(controlPending)} onClick={() => runControl("resume")}><RiPlayFill size={17} />Resume</button>
                  : controlActions.has("pause") && <button type="button" className="session-command" disabled={Boolean(controlPending)} onClick={() => runControl("pause")}><RiPauseFill size={17} />Pause</button>}
                {controlActions.has("message") && <button
                  type="button"
                  className="session-command is-message"
                  disabled={Boolean(controlPending)}
                  onClick={() => {
                    setControlNotice(null);
                    setMessageTemplateId("custom");
                    setMessageWhen(defaultMessageDateTime(15));
                    setMessageOpen(true);
                  }}
                >
                  <RiChatSmile2Line size={17} />
                  Message
                </button>}
                {controlActions.has("stop") && <button type="button" className="session-command is-stop" disabled={Boolean(controlPending)} onClick={() => runControl("stop")}><RiStopCircleLine size={17} />Stop playback</button>}
                {controlActions.has("terminate") && <button type="button" className="session-command is-stop" disabled={Boolean(controlPending)} onClick={() => runControl("terminate")}><RiStopCircleLine size={17} />Terminate</button>}
              </div>
            </>}
          </section>}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={messageOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeMessage();
          }
        }}
      >
        <DialogContent className="session-message-modal tw:overflow-visible tw:max-w-[540px] tw:sm:max-w-[540px]" showCloseButton={false}>
          <DialogTitle className="tw:sr-only">Message {session.UserName}</DialogTitle>
          <DialogDescription className="tw:sr-only">Send an on-screen message to this player</DialogDescription>
          <div className="session-message-body">
          <h2 className="session-message-title">Message {session.UserName}</h2>
          <p className="session-message-hint">Choose a template from the menu, then edit before sending. It shows as an on-screen notice on their Silo client.</p>
          <div className={`session-message-picker${templateMenuOpen ? " is-open" : ""}`}>
            <span className="session-message-select-label">Message template</span>
            <button
              type="button"
              className="session-message-trigger"
              aria-haspopup="listbox"
              aria-expanded={templateMenuOpen}
              onClick={() => setTemplateMenuOpen((open) => !open)}
            >
              <span className="session-message-trigger-emoji">{selectedMessageTemplate.emoji}</span>
              <span className="session-message-trigger-copy">
                <strong>{selectedMessageTemplate.label}</strong>
                <small>{selectedMessageTemplate.group}</small>
              </span>
              <RiArrowDownSLine size={20} />
            </button>
            {templateMenuOpen ? (
              <div className="session-message-menu" role="listbox">
                {SESSION_MESSAGE_TEMPLATE_GROUPS.map((group) => (
                  <div key={group} className="session-message-menu-group">
                    <span>{group}</span>
                    {SESSION_MESSAGE_TEMPLATES.filter((template) => template.group === group).map((template) => (
                      <button
                        type="button"
                        key={template.id}
                        role="option"
                        aria-selected={messageTemplateId === template.id}
                        className={messageTemplateId === template.id ? "is-selected" : ""}
                        onClick={() => {
                          const when = timeForTemplate(template);
                          setMessageTemplateId(template.id);
                          setMessageWhen(when);
                          setTemplateMenuOpen(false);
                          if (template.id !== "custom") setMessageText(fillMessageTemplate(template, when));
                        }}
                      >
                        <span className="session-message-trigger-emoji">{template.emoji}</span>
                        <span className="session-message-trigger-copy">
                          <strong>{template.label}</strong>
                          <small>{template.id === "custom" ? "Write your own message" : fillMessageTemplate(template, timeForTemplate(template))}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {selectedMessageTemplate.needsTime ? (
            <label className="session-message-time-label">
              <span>When</span>
              <input
                type="datetime-local"
                className="session-message-time"
                value={messageWhen}
                onChange={(event) => {
                  const when = event.target.value;
                  setMessageWhen(when);
                  if (selectedMessageTemplate.needsTime && messageTemplateId !== "custom") {
                    setMessageText(fillMessageTemplate(selectedMessageTemplate, when));
                  }
                }}
              />
            </label>
          ) : null}
              <small>Fills into the message as {formatMessageTime(messageWhen)}</small>
          <textarea
            rows={3}
            maxLength={2048}
            value={messageText}
            aria-label="Message this player"
            onChange={(event) => {
              setMessageTemplateId("custom");
              setMessageText(event.target.value);
            }}
            placeholder="Keep it short — this pops up over playback."
          />
          {controlNotice?.type === "error" && messageOpen ? <p role="alert" className="session-action-error">{controlNotice.text}</p> : null}
          </div>
          <div className="session-message-footer">
          <button type="button" className="session-command is-ghost" onClick={closeMessage}>
            Cancel
          </button>
          <button
            type="button"
            className="session-command is-message"
            disabled={Boolean(controlPending) || !messageText.trim()}
            onClick={() => runControl("message", messageText)}
          >
            <RiChatSmile2Line size={17} />
            {controlPending === "message" ? "Sending…" : "Send message"}
          </button>
          </div>
        </DialogContent>
      </Dialog>
      <div style={cardBgStyle} className="session-card-main rounded-top">
        <div className="h-100 p-0 m-0">
          <div className="session-card-banner-image">
            <img
              className={
                props.data.session.NowPlayingItem.Type === "Audio"
                  ? "stat-card-image-audio rounded-0 rounded-start"
                  : "session-card-item-image"
              }
              src={posterUrl}
              onError={isSilo ? (event) => {
                if (event.currentTarget.getAttribute('src') !== siloIcon) event.currentTarget.src = siloIcon;
              } : undefined}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="w-100 h-100 m-0 px-0">
            <div className="session-card-body w-100 h-100">
              <div className="h-100 d-flex flex-column justify-content-between g-0 session-card-layout">
                <div className="session-card-head">
                  <div className="session-title-copy">
                    <span className="session-title">
                      <span className="session-play-state" role="img" aria-label={playState.IsPaused ? "Paused" : "Playing"}>{playState.IsPaused ? <RiPlayFill size={16} /> : <RiPauseFill size={16} />}</span>
                      <LocalLink to={`/libraries/item/${nowPlaying.Id}`} target="_blank" className="item-name">
                        {title}
                      </LocalLink>
                    </span>
                    <HintTooltip title={`${session.DeviceName} · ${clientLabel}`}>
                      <span className="session-subtitle">
                        {[subtitle, clientLabel].filter(Boolean).join(" · ")}
                      </span>
                    </HintTooltip>
                  </div>
                  <HintTooltip title={session.UserName}>
                    <LocalLink to={`/users/${session.UserId}`} className="session-user-chip">
                      {(!isSilo && session.UserPrimaryImageTag !== undefined) ? (
                        <img
                          className="session-card-user-image"
                          src={baseUrl + "/proxy/Users/Images/Primary?id=" + session.UserId + "&fillWidth=72&quality=55"}
                          loading="lazy"
                          decoding="async"
                          alt=""
                        />
                      ) : (
                        <RiAccountCircleFill className="session-card-user-image" />
                      )}
                      <span className="session-user-name">{session.UserName}{session.ProfileName ? ` · ${session.ProfileName}` : ""}</span>
                    </LocalLink>
                  </HintTooltip>
                </div>

                <div className="session-pills">
                  {getSessionPills(session).map((pill) => (
                    <span key={pill.key} className={`session-pill${pill.tone ? ` is-${pill.tone}` : ""}`}>
                      {pill.label}
                    </span>
                  ))}
                </div>

                <div className="session-fields">
                  <SessionField label="Device" value={session.DeviceName} />
                  <SessionField label="Left" value={timeLeft || <Trans i18nKey="ERROR_MESSAGES.N/A" />} />
                  {nowPlaying.AudioStream ? (
                    <SessionField
                      label="Audio"
                      value={[formatStreamDetail(nowPlaying.AudioStream), lastStreamPart(nowPlaying.AudioBitrateStream)].filter(Boolean).join(" · ")}
                      title={`${nowPlaying.AudioStream} ${nowPlaying.AudioBitrateStream || ""}`.trim()}
                    />
                  ) : null}
                  {nowPlaying.SubtitleStream ? <SessionField label="Subtitles" value={nowPlaying.SubtitleStream} /> : null}
                  {!hideIpAddress ? (
                    <SessionField
                      label="IP"
                      value={
                        isRemoteSession(session.RemoteEndPoint) &&
                        (window.env?.JS_GEOLITE_ACCOUNT_ID ?? import.meta.env.JS_GEOLITE_ACCOUNT_ID) ? (
                          <Link className="text-decoration-none text-white" onClick={() => showIPDataModal(session.RemoteEndPoint)}>
                            {session.RemoteEndPoint}
                          </Link>
                        ) : (
                          session.RemoteEndPoint
                        )
                      }
                    />
                  ) : null}
                </div>
                {canManage && isTranscoding ? <TranscodeExplainer session={session} compact /> : null}
                <SessionGlanceStrip stitch={props.stitch} />

                <div className="session-timecode">
                  <span className="session-timecode-value">{formatTicks(progress.positionTicks)}</span>
                  <div
                    className="progress-bar session-progress-inline"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progressPercent)}
                  >
                    {progressPercent > 0 ? <div className="progress-custom" style={{ width: `${progressPercent}%` }} /> : null}
                    {isTranscoding && transcodePercent !== null ? (
                      <div
                        className="progress-transcode"
                        style={{ width: `${transcodePercent}%` }}
                        aria-label={`Transcode progress ${Math.round(transcodePercent)} percent`}
                      />
                    ) : null}
                  </div>
                  <span className="session-timecode-value">{progress.runtimeTicks ? formatTicks(progress.runtimeTicks) : ""}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SessionCard;
