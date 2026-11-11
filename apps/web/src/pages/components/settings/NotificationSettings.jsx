import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import DismissibleAlert from "./dismissible-alert";
import { RiNotification3Line, RiSave3Line } from "@remixicon/react";
import axios from "../../../lib/axios_instance";
import Config from "../../../lib/config";
import { defaultNotificationSettings, normalizeNotificationSettings, storeNotificationSettings } from "../../../lib/notification-settings";
import "../../css/settings/settings.css";

const modes = [
  { value: "all", title: "All notifications", text: "Show starts, updates, successes, warnings, and errors." },
  { value: "important", title: "Warnings and errors", text: "Hide automatic success and progress messages." },
  { value: "errors", title: "Errors only", text: "Only interrupt for failed or stopped work." },
  { value: "off", title: "Off", text: "Hide background in-app notifications." },
];

export default function NotificationSettings() {
  const [settings, setSettings] = useState(defaultNotificationSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

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
          <span>In-app alerts</span>
          <h2>Notifications</h2>
          <p>Control when Barracks shows toast messages while background tasks, syncs, backups, and repairs run.</p>
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
          <h3>Toast Behaviour</h3>
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
      </section>

      <section className="notification-panel">
        <div className="notification-field-grid">
          <div>
            <Label htmlFor="notification-position">Screen position</Label>
            <NativeSelect
              id="notification-position"
              value={settings.position}
              onChange={(event) => updateSetting("position", event.target.value)}
            >
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
        <label className="form-check form-switch notification-switch">
          <input
            id="manual-task-notifications"
            type="checkbox"
            role="switch"
            className="form-check-input"
            checked={settings.manualTaskToasts}
            onChange={(event) => updateSetting("manualTaskToasts", event.target.checked)}
          />
          <span>Always show manually triggered task notifications</span>
        </label>
      </section>

      <div className="notification-actions">
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner className="tw:size-4" /> : <RiSave3Line size={17} />}
          Save notifications
        </Button>
      </div>
    </form>
  );
}
