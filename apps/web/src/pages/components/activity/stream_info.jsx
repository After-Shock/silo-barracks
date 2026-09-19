import React from "react";
import "../../css/activity/stream-info.css";
import Loading from "../general/loading";
import { Trans } from "react-i18next";
import i18next from "i18next";

const UNKNOWN_VALUE = "-";

function convertBitrate(bitrate) {
  const numericBitrate = Number(bitrate);
  if (!Number.isFinite(numericBitrate) || numericBitrate <= 0) {
    return UNKNOWN_VALUE;
  }

  const kbps = numericBitrate / 1000;
  if (kbps >= 1000) {
    return `${(numericBitrate / 1000000).toFixed(1)} Mbps`;
  }
  return `${kbps.toFixed(1)} Kbps`;
}

function formatValue(value) {
  if (value === undefined || value === null || value === "") {
    return UNKNOWN_VALUE;
  }
  return value;
}

function formatUpper(value) {
  const formattedValue = formatValue(value);
  return formattedValue === UNKNOWN_VALUE ? UNKNOWN_VALUE : String(formattedValue).toUpperCase();
}

function normalizeModeKey(rawMode) {
  const mode = String(rawMode ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  if (mode === "directplay" || mode === "direct") return "direct";
  if (mode === "directstream" || mode === "remux") return "direct-stream";
  if (mode === "transcode" || mode === "transcoding") return "transcode";
  return "unavailable";
}

function modeLabel(key) {
  if (key === "direct") return i18next.t("DIRECT");
  if (key === "direct-stream") return i18next.t("DIRECT_STREAM");
  if (key === "transcode") return i18next.t("TRANSCODE");
  return i18next.t("UNAVAILABLE");
}

function modeDescriptor(rawMode) {
  const key = normalizeModeKey(rawMode);
  return { key, label: modeLabel(key) };
}

function streamMode(data, type) {
  const decisionKey = type === "video" ? "VideoDecision" : "AudioDecision";
  const rawDecision = data[decisionKey] ?? data.TranscodingInfo?.[decisionKey];
  if (rawDecision) return modeDescriptor(rawDecision);

  if (data.TranscodingInfo) {
    const isDirect = type === "video" ? data.TranscodingInfo.IsVideoDirect : data.TranscodingInfo.IsAudioDirect;
    if (isDirect === false) return modeDescriptor("Transcode");
    if (isDirect === true) {
      const playMethod = normalizeModeKey(data.PlayMethod);
      return modeDescriptor(playMethod === "direct-stream" ? "DirectStream" : "DirectPlay");
    }
  }

  return modeDescriptor(data.PlayMethod);
}

function DetailRow({ label, stream, source }) {
  return (
    <div className="stream-info-row">
      <span>{label}</span>
      <strong>{stream}</strong>
      <strong>{source}</strong>
    </div>
  );
}

function DetailSection({ title, mode, rows }) {
  return (
    <section className="stream-info-section">
      <div className="stream-info-section-header">
        <h3>{title}</h3>
        {mode ? <span className={`stream-info-mode is-${mode.key}`}>{mode.label}</span> : null}
      </div>
      <div className="stream-info-row stream-info-columns" aria-hidden="true">
        <span />
        <strong>
          <Trans i18nKey="STREAM_DETAILS" />
        </strong>
        <strong>
          <Trans i18nKey="SOURCE_DETAILS" />
        </strong>
      </div>
      <div className="stream-info-rows">{rows}</div>
    </section>
  );
}

function formatDate(value) {
  if (!value) return UNKNOWN_VALUE;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? UNKNOWN_VALUE : date.toLocaleString();
}

function formatDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", `${remainder}s`].filter(Boolean).join(" ");
}

