/* eslint-disable react/prop-types */
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Card from "react-bootstrap/Card";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Container from "react-bootstrap/Container";
import Modal from "react-bootstrap/Modal";
import FormControl from "react-bootstrap/FormControl";
import axios from "../../../lib/axios_instance";

import AccountCircleFillIcon from "remixicon-react/AccountCircleFillIcon";
import PlayFillIcon from "remixicon-react/PlayFillIcon";
import PauseFillIcon from "remixicon-react/PauseFillIcon";
import ChatSmile2LineIcon from "remixicon-react/ChatSmile2LineIcon";
import ArrowDownSLineIcon from "remixicon-react/ArrowDownSLineIcon";
import StopCircleLineIcon from "remixicon-react/StopCircleLineIcon";

import { PlatformIcon } from "../../../lib/platform-icons";
import Tooltip from "@mui/material/Tooltip";
import IpInfoModal from "../ip-info";
import { Trans } from "react-i18next";
import baseUrl from "../../../lib/baseurl";
import siloIcon from "../../../../public/brand/barracks-mark.svg";
import {
  SESSION_MESSAGE_TEMPLATES,
  SESSION_MESSAGE_TEMPLATE_GROUPS,
  applySessionMessageTemplate,
  defaultMessageDateTime,
  formatMessageTime,
  timeForTemplate,
} from "../../../lib/session-messages";

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
}

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

