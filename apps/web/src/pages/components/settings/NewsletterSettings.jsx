import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import DismissibleAlert from "./dismissible-alert";
import { RiArticleLine, RiExternalLinkLine, RiMailCheckLine, RiMailSettingsLine, RiRefreshLine, RiSendPlaneLine } from "@remixicon/react";
import axios from "../../../lib/axios_instance";
import "../../css/settings/settings.css";

const emptySettings = {
  enabled: false,
  senderName: "Barracks",
  senderEmail: "",
  recipients: [],
  frequency: "manual",
  smtp: {
    host: "",
    port: 587,
    secure: false,
    username: "",
    password: "",
    rejectUnauthorized: true,
    hasPassword: false,
  },
  history: [],
};

function headers() {
  return {
    Authorization: `Bearer ${localStorage.getItem("token")}`,
    "Content-Type": "application/json",
  };
}

function formatDate(value) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function recipientsToText(recipients) {
  return Array.isArray(recipients) ? recipients.join("\n") : "";
}

function textToRecipients(value) {
  return String(value || "")
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePreviewPayload(payload) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const html = typeof data === "string" ? data : data?.html;
  if (!html || typeof html !== "string") return null;
  return {
    ...(typeof data === "object" ? data : {}),
    html,
    generatedAt: data?.generatedAt || new Date().toISOString(),
    subject: data?.subject || "Barracks newsletter preview",
  };
}