function HistoryDetails({ data }) {
  return <div className="stream-info-history">
    <div className="stream-info-summary">
      <div><span>Playback</span><strong>{modeDescriptor(data.PlayMethod || data.SiloPlayMethod).label}</strong></div>
      <div><span>Watched</span><strong>{formatDuration(data.PlaybackDuration)}</strong></div>
      <div><span>Status</span><strong>{data.Completed ? "Completed" : "Stopped early"}</strong></div>
    </div>
    <DetailSection title="Finalized attempt" rows={<>
      <DetailRow label="Account" stream={formatValue(data.UserName)} source={formatValue(data.UserId)} />
      <DetailRow label="Profile" stream={formatValue(data.ProfileName)} source={formatValue(data.ProfileId)} />
      <DetailRow label="Media type" stream={formatValue(data.SiloMediaType)} source={formatValue(data.NowPlayingItemId)} />
      <DetailRow label="Started" stream={formatDate(data.DateCreated)} source={formatValue(data.SiloSessionId)} />
      <DetailRow label="Ended" stream={formatDate(data.EndedAt)} source={data.RunTime == null ? UNKNOWN_VALUE : formatDuration(data.RunTime)} />
    </>} />
    <p className="stream-info-history-note">This is Silo’s finalized playback record. Live client, route and codec diagnostics are shown in Live sessions and are not substituted into historical attempts.</p>
  </div>;
}

