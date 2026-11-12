import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useTranslation } from "react-i18next";
import { RiEyeFill, RiEyeOffFill } from "@remixicon/react";
import axios from "../../../lib/axios_instance";
import Config from "../../../lib/config";
import Loading from "../general/loading";
import MediaServerConnectionTest, { CONNECTION_TEST_PREFIX, useConnectionTest } from "./MediaServerConnectionTest";

// Keep the remixicon size props; the Button primitive would otherwise force 1rem icons.
const BUTTON_ICON_NATURAL_SIZE = "tw:[&_svg:not([class*=size-])]:size-auto";

export default function JellyfinIntegrationSettings({ compact = false, firstRun = false }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState(null);
  const [showKey, setKeyState] = useState(false);
  const [formValues, setFormValues] = useState({});
  const [isEditingConnection, setIsEditingConnection] = useState(!firstRun);
  const [isSubmitted, setIsSubmitted] = useState("");
  const [loadState, setLoadState] = useState("Loading");
  const [submissionMessage, setSubmissionMessage] = useState("");

  const connectionTest = useConnectionTest(config?.token);

  useEffect(() => {
    Config.getConfig()
      .then((nextConfig) => {
        setFormValues({ JF_HOST: nextConfig.hostUrl, SERVER_TYPE: nextConfig.SERVER_TYPE || "jellyfin" });
        setConfig(nextConfig);
        setLoadState("Loaded");
      })
      .catch((error) => {
        console.log("Error retrieving config:", error);
        setLoadState("Critical");
        setSubmissionMessage("Error retrieving configuration. Unable to contact backend server.");
      });
  }, []);

  function handleFormChange(event) {
    setFormValues({ ...formValues, [event.target.name]: event.target.value });
  }

  async function handleFormSubmit(event) {
    event.preventDefault();

    setIsSubmitted("");
    const payload = config?.SERVER_TYPE_LOCKED ? { ...formValues, SERVER_TYPE: undefined } : formValues;
    const label = formValues.SERVER_TYPE === "emby" ? "Emby" : "Jellyfin";
    axios
      .post("/api/setconfig/", payload, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
      })
      .then((response) => {
        console.log("Config updated successfully:", response.data);
        setIsSubmitted("Success");
        setSubmissionMessage(`Successfully updated ${config?.IS_SILO ? "Silo" : label} connection`);
        Config.getConfig(true)
          .then((nextConfig) => nextConfig?.hostUrl && setConfig(nextConfig))
          .catch(() => {});
        if (firstRun) {
          setIsEditingConnection(false);
        }
      })
      .catch((error) => {
        const errorMessage = error.response?.data?.errorMessage || error.message;
        console.log("Error updating config:", errorMessage);
        setIsSubmitted("Failed");
        setSubmissionMessage(`Error updating ${config?.IS_SILO ? "Silo" : label} connection: ${errorMessage}`);
      });
  }

  if (loadState === "Loading") {
    return <Loading />;
  }

  if (loadState === "Critical") {
    return <div className="submit critical">{submissionMessage}</div>;
  }

  const hasSavedConnection = Boolean(config?.hostUrl);
  const savedType = config?.SERVER_TYPE || (config?.IS_JELLYFIN === false ? "emby" : "jellyfin");
  const selectedType = formValues.SERVER_TYPE || savedType;
  const selectedLabel = selectedType === "emby" ? "Emby" : "Jellyfin";
  const showResults = hasSavedConnection && !firstRun;

  return (
    <section className={`jellyfin-integration-card${compact ? " is-compact" : ""}${firstRun && !isEditingConnection ? "" : " has-connection-layout"}`}>
      <div className="jellyfin-integration-header">
        <span className="integration-icon">
          <img src={`https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${selectedType === "emby" ? "emby" : "jellyfin"}.svg`} alt="" loading="lazy" decoding="async" />
        </span>
        <div>
          <p>Media server</p>
          <h2>{config?.IS_SILO ? "Silo Server" : selectedLabel} Connection</h2>
          <span>
            {firstRun
              ? "Already connected for setup. Re-enter details only if you want to replace the saved media server connection."
              : "Primary media server used for sessions, library scans, artwork, users, and statistics."}
          </span>
        </div>
      </div>

      {firstRun && hasSavedConnection && !isEditingConnection ? (
        <div className="settings-form integration-settings-form jellyfin-connected-summary">
          <div>
            <span>Connected server</span>
            <strong>{config.hostUrl}</strong>
          </div>
          <Button variant="outline" type="button" onClick={() => setIsEditingConnection(true)}>
            Replace connection
          </Button>
        </div>
      ) : (
        <div className={`jf-connection-layout${showResults ? " has-results" : ""}`}>
          <form onSubmit={handleFormSubmit} className="settings-form integration-settings-form jf-connection-form">
            <div className="mb-3 row jf-field">
              <Label htmlFor="SERVER_TYPE" className="col">Server type</Label>
              <div className="col">
                <NativeSelect id="SERVER_TYPE" name="SERVER_TYPE" value={formValues.SERVER_TYPE || "jellyfin"} onChange={handleFormChange} disabled={config?.SERVER_TYPE_LOCKED}>
                  <option value="jellyfin">Jellyfin</option>
                  <option value="emby">Emby</option>
                </NativeSelect>
                {config?.SERVER_TYPE_LOCKED ? <small className="form-text">Set by the IS_EMBY_API environment variable.</small> : null}
                {!config?.SERVER_TYPE_LOCKED && selectedType !== savedType ? (
                  <small className="form-text">
                    Not saved yet. Enter the {selectedLabel} URL and API key, then press Update to switch from {savedType === "emby" ? "Emby" : "Jellyfin"}.
                  </small>
                ) : null}
              </div>
            </div>

            <div className="mb-3 row jf-field">
              <Label htmlFor="JF_HOST" className="col">{config?.IS_SILO ? "Silo Server URL" : `${selectedLabel} URL`}</Label>
              <div className="col">
                <Input
                  id="JF_HOST"
                  name="JF_HOST"
                  value={formValues.JF_HOST || ""}
                  onChange={handleFormChange}
                  placeholder="http://127.0.0.1:8096 or https://media.example.com"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="mb-3 row jf-field">
              <Label htmlFor="JF_API_KEY" className="col">API Key</Label>
              <div className="col">
                <div className="settings-input-group">
                  <Input
                    id="JF_API_KEY"
                    name="JF_API_KEY"
                    value={formValues.JF_API_KEY || ""}
                    onChange={handleFormChange}
                    type={showKey ? "text" : "password"}
                    placeholder={hasSavedConnection ? "••••••••••••••••" : t(`${CONNECTION_TEST_PREFIX}.KEY_PLACEHOLDER`)}
                    autoComplete="off"
                  />
                  <Button variant="outline" type="button" className={BUTTON_ICON_NATURAL_SIZE} onClick={() => setKeyState(!showKey)} aria-label={t(`${CONNECTION_TEST_PREFIX}.${showKey ? "HIDE_KEY" : "SHOW_KEY"}`)} aria-pressed={showKey} title={t(`${CONNECTION_TEST_PREFIX}.${showKey ? "HIDE_KEY" : "SHOW_KEY"}`)}>
                    {showKey ? <RiEyeFill /> : <RiEyeOffFill />}
                  </Button>
                </div>
                {hasSavedConnection ? <small className="form-text">{t(`${CONNECTION_TEST_PREFIX}.KEY_SAVED_HINT`)}</small> : null}
              </div>
            </div>

            {isSubmitted !== "" ? (
              <Alert variant={isSubmitted === "Failed" ? "destructive" : "success"} className="tw:mb-4">
                <AlertDescription>{submissionMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className="jf-connection-actions">
              {firstRun && hasSavedConnection ? (
                <Button variant="secondary" type="button" onClick={() => setIsEditingConnection(false)}>
                  Cancel
                </Button>
              ) : null}
              {showResults ? (
                <Button variant="secondary" type="button" onClick={connectionTest.runTest} disabled={connectionTest.running}>
                  {connectionTest.running ? t(`${CONNECTION_TEST_PREFIX}.RUNNING`) : t(`${CONNECTION_TEST_PREFIX}.RUN`)}
                </Button>
              ) : null}
              <Button type="submit">
                Update
              </Button>
            </div>
          </form>

          {showResults ? (
            <MediaServerConnectionTest
              running={connectionTest.running}
              result={connectionTest.result}
              error={connectionTest.error}
              hostUrl={config.hostUrl}
              formUrl={formValues.JF_HOST}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