export default function NewsletterSettings() {
  const [settings, setSettings] = useState(emptySettings);
  const [recipientText, setRecipientText] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [preview, setPreview] = useState(null);
  const [activeTab, setActiveTab] = useState("settings");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState(null);

  const recipientCount = useMemo(() => textToRecipients(recipientText).length, [recipientText]);
  const previewHtml = preview?.html || "";

  async function loadNewsletter() {
    try {
      setLoading(true);
      const settingsResponse = await axios.get("/newsletter/settings", { headers: headers() });
      setSettings({
        ...emptySettings,
        ...settingsResponse.data,
        smtp: { ...emptySettings.smtp, ...(settingsResponse.data?.smtp || {}) },
      });
      setRecipientText(recipientsToText(settingsResponse.data?.recipients || []));
    } catch (error) {
      setMessage({ type: "danger", text: error.response?.data?.error || "Unable to load newsletter settings." });
    } finally {
      setLoading(false);
    }

    try {
      const previewResponse = await axios.get("/newsletter/preview", { headers: headers() });
      const nextPreview = normalizePreviewPayload(previewResponse.data);
      if (nextPreview) setPreview(nextPreview);
    } catch (error) {
      setPreview((current) => current);
    }
  }

  useEffect(() => {
    loadNewsletter();
  }, []);

  function updateField(field, value) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  function updateSmtp(field, value) {
    setSettings((current) => ({ ...current, smtp: { ...current.smtp, [field]: value } }));
  }

  async function saveSettings(event) {
    event?.preventDefault();
    try {
      setBusyAction("save");
      setMessage(null);
      const response = await axios.post(
        "/newsletter/settings",
        {
          ...settings,
          recipients: textToRecipients(recipientText),
        },
        { headers: headers() }
      );
      setSettings({
        ...emptySettings,
        ...response.data,
        smtp: { ...emptySettings.smtp, ...(response.data?.smtp || {}) },
      });
      setRecipientText(recipientsToText(response.data?.recipients || []));
      setMessage({ type: "success", text: "Newsletter settings saved." });
    } catch (error) {
      setMessage({ type: "danger", text: error.response?.data?.error || "Unable to save newsletter settings." });
    } finally {
      setBusyAction("");
    }
  }

  async function generatePreview() {
    try {
      setBusyAction("preview");
      const response = await axios.get("/newsletter/preview", { headers: headers() });
      const nextPreview = normalizePreviewPayload(response.data);
      if (!nextPreview) {
        throw new Error("Preview endpoint did not return newsletter HTML.");
      }
      setPreview(nextPreview);
      setActiveTab("preview");
      setMessage({ type: "success", text: "Newsletter preview refreshed." });
    } catch (error) {
      setMessage({ type: "danger", text: error.response?.data?.error || error.message || "Unable to generate newsletter preview." });
    } finally {
      setBusyAction("");
    }
  }

  async function sendTest() {
    try {
      setBusyAction("test");
      const response = await axios.post("/newsletter/test", { recipients: [testRecipient] }, { headers: headers() });
      setMessage({ type: "success", text: `Test newsletter sent to ${response.data.recipientCount} recipient.` });
      await loadNewsletter();
    } catch (error) {
      setMessage({ type: "danger", text: error.response?.data?.error || "Unable to send test newsletter." });
      await loadNewsletter();
    } finally {
      setBusyAction("");
    }
  }

  async function sendNewsletter() {
    const confirmed = window.confirm(`Send this newsletter to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}?`);
    if (!confirmed) return;

    try {
      setBusyAction("send");
      const response = await axios.post("/newsletter/send", { recipients: textToRecipients(recipientText) }, { headers: headers() });
      setMessage({ type: "success", text: `Newsletter sent to ${response.data.recipientCount} recipient${response.data.recipientCount === 1 ? "" : "s"}.` });
      await loadNewsletter();
    } catch (error) {
      setMessage({ type: "danger", text: error.response?.data?.error || "Unable to send newsletter." });
      await loadNewsletter();
    } finally {
      setBusyAction("");
    }
  }

  function openPreviewTab() {
    if (!previewHtml) return;
    const previewWindow = window.open("", "_blank");
    if (!previewWindow) {
      setMessage({ type: "warning", text: "Browser blocked the preview tab. Allow popups for Barracks and try again." });
      return;
    }
    previewWindow.opener = null;
    previewWindow.document.open();
    previewWindow.document.write(previewHtml);
    previewWindow.document.close();
  }

  if (loading) {
    return (
      <div className="newsletter-settings newsletter-loading">
        <Spinner className="tw:size-10" />
      </div>
    );
  }

  return (
    <div className="newsletter-settings">
      <header className="settings-section-header">
        <div>
          <span>Digest email</span>
          <h2>Newsletter Generator</h2>
          <p>Generate a Barracks digest with recently added media, weekly watch stats, active viewers, and repair status.</p>
        </div>
        <Button type="button" variant="outline" onClick={generatePreview} disabled={Boolean(busyAction)}>
          {busyAction === "preview" ? <Spinner className="tw:size-4" /> : <RiRefreshLine size={17} />}
          Generate preview
        </Button>
      </header>

      {message ? (
        <DismissibleAlert type={message.type} onClose={() => setMessage(null)}>
          {message.text}
        </DismissibleAlert>
      ) : null}

      <nav className="nav nav-pills newsletter-tabs" role="tablist" aria-label="Newsletter views">
        <div className="nav-item">
          <button type="button" role="tab" aria-selected={activeTab === "settings"} className={`nav-link ${activeTab === "settings" ? "active" : ""}`.trim()} onClick={() => setActiveTab("settings")}>
            Settings
          </button>
        </div>
        <div className="nav-item">
          <button type="button" role="tab" aria-selected={activeTab === "preview"} className={`nav-link ${activeTab === "preview" ? "active" : ""}`.trim()} onClick={() => setActiveTab("preview")}>
            Newsletter Preview
          </button>
        </div>
      </nav>
      {activeTab === "settings" ? (
      <div role="tabpanel" className="newsletter-tab-pane">
          <div className="newsletter-settings-grid">
            <form className="newsletter-form" onSubmit={saveSettings}>
              <section className="newsletter-panel">
                <div className="newsletter-panel-title">
                  <RiMailSettingsLine size={19} />
                  <h3>SMTP Options</h3>
                </div>
                <div className="newsletter-form-grid">
                  <div>
                    <Label htmlFor="newsletter-smtp-host">SMTP host</Label>
                    <Input id="newsletter-smtp-host" value={settings.smtp.host} onChange={(event) => updateSmtp("host", event.target.value)} placeholder="smtp.example.com" />
                  </div>
                  <div>
                    <Label htmlFor="newsletter-smtp-port">Port</Label>
                    <Input id="newsletter-smtp-port" type="number" min="1" value={settings.smtp.port} onChange={(event) => updateSmtp("port", Number(event.target.value))} />
                  </div>
                  <div>
                    <Label htmlFor="newsletter-smtp-username">Username</Label>
                    <Input id="newsletter-smtp-username" value={settings.smtp.username} onChange={(event) => updateSmtp("username", event.target.value)} autoComplete="username" />
                  </div>
                  <div>
                    <Label htmlFor="newsletter-smtp-password">Password</Label>
                    <Input
                      id="newsletter-smtp-password"
                      type="password"
                      value={settings.smtp.password}
                      onChange={(event) => updateSmtp("password", event.target.value)}
                      placeholder={settings.smtp.hasPassword ? "Stored password unchanged" : "SMTP password"}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="newsletter-toggle-row">
                  <label className="form-check form-switch">
                    <input
                      id="newsletter-secure"
                      type="checkbox"
                      role="switch"
                      className="form-check-input"
                      checked={settings.smtp.secure}
                      onChange={(event) => updateSmtp("secure", event.target.checked)}
                    />
                    <span>Use implicit TLS</span>
                  </label>
                  <label className="form-check form-switch">
                    <input
                      id="newsletter-tls-verify"
                      type="checkbox"
                      role="switch"
                      className="form-check-input"
                      checked={settings.smtp.rejectUnauthorized}
                      onChange={(event) => updateSmtp("rejectUnauthorized", event.target.checked)}
                    />
                    <span>Verify TLS certificates</span>
                  </label>
                </div>
              </section>

              <section className="newsletter-panel">
                <div className="newsletter-panel-title">
                  <RiArticleLine size={19} />
                  <h3>Newsletter</h3>
                </div>
                <div className="newsletter-form-grid">
                  <div>
                    <Label htmlFor="newsletter-sender-name">Sender name</Label>
                    <Input id="newsletter-sender-name" value={settings.senderName} onChange={(event) => updateField("senderName", event.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="newsletter-sender-email">Sender email</Label>
                    <Input id="newsletter-sender-email" type="email" value={settings.senderEmail} onChange={(event) => updateField("senderEmail", event.target.value)} placeholder="barracks@example.com" />
                  </div>
                  <div>
                    <Label htmlFor="newsletter-frequency">Frequency</Label>
                    <NativeSelect id="newsletter-frequency" value={settings.frequency} onChange={(event) => updateField("frequency", event.target.value)}>
                      <option value="manual">Manual only</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </NativeSelect>
                  </div>
                  <div>
                    <Label htmlFor="newsletter-test-recipient">Test recipient</Label>
                    <Input id="newsletter-test-recipient" type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="you@example.com" />
                  </div>
                </div>
                <div className="newsletter-recipient-box">
                  <Label htmlFor="newsletter-recipients">Recipients</Label>
                  <Textarea id="newsletter-recipients" rows={5} value={recipientText} onChange={(event) => setRecipientText(event.target.value)} placeholder={"one@example.com\nfamily@example.com"} />
                  <small className="form-text">{recipientCount} recipient{recipientCount === 1 ? "" : "s"} configured.</small>
                </div>
                <div className="newsletter-toggle-row">
                  <label className="form-check form-switch">
                    <input
                      id="newsletter-enabled"
                      type="checkbox"
                      role="switch"
                      className="form-check-input"
                      checked={settings.enabled}
                      onChange={(event) => updateField("enabled", event.target.checked)}
                    />
                    <span>Enable newsletter config</span>
                  </label>
                </div>
                <div className="newsletter-actions">
                  <Button type="submit" disabled={Boolean(busyAction)}>
                    {busyAction === "save" ? <Spinner className="tw:size-4" /> : <RiMailCheckLine size={17} />}
                    Save settings
                  </Button>
                  <Button type="button" variant="outline" onClick={sendTest} disabled={!testRecipient || Boolean(busyAction)}>
                    {busyAction === "test" ? <Spinner className="tw:size-4" /> : <RiSendPlaneLine size={17} />}
                    Send test
                  </Button>
                  <Button type="button" onClick={sendNewsletter} disabled={!recipientCount || Boolean(busyAction)}>
                    {busyAction === "send" ? <Spinner className="tw:size-4" /> : <RiSendPlaneLine size={17} />}
                    Send newsletter
                  </Button>
                </div>
              </section>
            </form>

            <section className="newsletter-panel newsletter-history-panel">
              <div className="newsletter-panel-title">
                <RiMailCheckLine size={19} />
                <h3>Send History</h3>
              </div>
              <div className="newsletter-history">
                {(settings.history || []).map((entry) => (
                  <article key={`${entry.timestamp}-${entry.mode}-${entry.messageId || entry.error}`} className={entry.ok ? "is-ok" : "is-error"}>
                    <strong>{entry.mode === "test" ? "Test email" : "Newsletter send"}</strong>
                    <span>{entry.ok ? `${entry.recipientCount || 0} recipient${entry.recipientCount === 1 ? "" : "s"}` : entry.error}</span>
                    <time>{formatDate(entry.timestamp)}</time>
                  </article>
                ))}
                {!(settings.history || []).length ? <div className="newsletter-empty">No newsletter sends yet.</div> : null}
              </div>
            </section>
          </div>
      </div>
      ) : null}
      {activeTab === "preview" ? (
      <div role="tabpanel" className="newsletter-tab-pane">
          <section className="newsletter-panel newsletter-preview-panel">
            <div className="newsletter-panel-title">
              <div>
                <RiArticleLine size={19} />
                <h3>Preview</h3>
              </div>
              <div className="newsletter-preview-actions">
                <Button type="button" variant="outline" onClick={generatePreview} disabled={Boolean(busyAction)}>
                  {busyAction === "preview" ? <Spinner className="tw:size-4" /> : <RiRefreshLine size={15} />}
                  Refresh
                </Button>
                <Button type="button" variant="outline" onClick={openPreviewTab} disabled={!previewHtml}>
                  <RiExternalLinkLine size={15} />
                  Open in tab
                </Button>
              </div>
            </div>
            <div className="newsletter-preview-meta">
              <strong>{preview?.subject || "Newsletter preview"}</strong>
              <span>Generated {formatDate(preview?.generatedAt)}</span>
            </div>
            <div className="newsletter-preview-frame">
              {previewHtml ? <iframe title="Newsletter preview" srcDoc={previewHtml} /> : <div className="newsletter-empty">Generate a preview to see the newsletter.</div>}
            </div>
          </section>
      </div>
      ) : null}
    </div>
  );
}
