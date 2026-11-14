import { RiAddBoxLine, RiAlarmWarningLine, RiAppsLine, RiArchiveLine, RiBarChartGroupedLine, RiCalendarEventLine, RiCalendarLine, RiChatCheckLine, RiCodeSSlashLine, RiComputerLine, RiCpuLine, RiDatabase2Line, RiDeleteBin2Line, RiDownloadCloud2Line, RiErrorWarningLine, RiEyeLine, RiFileCodeLine, RiFilmLine, RiFlagLine, RiFolder2Line, RiGridLine, RiGroupLine, RiHammerLine, RiHardDrive2Line, RiHeartPulseLine, RiHistoryLine, RiImageLine, RiLinksLine, RiListCheck2, RiMailLine, RiNotification3Line, RiPlayCircleLine, RiPlug2Line, RiPulseLine, RiRadarLine, RiServerLine, RiTaskLine, RiTerminalBoxLine, RiTimeLine, RiTimerLine, RiUserAddLine } from "@remixicon/react";

export const WIDGET_GROUP_ICONS = {
  All: RiAppsLine,
  Overview: RiGridLine,
  Playback: RiPlayCircleLine,
  Library: RiDatabase2Line,
  Queue: RiDownloadCloud2Line,
  Calendar: RiCalendarLine,
  Integrations: RiPlug2Line,
  Ops: RiHeartPulseLine,
  Kit: RiFileCodeLine,
};

const WIDGET_FILE_ICONS = {
  overview: RiGridLine,
  catalog: RiFilmLine,
  storage: RiHardDrive2Line,
  sessions: RiPulseLine,
  nowplaying: RiPlayCircleLine,
  viewers: RiEyeLine,
  users: RiGroupLine,
  activity: RiHistoryLine,
  watch: RiTimeLine,
  statistics: RiBarChartGroupedLine,
  libraries: RiFolder2Line,
  repair: RiHammerLine,
  recent: RiAddBoxLine,
  item: RiImageLine,
  downloads: RiDownloadCloud2Line,
  stalled: RiErrorWarningLine,
  queue: RiListCheck2,
  stitched: RiLinksLine,
  calendar: RiCalendarLine,
  today: RiCalendarEventLine,
  requests: RiChatCheckLine,
  issues: RiFlagLine,
  invites: RiUserAddLine,
  autobrr: RiRadarLine,
  transcodes: RiCpuLine,
  maintainerr: RiDeleteBin2Line,
  automation: RiPlug2Line,
  devices: RiComputerLine,
  health: RiHeartPulseLine,
  digest: RiAlarmWarningLine,
  jellyfin: RiServerLine,
  backup: RiArchiveLine,
  webhooks: RiNotification3Line,
  jobs: RiTaskLine,
  "jellyfin-jobs": RiTimerLine,
  newsletter: RiMailLine,
  homepage: RiFileCodeLine,
  curl: RiTerminalBoxLine,
};

const PATH_ALIASES = {
  "ops-digest": "digest",
  "library-storage": "storage",
  "item-glance": "item",
  status: "jellyfin",
};

export function widgetGroupIcon(name) {
  return WIDGET_GROUP_ICONS[name] || RiAppsLine;
}

export function widgetFileIcon(id) {
  return WIDGET_FILE_ICONS[id] || RiCodeSSlashLine;
}

export function widgetPathIcon(path) {
  const parts = String(path || "")
    .split("/")
    .filter((part) => part && !part.startsWith(":"));

  for (const part of [...parts].reverse()) {
    const id = PATH_ALIASES[part] || part;
    if (WIDGET_FILE_ICONS[id]) return WIDGET_FILE_ICONS[id];
  }

  return RiCodeSSlashLine;
}
