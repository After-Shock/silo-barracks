import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DismissibleAlert from "./dismissible-alert";
import { RiArticleLine, RiExternalLinkLine, RiMailCheckLine, RiMailSettingsLine, RiRefreshLine, RiSendPlaneLine } from "@remixicon/react";
import axios from "../../../lib/axios_instance";
import NewsletterReportBuilder from "./NewsletterReportBuilder";
import { useTranslation } from "react-i18next";
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

const HOUSE_SECTIONS = {
  recentlyAdded: true,
  topWatched: true,
  activeUsers: true,
  repairSummary: true,
  customHtml: "",
};

const PER_USER_SECTIONS = {
  continueWatching: true,
  myRequests: true,
  recentlyAdded: true,
  customHtml: "",
};

const emptyCampaign = {
  name: "",
  type: "global",
  frequency: "manual",
  enabled: false,
  audience: { recipients: [], roles: [] },
  sections: { ...HOUSE_SECTIONS },
};

function sectionsForType(type, sections = {}) {
  if (type === "per-user") {
    return { ...PER_USER_SECTIONS, ...sections, customHtml: sections.customHtml || "" };
  }
  return { ...HOUSE_SECTIONS, ...sections };
}

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
  const { t } = useTranslation();
  const [settings, setSettings] = useState(emptySettings);
  const [recipientText, setRecipientText] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [preview, setPreview] = useState(null);
  const [activeTab, setActiveTab] = useState("campaigns");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState(null);
  const [campaignList, setCampaignList] = useState([]);
  const [campaignHistory, setCampaignHistory] = useState([]);
  const [campaignSchemaReady, setCampaignSchemaReady] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [campaignDraft, setCampaignDraft] = useState(emptyCampaign);
  const [campaignRecipients, setCampaignRecipients] = useState("");

  const recipientCount = useMemo(() => textToRecipients(recipientText).length, [recipientText]);
  const previewHtml = preview?.html || "";
  const selectedCampaign = campaignList.find((campaign) => campaign.id === selectedCampaignId) || null;

  async function loadCampaigns() {
    const response = await axios.get("/newsletter/campaigns", { headers: headers() });
    const nextCampaigns = response.data?.campaigns || [];
    setCampaignSchemaReady(response.data?.schemaReady !== false);
    setCampaignList(nextCampaigns);
    setCampaignHistory(response.data?.history || []);
    const nextId = selectedCampaignId && nextCampaigns.some((campaign) => campaign.id === selectedCampaignId)
      ? selectedCampaignId
      : nextCampaigns[0]?.id || "";
    setSelectedCampaignId(nextId);
    const current = nextCampaigns.find((campaign) => campaign.id === nextId);
    if (current) {
      setCampaignDraft({
        ...emptyCampaign,
        ...current,
        sections: sectionsForType(current.type, current.sections || {}),
        audience: { recipients: [], roles: [], ...(current.audience || {}) },
      });
      setCampaignRecipients(recipientsToText(current.audience?.recipients || []));
    }
  }

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
      await loadCampaigns();
    } catch (error) {
      setMessage({ type: "danger", text: error.response?.data?.error || "Unable to load newsletter settings." });
    } finally {
      setLoading(false);
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

  function selectCampaign(campaignId) {
    setSelectedCampaignId(campaignId);
    const current = campaignList.find((campaign) => campaign.id === campaignId);
    if (!current) return;
    setCampaignDraft({
      ...emptyCampaign,
      ...current,
      sections: sectionsForType(current.type, current.sections || {}),
      audience: { recipients: [], roles: [], ...(current.audience || {}) },
    });
    setCampaignRecipients(recipientsToText(current.audience?.recipients || []));
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
      setMessage({ type: "success", text: "Shared SMTP settings saved." });
    } catch (error) {
      setMessage({ type: "danger", text: error.response?.data?.error || "Unable to save newsletter settings." });
    } finally {
      setBusyAction("");
    }
  }

  async function saveCampaign() {
    try {
      setBusyAction("campaign-save");
      setMessage(null);
      const payload = {
        ...campaignDraft,
        sections: sectionsForType(campaignDraft.type, campaignDraft.sections || {}),
        audience: {
          ...(campaignDraft.audience || {}),
          recipients: campaignDraft.type === "per-user" ? [] : textToRecipients(campaignRecipients),
        },
      };
      if (selectedCampaignId) {
        await axios.put(`/newsletter/campaigns/${encodeURIComponent(selectedCampaignId)}`, payload, { headers: headers() });
      } else {
        const created = await axios.post("/newsletter/campaigns", payload, { headers: headers() });
        setSelectedCampaignId(created.data.id);
      }
      await loadCampaigns();
      setMessage({ type: "success", text: "Campaign saved." });
    } catch (error) {
      setMessage({ type: "danger", text: error.response?.data?.error || "Unable to save campaign." });
    } finally {
      setBusyAction("");
    }
  }

  async function createCampaign() {
    setSelectedCampaignId("");
    setCampaignDraft({ ...emptyCampaign, name: "New campaign" });
    setCampaignRecipients("");
  }

  async function sendCampaign() {
    if (!selectedCampaignId) return;
    const count = campaignDraft.type === "per-user" ? "opted-in users" : textToRecipients(campaignRecipients).length;
    const confirmed = window.confirm(`Send “${campaignDraft.name}” to ${count || "configured"} recipients?`);
    if (!confirmed) return;
    try {
      setBusyAction("campaign-send");
      const response = await axios.post(
        `/newsletter/campaigns/${encodeURIComponent(selectedCampaignId)}/send`,
        { recipients: campaignDraft.type === "per-user" ? [] : textToRecipients(campaignRecipients) },
        { headers: headers() }
      );
      setMessage({ type: "success", text: `Campaign sent to ${response.data.recipientCount} recipient${response.data.recipientCount === 1 ? "" : "s"}.` });
      await loadCampaigns();
    } catch (error) {
      setMessage({ type: "danger", text: error.response?.data?.error || "Unable to send campaign." });
      await loadCampaigns();
    } finally {
      setBusyAction("");
    }
  }

  async function generatePreview() {
    try {
      setBusyAction("preview");
      const response = await axios.get("/newsletter/preview", {
        headers: headers(),
        params: selectedCampaignId ? { campaignId: selectedCampaignId } : undefined,
      });
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
      const response = await axios.post(
        "/newsletter/test",
        { recipients: [testRecipient], campaignId: selectedCampaignId || undefined },
        { headers: headers() }
      );
      setMessage({ type: "success", text: `Test newsletter sent to ${response.data.recipientCount} recipient.` });
      await loadNewsletter();
    } catch (error) {
      setMessage({ type: "danger", text: error.response?.data?.error || "Unable to send test newsletter." });
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
          <span>{t("FEATURES.NEWSLETTER.KICKER")}</span>
          <h2>{t("FEATURES.NEWSLETTER.TITLE")}</h2>
          <p>{t("FEATURES.NEWSLETTER.INTRO")}</p>
        </div>
        <Button type="button" variant="outline" onClick={generatePreview} disabled={Boolean(busyAction)}>
          {busyAction === "preview" ? <Spinner className="tw:size-4" /> : <RiRefreshLine size={17} />}
          {t("FEATURES.NEWSLETTER.PREVIEW")}
        </Button>
      </header>

      {message ? (
        <DismissibleAlert type={message.type} onClose={() => setMessage(null)}>
          {message.text}
        </DismissibleAlert>
      ) : null}

      {!campaignSchemaReady ? (
        <DismissibleAlert type="info" onClose={() => setCampaignSchemaReady(true)}>
          {t("FEATURES.NEWSLETTER.SCHEMA_INIT")}
        </DismissibleAlert>
      ) : null}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value || "campaigns")} className="newsletter-tabs">
        <TabsList variant="line">
          <TabsTrigger value="campaigns">{t("FEATURES.NEWSLETTER.TAB_CAMPAIGNS")}</TabsTrigger>
          <TabsTrigger value="builder">Report builder</TabsTrigger>
          <TabsTrigger value="settings">{t("FEATURES.NEWSLETTER.TAB_SMTP")}</TabsTrigger>
          <TabsTrigger value="preview">{t("FEATURES.NEWSLETTER.TAB_PREVIEW")}</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="newsletter-tab-pane">
          <div className="newsletter-settings-grid">
            <div className="newsletter-campaign-sidebar">
              <section className="newsletter-panel">
                <div className="newsletter-panel-title">
                  <RiArticleLine size={19} />
                  <h3>{t("FEATURES.NEWSLETTER.CAMPAIGNS")}</h3>
                  <Button type="button" size="sm" variant="outline" onClick={createCampaign}>
                    {t("FEATURES.NEWSLETTER.NEW")}
                  </Button>
                </div>
                <div className="newsletter-history">
                  {campaignList.map((campaign) => (
                    <article
                      key={campaign.id}
                      role="button"
                      tabIndex={0}
                      className={campaign.id === selectedCampaignId ? "is-ok" : ""}
                      onClick={() => selectCampaign(campaign.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") selectCampaign(campaign.id);
                      }}
                    >
                      <strong>{campaign.name}</strong>
                      <span>
                        {campaign.type} · {campaign.frequency}
                        {campaign.enabled ? " · enabled" : " · paused"}
                      </span>
                      <time>Last sent {formatDate(campaign.lastSentAt)}</time>
                    </article>
                  ))}
                  {!campaignList.length ? <div className="newsletter-empty">{t("FEATURES.NEWSLETTER.EMPTY")}</div> : null}
                </div>
              </section>

              <section className="newsletter-panel newsletter-history-panel">
                <div className="newsletter-panel-title">
                  <RiMailCheckLine size={19} />
                  <h3>{t("FEATURES.NEWSLETTER.HISTORY")}</h3>
                </div>
                <div className="newsletter-history">
                  {campaignHistory.map((entry) => (
                    <article key={entry.id} className={entry.status === "ok" ? "is-ok" : "is-error"}>
                      <strong>{entry.campaignName || "Campaign"} · {entry.mode}</strong>
                      <span>{entry.status === "ok" ? `${entry.recipientCount || 0} recipients` : entry.error}</span>
                      <time>{formatDate(entry.sentAt)}</time>
                    </article>
                  ))}
                  {!campaignHistory.length ? <div className="newsletter-empty">No campaign sends yet.</div> : null}
                </div>
              </section>
            </div>

            <form
              className="newsletter-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveCampaign();
              }}
            >
              <section className="newsletter-panel">
                <div className="newsletter-panel-title">
                  <RiMailCheckLine size={19} />
                  <h3>{selectedCampaign ? t("FEATURES.NEWSLETTER.EDIT_CAMPAIGN") : t("FEATURES.NEWSLETTER.NEW")}</h3>
                </div>
                <div className="newsletter-form-grid">
                  <div>
                    <Label>{t("FEATURES.NEWSLETTER.NAME")}</Label>
                    <Input value={campaignDraft.name} onChange={(event) => setCampaignDraft((current) => ({ ...current, name: event.target.value }))} />
                  </div>
                  <div>
                    <Label>{t("FEATURES.NEWSLETTER.TYPE")}</Label>
                    <NativeSelect
                      value={campaignDraft.type}
                      onChange={(event) => {
                        const type = event.target.value;
                        setCampaignDraft((current) => ({
                          ...current,
                          type,
                          sections: sectionsForType(type, {
                            customHtml: current.sections?.customHtml || "",
                            ...(current.sections?.report ? { report: current.sections.report } : {}),
                          }),
                        }));
                      }}
                    >
                      <option value="global">{t("FEATURES.NEWSLETTER.TYPE_GLOBAL")}</option>
                      <option value="role">{t("FEATURES.NEWSLETTER.TYPE_ROLE")}</option>
                      <option value="personal">{t("FEATURES.NEWSLETTER.TYPE_PERSONAL")}</option>
                      <option value="per-user">{t("FEATURES.NEWSLETTER.TYPE_PER_USER")}</option>
                    </NativeSelect>
                  </div>
                  <div>
                    <Label>{t("FEATURES.NEWSLETTER.FREQUENCY")}</Label>
                    <NativeSelect value={campaignDraft.frequency} onChange={(event) => setCampaignDraft((current) => ({ ...current, frequency: event.target.value }))}>
                      <option value="manual">Manual only</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </NativeSelect>
                  </div>
                  <div>
                    <Label>{t("FEATURES.NEWSLETTER.TEST_RECIPIENT")}</Label>
                    <Input type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="you@example.com" />
                  </div>
                </div>
                {campaignDraft.type === "per-user" ? (
                  <p className="newsletter-help">{t("FEATURES.NEWSLETTER.PER_USER_HELP")}</p>
                ) : (
                  <div className="newsletter-recipient-box">
                    <Label>{t("FEATURES.NEWSLETTER.CAMPAIGN_RECIPIENTS")}</Label>
                    <Textarea rows={4} value={campaignRecipients} onChange={(event) => setCampaignRecipients(event.target.value)} placeholder={"one@example.com\nfamily@example.com"} />
                  </div>
                )}
                <div className="newsletter-toggle-row">
                  <label htmlFor="campaign-enabled">
                    <Switch id="campaign-enabled" checked={Boolean(campaignDraft.enabled)} onCheckedChange={(checked) => setCampaignDraft((current) => ({ ...current, enabled: checked }))} />
                    <span>Enable campaign</span>
                  </label>
                  {(campaignDraft.type === "per-user" ? ["continueWatching", "myRequests", "recentlyAdded"] : ["recentlyAdded", "topWatched", "activeUsers", "repairSummary"]).map((section) => (
                    <label key={section} htmlFor={`campaign-section-${section}`}>
                      <Switch
                        id={`campaign-section-${section}`}
                        checked={Boolean(campaignDraft.sections?.[section])}
                        onCheckedChange={(checked) =>
                          setCampaignDraft((current) => ({
                            ...current,
                            sections: { ...current.sections, [section]: checked },
                          }))
                        }
                      />
                      <span>{t(`FEATURES.NEWSLETTER.SECTION_${section}`, { defaultValue: section.replace(/([A-Z])/g, " $1") })}</span>
                    </label>
                  ))}
                </div>
                <div className="newsletter-recipient-box">
                  <Label>{t("FEATURES.NEWSLETTER.CUSTOM_HTML")}</Label>
                  <Textarea
                    rows={3}
                    value={campaignDraft.sections?.customHtml || ""}
                    onChange={(event) =>
                      setCampaignDraft((current) => ({
                        ...current,
                        sections: { ...current.sections, customHtml: event.target.value },
                      }))
                    }
                    placeholder="Optional custom HTML appended to the digest"
                  />
                </div>
                <div className="newsletter-actions">
                  <Button type="submit" disabled={Boolean(busyAction)}>
                    {busyAction === "campaign-save" ? <Spinner className="tw:size-4" /> : <RiMailCheckLine size={17} />}
                    {t("FEATURES.NEWSLETTER.SAVE_CAMPAIGN")}
                  </Button>
                  <Button type="button" variant="outline" onClick={sendTest} disabled={!testRecipient || Boolean(busyAction)}>
                    {busyAction === "test" ? <Spinner className="tw:size-4" /> : <RiSendPlaneLine size={17} />}
                    {t("FEATURES.NEWSLETTER.SEND_TEST")}
                  </Button>
                  <Button type="button" onClick={sendCampaign} disabled={!selectedCampaignId || Boolean(busyAction)}>
                    {busyAction === "campaign-send" ? <Spinner className="tw:size-4" /> : <RiSendPlaneLine size={17} />}
                    {t("FEATURES.NEWSLETTER.SEND_CAMPAIGN")}
                  </Button>
                </div>
              </section>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="builder" className="newsletter-tab-pane">
          <div className="report-builder-campaign">
            <NativeSelect value={selectedCampaignId} onChange={(event) => selectCampaign(event.target.value)} aria-label="Campaign">
              {!selectedCampaignId ? <option value="">{campaignDraft.name || "New campaign"} (unsaved)</option> : null}
              {campaignList.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name} · {campaign.type}
                </option>
              ))}
            </NativeSelect>
            <Button type="button" onClick={saveCampaign} disabled={Boolean(busyAction)}>
              {busyAction === "campaign-save" ? <Spinner className="tw:size-4" /> : <RiMailCheckLine size={17} />}
              {t("FEATURES.NEWSLETTER.SAVE_CAMPAIGN")}
            </Button>
            <Button type="button" variant="outline" onClick={sendTest} disabled={!testRecipient || !selectedCampaignId || Boolean(busyAction)} title={testRecipient ? "" : "Set a test recipient on the Campaigns tab"}>
              {busyAction === "test" ? <Spinner className="tw:size-4" /> : <RiSendPlaneLine size={17} />}
              {t("FEATURES.NEWSLETTER.SEND_TEST")}
            </Button>
          </div>
          <NewsletterReportBuilder
            report={campaignDraft.sections?.report}
            campaignType={campaignDraft.type}
            campaignName={campaignDraft.name}
            campaignId={selectedCampaignId}
            onChange={(report) => setCampaignDraft((current) => ({ ...current, sections: { ...current.sections, report } }))}
          />
        </TabsContent>

        <TabsContent value="settings" className="newsletter-tab-pane">
          <div className="newsletter-settings-grid">
            <form className="newsletter-form" onSubmit={saveSettings}>
              <section className="newsletter-panel">
                <div className="newsletter-panel-title">
                  <RiMailSettingsLine size={19} />
                  <h3>{t("FEATURES.NEWSLETTER.TAB_SMTP")}</h3>
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
                  <div>
                    <Label htmlFor="newsletter-sender-name">Sender name</Label>
                    <Input id="newsletter-sender-name" value={settings.senderName} onChange={(event) => updateField("senderName", event.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="newsletter-sender-email">Sender email</Label>
                    <Input id="newsletter-sender-email" type="email" value={settings.senderEmail} onChange={(event) => updateField("senderEmail", event.target.value)} placeholder="barracks@example.com" />
                  </div>
                </div>
                <div className="newsletter-toggle-row">
                  <label htmlFor="newsletter-secure">
                    <Switch id="newsletter-secure" checked={settings.smtp.secure} onCheckedChange={(checked) => updateSmtp("secure", checked)} />
                    <span>Use implicit TLS</span>
                  </label>
                  <label htmlFor="newsletter-tls-verify">
                    <Switch id="newsletter-tls-verify" checked={settings.smtp.rejectUnauthorized} onCheckedChange={(checked) => updateSmtp("rejectUnauthorized", checked)} />
                    <span>Verify TLS certificates</span>
                  </label>
                  <label htmlFor="newsletter-enabled">
                    <Switch id="newsletter-enabled" checked={settings.enabled} onCheckedChange={(checked) => updateField("enabled", checked)} />
                    <span>Enable shared SMTP config</span>
                  </label>
                </div>
                <div className="newsletter-recipient-box">
                  <Label htmlFor="newsletter-recipients">Legacy default recipients</Label>
                  <Textarea id="newsletter-recipients" rows={4} value={recipientText} onChange={(event) => setRecipientText(event.target.value)} placeholder={"one@example.com\nfamily@example.com"} />
                  <small className="form-text">{recipientCount} recipient{recipientCount === 1 ? "" : "s"} used when a campaign has none configured.</small>
                </div>
                <div className="newsletter-actions">
                  <Button type="submit" disabled={Boolean(busyAction)}>
                    {busyAction === "save" ? <Spinner className="tw:size-4" /> : <RiMailCheckLine size={17} />}
                    {t("FEATURES.NEWSLETTER.SAVE_SMTP")}
                  </Button>
                </div>
              </section>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="newsletter-tab-pane">
          <section className="newsletter-panel newsletter-preview-panel">
            <div className="newsletter-panel-title">
              <div>
                <RiArticleLine size={19} />
                <h3>{t("FEATURES.NEWSLETTER.TAB_PREVIEW")}</h3>
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
              {previewHtml ? <iframe title={t("FEATURES.NEWSLETTER.PREVIEW_SUBJECT")} srcDoc={previewHtml} /> : <div className="newsletter-empty">{t("FEATURES.NEWSLETTER.PREVIEW_EMPTY")}</div>}
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