function SessionCard(props) {
  const session = props.data.session;
  const hideIpAddress = Boolean(props.hideIpAddress);
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
  const clientLabel = `${session.Client || 'Unknown'} ${session.ApplicationVersion || ''}`.trim();
  // Additional-server IDs must never navigate into primary-server catalog/users.
  const LocalLink = ({ to, target, ...rest }) => (session.FleetServerId && session.FleetServerId !== 'primary')
    || (to.startsWith('/libraries/') && nowPlaying.SiloUnattributed)
    ? <span {...rest} /> : <Link to={to} target={target} {...rest} />;
  const posterUrl = isSilo ? publicSiloPoster(nowPlaying.SiloPosterUrl)
    : `${baseUrl}/proxy/Items/Images/Primary?id=${encodeURIComponent(mediaItemId)}&fillHeight=420&fillWidth=280&quality=68`;
  const backdropUrl = isSilo ? posterUrl
    : `${baseUrl}/proxy/Items/Images/Backdrop?id=${encodeURIComponent(mediaItemId)}&fillWidth=1200&quality=58`;

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
  const eta =
    nowPlaying.RunTimeTicks || nowPlaying.ChannelType === "TV"
      ? getETA(nowPlaying, currentPlayState)
      : "";
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
    if (!sessionModalVisible || !canControl) return undefined;
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
    <Card
      className="session-card"
      style={cardStyle}
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      aria-label={`Open session details for ${title}`}
    >
      <div className="card-device-image-overlay">
        {isSilo ? <img className="card-device-image" src={siloIcon} alt="Silo" /> : <PlatformIcon
          className="card-device-image"
          client={props.data.session.Client}
          deviceName={props.data.session.DeviceName}
        />}
      </div>
      <IpInfoModal show={ipModalVisible} onHide={() => setIPModalVisible(false)} ipAddress={ipAddressLookup} />
      <Modal
        show={sessionModalVisible}
        onHide={() => setSessionModalVisible(false)}
        centered
        size="lg"
        dialogClassName="session-popout-modal"
      >
        <Modal.Body>
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
              <h2>{title}</h2>
              <p>{subtitle}</p>
              {transcodeReason ? <p className="session-popout-reason">{transcodeReason}</p> : null}
              <div className="session-popout-progress" aria-label={`Playback progress ${Math.round(progressPercent)} percent`}>
                <div style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="session-popout-time">
                <strong>{timecode}</strong>
                <span>{eta ? `Ends ${eta}` : "Live or unknown runtime"}</span>
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
                  <AccountCircleFillIcon aria-hidden="true" />
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
          {canControl && <section className="session-controls" data-session-card-ignore>
            <div className="session-controls-heading">
              <div><strong>Administrator controls</strong><span>Commands affect only this session on {session.FleetServerName || "the primary server"}.</span></div>
              {controlCapabilities && <small>{controlCapabilities.available && controlCapabilities.allowed ? "Available" : controlCapabilities.state || "Unavailable"}</small>}
            </div>
            {controlNotice && <p role={controlNotice.type === "error" ? "alert" : "status"} className={`session-control-notice is-${controlNotice.type}`}>{controlNotice.text}</p>}
            {!controlCapabilities && !controlNotice && <p role="status" className="session-control-notice">Checking upstream permissions…</p>}
            {controlCapabilities?.available && controlCapabilities?.allowed && <>
              <div className="session-popout-actions">
                {playState.IsPaused
                  ? controlActions.has("resume") && <button type="button" className="session-command" disabled={Boolean(controlPending)} onClick={() => runControl("resume")}><PlayFillIcon size={17} />Resume</button>
                  : controlActions.has("pause") && <button type="button" className="session-command" disabled={Boolean(controlPending)} onClick={() => runControl("pause")}><PauseFillIcon size={17} />Pause</button>}
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
                  <ChatSmile2LineIcon size={17} />
                  Message
                </button>}
                {controlActions.has("stop") && <button type="button" className="session-command is-stop" disabled={Boolean(controlPending)} onClick={() => runControl("stop")}><StopCircleLineIcon size={17} />Stop playback</button>}
                {controlActions.has("terminate") && <button type="button" className="session-command is-stop" disabled={Boolean(controlPending)} onClick={() => runControl("terminate")}><StopCircleLineIcon size={17} />Terminate</button>}
              </div>
            </>}
          </section>}
        </Modal.Body>
      </Modal>
      <Modal show={messageOpen} onHide={closeMessage} centered contentClassName="session-message-modal">
        <Modal.Header closeButton>
          <Modal.Title>Message {session.UserName}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
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
              <ArrowDownSLineIcon size={20} />
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
                  setMessageText(fillMessageTemplate(selectedMessageTemplate, when));
                }}
              />
              <small>Fills into the message as {formatMessageTime(messageWhen, twelveHour)}</small>
            </label>
          ) : null}
          <FormControl
            as="textarea"
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
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="session-command is-ghost" onClick={closeMessage}>
            Cancel
          </button>
          <button
            type="button"
            className="session-command is-message"
            disabled={Boolean(controlPending) || !messageText.trim()}
            onClick={() => runControl("message", messageText)}
          >
            <ChatSmile2LineIcon size={17} />
            {controlPending === "message" ? "Sending…" : "Send message"}
          </button>
        </Modal.Footer>
      </Modal>
      <div style={cardBgStyle} className="session-card-main rounded-top">
        <Row className="h-100 p-0 m-0">
          <Col className="session-card-banner-image">
            <Card.Img
              variant="top"
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
          </Col>
          <Col className="w-100 h-100 m-0 px-0">
            <Card.Body className="session-card-body w-100 h-100">
              <Container className="h-100 d-flex flex-column justify-content-between g-0">
                <Row className="d-flex justify-content-start session-details">
                  <Col className="session-details-list">
                    <SessionCardDetailRow label={<Trans i18nKey="ACTIVITY_TABLE.DEVICE" />} className="session-details-row-short">
                        <Tooltip title={props.data.session.DeviceName}>
                          <span
                            style={{
                              display: "-webkit-box",
                              WebkitBoxOrient: "vertical",
                              WebkitLineClamp: 1,
                            }}
                          >
                            {props.data.session.DeviceName}
                          </span>
                        </Tooltip>
                    </SessionCardDetailRow>
                    <SessionCardDetailRow label={<Trans i18nKey="ACTIVITY_TABLE.CLIENT" />} className="session-details-row-short">
                        <Tooltip title={clientLabel}>
                          <span
                            style={{
                              display: "-webkit-box",
                              WebkitBoxOrient: "vertical",
                              WebkitLineClamp: 1,
                            }}
                          >
                            {clientLabel}
                          </span>
                        </Tooltip>
                    </SessionCardDetailRow>
                    {diagnostics.hardwareAcceleration && <SessionCardDetailRow label="Hardware"><span>{diagnostics.hardwareAcceleration}</span></SessionCardDetailRow>}
                    {diagnostics.executionNode && <SessionCardDetailRow label="Worker"><span>{diagnostics.executionNode}</span></SessionCardDetailRow>}
                    {props.data.session.NowPlayingItem.ContainerStream !== "" && (
                      <SessionCardDetailRow label={<Trans i18nKey="CONTAINER" />} className="mt-2" short>
                          <Tooltip title={props.data.session.NowPlayingItem.ContainerStream}>
                            <span
                              style={{
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 1,
                              }}
                            >
                              {props.data.session.NowPlayingItem.ContainerStream}
                            </span>
                          </Tooltip>
                      </SessionCardDetailRow>
                    )}
                    {props.data.session.NowPlayingItem.VideoStream !== "" && (
                      <SessionCardDetailRow label={<Trans i18nKey="VIDEO" />} short>
                          <Tooltip title={props.data.session.NowPlayingItem.VideoStream}>
                            <span
                              style={{
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 1,
                              }}
                            >
                              {props.data.session.NowPlayingItem.VideoStream}
                            </span>
                          </Tooltip>
                      </SessionCardDetailRow>
                    )}
                    {props.data.session.NowPlayingItem.VideoBitrateStream !== "" && (
                      <SessionCardDetailRow label="" short>
                          <Tooltip title={props.data.session.NowPlayingItem.VideoBitrateStream}>
                            <span
                              style={{
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 1,
                              }}
                            >
                              {props.data.session.NowPlayingItem.VideoBitrateStream}
                            </span>
                          </Tooltip>
                      </SessionCardDetailRow>
                    )}
                    {props.data.session.NowPlayingItem.AudioStream !== "" && (
                      <SessionCardDetailRow label={<Trans i18nKey="AUDIO" />} short>
                          <Tooltip title={props.data.session.NowPlayingItem.AudioStream}>
                            <span
                              style={{
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 1,
                              }}
                            >
                              {props.data.session.NowPlayingItem.AudioStream}
                            </span>
                          </Tooltip>
                      </SessionCardDetailRow>
                    )}
                    {props.data.session.NowPlayingItem.AudioBitrateStream !== "" && (
                      <SessionCardDetailRow label="" short>
                          <Tooltip title={props.data.session.NowPlayingItem.AudioBitrateStream}>
                            <span
                              style={{
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 1,
                              }}
                            >
                              {props.data.session.NowPlayingItem.AudioBitrateStream}
                            </span>
                          </Tooltip>
                      </SessionCardDetailRow>
                    )}
                    {props.data.session.NowPlayingItem.SubtitleStream !== "" && (
                      <SessionCardDetailRow label={<Trans i18nKey="SUBTITLES" />} short>
                          <Tooltip title={props.data.session.NowPlayingItem.SubtitleStream}>
                            <span
                              style={{
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 1,
                              }}
                            >
                              {props.data.session.NowPlayingItem.SubtitleStream}
                            </span>
                          </Tooltip>
                      </SessionCardDetailRow>
                    )}

                    {!hideIpAddress ? (
                    <SessionCardDetailRow label={<Trans i18nKey="ACTIVITY_TABLE.IP_ADDRESS" />} className="mt-2">
                        {isRemoteSession(props.data.session.RemoteEndPoint) &&
                        (window.env?.JS_GEOLITE_ACCOUNT_ID ?? import.meta.env.JS_GEOLITE_ACCOUNT_ID) ? (
                          <Link
                            className="text-decoration-none text-white"
                            onClick={() => showIPDataModal(props.data.session.RemoteEndPoint)}
                          >
                            {props.data.session.RemoteEndPoint}
                          </Link>
                        ) : (
                          <span>{props.data.session.RemoteEndPoint}</span>
                        )}
                    </SessionCardDetailRow>
                    ) : null}

                    <SessionCardDetailRow label="ETA" className="session-details-row-eta">
                      <span>{eta || <Trans i18nKey="ERROR_MESSAGES.N/A" />}</span>
                    </SessionCardDetailRow>
                  </Col>
                </Row>

                <Row className="p-0 m-0">
                  <Col>
                    <Card.Text className="session-timecode text-end">
                      <Tooltip title={eta ? `Ends at ${eta}` : "End time unavailable"}>
                        <span className="session-timecode-value">{timecode}</span>
                      </Tooltip>
                      <span className="session-timecode-eta">{eta ? `Ends ${eta}` : <Trans i18nKey="ERROR_MESSAGES.N/A" />}</span>
                    </Card.Text>
                  </Col>
                </Row>
              </Container>
            </Card.Body>
          </Col>
        </Row>
      </div>
      <Row>
        <Col>
          <div className="progress-bar">
            <div
              className="progress-custom"
              style={{
                width: `${progressPercent}%`,
              }}
            ></div>
          </div>
        </Col>
      </Row>
      <Row className="session-card-meta p-0 m-0">
        <Col className="session-card-now-playing">
          {/* Player convention: a paused stream shows play, a playing stream shows pause. */}
          <span className="session-play-state" role="img" aria-label={props.data.session.PlayState.IsPaused ? "Paused" : "Playing"}>
            {props.data.session.PlayState.IsPaused ? <PlayFillIcon /> : <PauseFillIcon />}
          </span>
          <div className="session-title-copy">
            <Card.Text className="session-title">
              <LocalLink to={`/libraries/item/${props.data.session.NowPlayingItem.Id}`} target="_blank" className="item-name">
                {props.data.session.NowPlayingItem.Type === "Episode" && props.data.session.NowPlayingItem.SeriesName
                  ? props.data.session.NowPlayingItem.SeriesName
                  : props.data.session.NowPlayingItem.Name}
              </LocalLink>
            </Card.Text>
            <Card.Text className="session-subtitle">
              {props.data.session.NowPlayingItem.Type === "Episode"
                ? `${props.data.session.NowPlayingItem.Name} · S${props.data.session.NowPlayingItem.ParentIndexNumber} E${props.data.session.NowPlayingItem.IndexNumber}`
                : props.data.session.NowPlayingItem.Type === "Audio" && props.data.session.NowPlayingItem.Artists?.length > 0
                  ? props.data.session.NowPlayingItem.Artists[0]
                  : props.data.session.NowPlayingItem.SeriesName || props.data.session.NowPlayingItem.Type}
            </Card.Text>
          </div>
        </Col>
        <Col className="session-card-user">
          <Tooltip title={props.data.session.UserName}>
            <LocalLink to={`/users/${props.data.session.UserId}`} className="item-name session-user-name">
              {props.data.session.UserName}
              {session.ProfileName && <small> · {session.ProfileName}</small>}
            </LocalLink>
          </Tooltip>
          {!isSilo && props.data.session.UserPrimaryImageTag !== undefined ? (
            <img
              className="session-card-user-image"
              src={baseUrl + "/proxy/Users/Images/Primary?id=" + props.data.session.UserId + "&fillWidth=72&quality=55"}
              loading="lazy"
              decoding="async"
              alt=""
            />
          ) : (
            <AccountCircleFillIcon className="session-card-user-image" />
          )}
        </Col>
      </Row>
    </Card>
  );
}

export default SessionCard;
