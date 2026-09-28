// Player message templates, ported from JellyGlance session cards.
export function defaultMessageDateTime(minutesAhead = 15) {
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

export function formatMessageTime(value, twelveHour = false) {
  if (!value) return "the scheduled time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: Boolean(twelveHour),
  });
}

export function applySessionMessageTemplate(template, session, title, timeValue, twelveHour = false) {
  return String(template || "")
    .replaceAll("{user}", session.UserName || "there")
    .replaceAll("{device}", session.DeviceName || session.Client || "your device")
    .replaceAll("{title}", title || session.NowPlayingItem?.Name || "this")
    .replaceAll("{time}", formatMessageTime(timeValue, twelveHour));
}

export const SESSION_MESSAGE_TEMPLATES = [
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
  { id: "restart", label: "Restarting server", emoji: "🔁", group: "Maintenance", text: "The server is restarting at {time}. Playback on {device} will drop — pause before then.", needsTime: true, defaultMinutes: 10 },
  { id: "scheduled", label: "Scheduled restart", emoji: "🗓️", group: "Maintenance", text: "Scheduled server restart at {time}. Please pause {title} on {device} before it drops.", needsTime: true, defaultMinutes: 15 },
  { id: "scheduled-15", label: "Restart in 15 min", emoji: "⏰", group: "Maintenance", text: "Scheduled restart at {time} (about 15 minutes). Wrap up {title} soon.", needsTime: true, defaultMinutes: 15 },
  { id: "scheduled-tonight", label: "Restart tonight", emoji: "🌙", group: "Maintenance", text: "The server restarts tonight at {time}. Finish {title} before then if you can.", needsTime: true, defaultTonight: true },
  { id: "update", label: "Update in progress", emoji: "⬆️", group: "Maintenance", text: "The server is updating. {title} may stop. You can resume after maintenance." },
  { id: "downtime", label: "Short downtime", emoji: "⛔", group: "Maintenance", text: "Short downtime at {time}. Wrap up {title} when you hit a good stopping point.", needsTime: true, defaultMinutes: 15 },
  { id: "library-scan", label: "Library scan", emoji: "📚", group: "Maintenance", text: "A library scan is running, so streams may hitch. Pause if it gets choppy." },
  { id: "disk", label: "Storage work", emoji: "💾", group: "Maintenance", text: "Disk / storage work is in progress. Please pause playback until it finishes." },
  { id: "back-up", label: "We're back", emoji: "✅", group: "Maintenance", text: "Maintenance is done. You can start {title} again on {device}." },
];

export const SESSION_MESSAGE_TEMPLATE_GROUPS = [...new Set(SESSION_MESSAGE_TEMPLATES.map((template) => template.group))];

export function timeForTemplate(template) {
  return template?.defaultTonight ? tonightMessageDateTime() : defaultMessageDateTime(Number(template?.defaultMinutes || 15));
}
