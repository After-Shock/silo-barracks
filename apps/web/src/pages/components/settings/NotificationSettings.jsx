import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import DismissibleAlert from "./dismissible-alert";
import { RiComputerLine, RiFilter3Line, RiNotification3Line, RiSave3Line, RiSendPlaneLine, RiShieldCheckLine, RiSmartphoneLine } from "@remixicon/react";
import axios from "../../../lib/axios_instance";
import Config from "../../../lib/config";
import {
  NOTIFICATION_CATEGORIES,
  defaultNotificationSettings,
  normalizeNotificationSettings,
  storeNotificationSettings,
} from "../../../lib/notification-settings";
import { isMobileDevice, isStandaloneApp, requestSystemPermission, showSystemNotification, systemPermission } from "../../../lib/system-notifications";
import "../../css/settings/settings.css";
import ThresholdAlertsPanel from "./ThresholdAlertsPanel";
import WebhookOutPanel from "./WebhookOutPanel";

const modes = [
  { value: "all", title: "All notifications", text: "Show starts, updates, successes, warnings, and errors." },
  { value: "important", title: "Warnings and errors", text: "Hide automatic success and progress messages." },
  { value: "errors", title: "Errors only", text: "Only interrupt for failed or stopped work." },
  { value: "off", title: "Off", text: "Hide background notifications." },
];

const permissionLabels = {
  granted: { label: "Allowed", tone: "ok" },
  denied: { label: "Blocked in browser settings", tone: "bad" },
  default: { label: "Not asked yet", tone: "idle" },
  insecure: { label: "Needs HTTPS", tone: "bad" },
  unsupported: { label: "Not supported by this browser", tone: "bad" },
};