function StreamDetails({ data }) {
  if (!data) return null;
  if (!data.MediaStreams && data.HistorySource) return <HistoryDetails data={data} />;
  if (!data.MediaStreams) return null;

  const videoStream = data.MediaStreams.find((stream) => stream.Type === "Video");
  const audioStream = data.MediaStreams.find((stream) => stream.Type === "Audio");

  const originalBitrateRaw = Number(videoStream?.BitRate || 0) + Number(audioStream?.BitRate || 0);
  const overallOriginalBitrate = convertBitrate(originalBitrateRaw);

  let transcodeBitrateRaw = originalBitrateRaw;
  if (data.TranscodingInfo) {
    if (
      (data.TranscodingInfo.IsVideoDirect === false && data.TranscodingInfo.VideoBitrate) ||
      (data.TranscodingInfo.IsAudioDirect === false && data.TranscodingInfo.AudioBitrate)
    ) {
      transcodeBitrateRaw += data.TranscodingInfo.IsVideoDirect === false ? Number(data.TranscodingInfo.VideoBitrate || 0) : 0;
      transcodeBitrateRaw += data.TranscodingInfo.IsAudioDirect === false ? Number(data.TranscodingInfo.AudioBitrate || 0) : 0;
      if (data.TranscodingInfo.IsVideoDirect === false && videoStream?.BitRate) {
        transcodeBitrateRaw -= Number(videoStream.BitRate);
      }
      if (data.TranscodingInfo.IsAudioDirect === false && audioStream?.BitRate) {
        transcodeBitrateRaw -= Number(audioStream.BitRate);
      }
    } else {
      transcodeBitrateRaw = data.TranscodingInfo?.Bitrate;
    }
  }

  const videoTranscodeBitrate =
    data.TranscodingInfo && data.TranscodingInfo?.IsVideoDirect === false
      ? convertBitrate(data.TranscodingInfo.VideoBitrate || data.TranscodingInfo.Bitrate)
      : convertBitrate(videoStream?.BitRate);
  const videoMode = streamMode(data, "video");
  const audioMode = streamMode(data, "audio");
  const playbackMode = modeDescriptor(data.PlayMethod);
  const transcodeReasons = data.TranscodingInfo?.TranscodeReasons || [];

  return (
    <>
      <div className="stream-info-summary">
        <div>
          <span>Playback</span>
          <strong>{playbackMode.label}</strong>
        </div>
        <div>
          <span>Stream</span>
          <strong>{convertBitrate(transcodeBitrateRaw)}</strong>
        </div>
        <div>
          <span>Source</span>
          <strong>{overallOriginalBitrate}</strong>
        </div>
      </div>

      <DetailSection
        title={<Trans i18nKey="MEDIA" />}
        rows={
          <>
            <DetailRow label={<Trans i18nKey="BITRATE" />} stream={convertBitrate(transcodeBitrateRaw)} source={overallOriginalBitrate} />
            <DetailRow
              label={<Trans i18nKey="CONTAINER" />}
              stream={formatUpper(data.TranscodingInfo ? data.TranscodingInfo.Container : data.OriginalContainer)}
              source={formatUpper(data.OriginalContainer)}
            />
          </>
        }
      />

      <DetailSection
        title={<Trans i18nKey="VIDEO" />}
        mode={videoMode}
        rows={
          <>
            <DetailRow
              label={<Trans i18nKey="CODEC" />}
              stream={formatUpper(data.TranscodingInfo ? data.TranscodingInfo.VideoCodec : videoStream?.Codec)}
              source={formatUpper(videoStream?.Codec)}
            />
            <DetailRow label={<Trans i18nKey="BITRATE" />} stream={videoTranscodeBitrate} source={convertBitrate(videoStream?.BitRate)} />
            <DetailRow
              label={<Trans i18nKey="WIDTH" />}
              stream={formatValue(data.TranscodingInfo ? data.TranscodingInfo.Width : videoStream?.Width)}
              source={formatValue(videoStream?.Width)}
            />
            <DetailRow
              label={<Trans i18nKey="HEIGHT" />}
              stream={formatValue(data.TranscodingInfo ? data.TranscodingInfo.Height : videoStream?.Height)}
              source={formatValue(videoStream?.Height)}
            />
            <DetailRow
              label={<Trans i18nKey="FRAMERATE" />}
              stream={videoStream?.RealFrameRate ? parseFloat(videoStream.RealFrameRate.toFixed(2)) : UNKNOWN_VALUE}
              source={videoStream?.RealFrameRate ? parseFloat(videoStream.RealFrameRate.toFixed(2)) : UNKNOWN_VALUE}
            />
            <DetailRow label={<Trans i18nKey="DYNAMIC_RANGE" />} stream={formatValue(videoStream?.VideoRange)} source={formatValue(videoStream?.VideoRange)} />
            <DetailRow label={<Trans i18nKey="ASPECT_RATIO" />} stream={formatValue(videoStream?.AspectRatio)} source={formatValue(videoStream?.AspectRatio)} />
          </>
        }
      />

      <DetailSection
        title={<Trans i18nKey="AUDIO" />}
        mode={audioMode}
        rows={
          <>
            <DetailRow
              label={<Trans i18nKey="CODEC" />}
              stream={formatUpper(data.TranscodingInfo ? data.TranscodingInfo.AudioCodec : audioStream?.Codec)}
              source={formatUpper(audioStream?.Codec)}
            />
            <DetailRow
              label={<Trans i18nKey="BITRATE" />}
              stream={convertBitrate(data.TranscodingInfo?.IsAudioDirect === false ? data.TranscodingInfo.AudioBitrate : audioStream?.BitRate)}
              source={convertBitrate(audioStream?.BitRate)}
            />
            <DetailRow
              label={<Trans i18nKey="CHANNELS" />}
              stream={formatValue(data.TranscodingInfo?.IsAudioDirect === false ? data.TranscodingInfo.AudioChannels : audioStream?.Channels)}
              source={formatValue(audioStream?.Channels)}
            />
            <DetailRow label={<Trans i18nKey="LANGUAGE" />} stream={formatUpper(audioStream?.Language)} source={formatUpper(audioStream?.Language)} />
          </>
        }
      />

      {transcodeReasons.length > 0 ? (
        <section className="stream-info-section stream-info-reasons">
          <div className="stream-info-section-header">
            <h3>
              <Trans i18nKey="TRANSCODE_REASONS" />
            </h3>
          </div>
          <div className="stream-info-reason-list">
            {transcodeReasons.map((reason) => (
              <span key={reason}>{reason}</span>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function StreamInfo(props) {
  if (!props?.data) {
    return <Loading />;
  }

  return (
    <div className="StreamInfo">
      <StreamDetails data={props.data} />
    </div>
  );
}

export default StreamInfo;