export default function NotificationSettings() {
  const [settings, setSettings] = useState(defaultNotificationSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [permission, setPermission] = useState(() => systemPermission());
  const mobile = isMobileDevice();
  const deviceKey = mobile ? "mobile" : "desktop";
  const deviceName = mobile ? "Mobile" : "Desktop";
  const permissionInfo = permissionLabels[permission] || permissionLabels.unsupported;

  useEffect(() => {
    Config.getConfig(true)
      .then((config) => {
        const nextSettings = normalizeNotificationSettings(config?.settings?.notifications);
        setSettings(storeNotificationSettings(nextSettings));
      })
      .catch(() => {
        setMessage({ type: "warning", text: "Using browser notification preferences until the backend is reachable." });
      })
      .finally(() => setLoading(false));
  }, []);

  function updateSetting(key, value) {
    setSettings((current) => normalizeNotificationSettings({ ...current, [key]: value }));
  }

  function updateCategory(key, value) {
    setSettings((current) => normalizeNotificationSettings({ ...current, categories: { ...current.categories, [key]: value } }));
  }

  async function allowOnDevice() {
    const result = await requestSystemPermission();
    setPermission(systemPermission());
    if (result === "granted") {
      updateSetting(deviceKey, true);
      setMessage({ type: "success", text: `${deviceName} notifications are allowed on this device. Save to keep them switched on.` });
    } else if (result === "insecure") {
      setMessage({ type: "warning", text: "Browsers only allow system notifications over HTTPS (or localhost). Open Barracks through your HTTPS reverse proxy and allow them there." });
    } else if (result === "denied") {
      setMessage({ type: "warning", text: "Notifications are blocked for this site. Allow them in your browser's site settings, then try again." });
    }
  }

  async function sendTest() {
    const sent = await showSystemNotification("Barracks", "Test notification. System notifications are working on this device.", { tag: "jellyglance-test" });
    setMessage(sent ? { type: "success", text: "Test notification sent." } : { type: "warning", text: "The test couldn't be shown. Check that notifications are allowed for this site." });
  }

  function toggleDevice(key, value) {
    updateSetting(key, value);
    if (value && key === deviceKey && permission === "default") {
      allowOnDevice();
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setMessage(null);
      const response = await axios.post("/api/notification-settings", settings, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
      });
      const saved = storeNotificationSettings(response.data);
      setSettings(saved);
      await Config.setConfig();
      setMessage({ type: "success", text: "Notification settings saved." });
    } catch (error) {
      storeNotificationSettings(settings);
      setMessage({ type: "danger", text: error.response?.data?.error || "Unable to save notification settings." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="notification-settings notification-settings-loading">
        <Spinner className="tw:size-10" />
      </div>
    );
  }

  return (
    <form className="notification-settings settings-form" onSubmit={saveSettings}>
      <header className="settings-section-header">
        <div>
          <span>Alerts</span>
          <h2>Notifications</h2>
          <p>Choose where Barracks tells you about syncs, backups, tasks, downloads and playback, and which of those you want to hear about.</p>
        </div>
      </header>

      {message ? (
        <DismissibleAlert type={message.type} onClose={() => setMessage(null)}>
          {message.text}
        </DismissibleAlert>
      ) : null}

      <section className="notification-panel">
        <div className="notification-panel-title">
          <RiNotification3Line size={20} />
          <h3>Delivery</h3>
        </div>
        <label className="notification-switch" htmlFor="notify-in-app">
          <Switch id="notify-in-app" checked={settings.inApp} onCheckedChange={(checked) => updateSetting("inApp", checked)} />
          In-app pop-ups (toasts inside Barracks)
        </label>
        <label className="notification-switch" htmlFor="notify-desktop">
          <Switch id="notify-desktop" checked={settings.desktop} onCheckedChange={(checked) => toggleDevice("desktop", checked)} />
          <span className="notification-switch-label"><RiComputerLine size={16} /> Desktop notifications</span>
        </label>
        <label className="notification-switch" htmlFor="notify-mobile">
          <Switch id="notify-mobile" checked={settings.mobile} onCheckedChange={(checked) => toggleDevice("mobile", checked)} />
          <span className="notification-switch-label"><RiSmartphoneLine size={16} /> Mobile notifications</span>
        </label>
        <label className="notification-switch" htmlFor="notify-hidden-only">
          <Switch id="notify-hidden-only" checked={settings.systemOnlyWhenHidden} onCheckedChange={(checked) => updateSetting("systemOnlyWhenHidden", checked)} disabled={!settings.desktop && !settings.mobile} />
          Only send desktop and mobile notifications when Barracks isn&apos;t in focus
        </label>

        <div className="notification-device-row">
          <span>
            <strong>
              {mobile ? <RiSmartphoneLine size={16} /> : <RiComputerLine size={16} />} This device: {deviceName}
              {isStandaloneApp() ? " (installed app)" : ""}
            </strong>
            <small className={`notification-permission is-${permissionInfo.tone}`}>
              <RiShieldCheckLine size={13} /> {permissionInfo.label}
              {settings[deviceKey] ? "" : ` · ${deviceName.toLowerCase()} notifications are switched off`}
            </small>
          </span>
          <div className="notification-device-actions">
            {permission !== "granted" ? (
              <Button type="button" variant="outline" size="sm" onClick={allowOnDevice} disabled={permission === "unsupported"}>
                <RiShieldCheckLine size={15} /> Allow on this device
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={sendTest} disabled={permission !== "granted"}>
              <RiSendPlaneLine size={15} /> Send test
            </Button>
          </div>
        </div>
        <p className="notification-device-copy">
          {permission === "insecure"
            ? "Browsers only allow desktop and mobile notifications on HTTPS or localhost, so they can't be enabled on this plain-HTTP address. Open Barracks through your HTTPS domain to allow them. "
            : ""}
          Desktop and mobile notifications arrive while Barracks is open in a tab or as an installed app, and permission is granted per browser. On iPhone and iPad, add Barracks to your Home Screen first. For alerts when Barracks is closed, use a Discord or Gotify webhook.
        </p>
      </section>

      <section className="notification-panel">
        <div className="notification-panel-title">
          <RiFilter3Line size={20} />
          <h3>What to notify about</h3>
        </div>
        <div className="notification-category-grid">
          {NOTIFICATION_CATEGORIES.map((category) => (
            <label key={category.key} className="notification-switch notification-category" htmlFor={`notify-category-${category.key}`}>
              <Switch id={`notify-category-${category.key}`} checked={settings.categories?.[category.key] !== false} onCheckedChange={(checked) => updateCategory(category.key, checked)} />
              <span className="notification-category-copy">
                <strong>{category.title}</strong>
                <small>{category.text}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="notification-panel">
        <div className="notification-panel-title">
          <RiNotification3Line size={20} />
          <h3>How much to show</h3>
        </div>
        <div className="notification-mode-grid">
          {modes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className={settings.mode === mode.value ? "is-active" : ""}
              onClick={() => updateSetting("mode", mode.value)}
            >
              <strong>{mode.title}</strong>
              <span>{mode.text}</span>
            </button>
          ))}
        </div>
        <label className="notification-switch" htmlFor="manual-task-notifications">
          <Switch id="manual-task-notifications" checked={settings.manualTaskToasts} onCheckedChange={(checked) => updateSetting("manualTaskToasts", checked)} />
          Always show manually triggered task notifications
        </label>
      </section>

      {settings.inApp ? (
        <section className="notification-panel">
          <div className="notification-panel-title">
            <RiNotification3Line size={20} />
            <h3>In-app pop-ups</h3>
          </div>
          <div className="notification-field-grid">
            <div>
              <Label htmlFor="notification-position">Screen position</Label>
              <NativeSelect id="notification-position" value={settings.position} onChange={(event) => updateSetting("position", event.target.value)}>
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-center">Bottom center</option>
                <option value="top-right">Top right</option>
                <option value="top-center">Top center</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="notification-duration">Display duration</Label>
              <Input
                id="notification-duration"
                type="number"
                min="3"
                max="30"
                value={settings.durationSeconds}
                onChange={(event) => updateSetting("durationSeconds", Number(event.target.value))}
              />
              <small className="form-text">Seconds before a toast closes.</small>
            </div>
          </div>
        </section>
      ) : null}

      <div className="notification-actions">
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner className="tw:size-4" /> : <RiSave3Line size={17} />}
          Save notifications
        </Button>
      </div>
      <ThresholdAlertsPanel />
      <WebhookOutPanel />
    </form>
  );
}
