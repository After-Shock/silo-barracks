import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RiEyeFill, RiEyeOffFill } from "@remixicon/react";
import axios from "../../../lib/axios_instance";
import Config from "../../../lib/config";
import Loading from "../general/loading";

// Keep the remixicon size props; the Button primitive would otherwise force 1rem icons.
const BUTTON_ICON_NATURAL_SIZE = "tw:[&_svg:not([class*=size-])]:size-auto";

export default function JellyfinIntegrationSettings({ compact = false, firstRun = false }) {
  const [config, setConfig] = useState(null);
  const [showKey, setKeyState] = useState(false);
  const [formValues, setFormValues] = useState({});
  const [isEditingConnection, setIsEditingConnection] = useState(!firstRun);
  const [isSubmitted, setIsSubmitted] = useState("");
  const [loadState, setLoadState] = useState("Loading");
  const [submissionMessage, setSubmissionMessage] = useState("");

  useEffect(() => {
    Config.getConfig()
      .then((nextConfig) => {
        setFormValues({ JF_HOST: nextConfig.hostUrl });
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
    axios
      .post("/api/setconfig/", formValues, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
      })
      .then((response) => {
        console.log("Config updated successfully:", response.data);
        setIsSubmitted("Success");
        setSubmissionMessage("Successfully updated Silo connection");
        Config.setConfig();
        if (firstRun) {
          setIsEditingConnection(false);
        }
      })
      .catch((error) => {
        const errorMessage = error.response?.data?.errorMessage || error.message;
        console.log("Error updating config:", errorMessage);
        setIsSubmitted("Failed");
        setSubmissionMessage(`Error updating Silo connection: ${errorMessage}`);
      });
  }

  if (loadState === "Loading") {
    return <Loading />;
  }

  if (loadState === "Critical") {
    return <div className="submit critical">{submissionMessage}</div>;
  }

  const hasSavedConnection = Boolean(config?.hostUrl);

  return (
    <section className={`jellyfin-integration-card${compact ? " is-compact" : ""}`}>
      <div className="jellyfin-integration-header">
        <span className="integration-icon">
          <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/jellyfin.svg" alt="" loading="lazy" decoding="async" />
        </span>
        <div>
          <p>Media server</p>
          <h2>{config?.IS_SILO ? "Silo Server" : config?.IS_JELLYFIN ? "Jellyfin" : "Emby"} Connection</h2>
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
        <form onSubmit={handleFormSubmit} className="settings-form integration-settings-form">
          <div className="mb-3 row">
            <Label htmlFor="JF_HOST" className="col">{config?.IS_SILO ? "Silo Server URL" : config?.IS_JELLYFIN ? "Jellyfin URL" : "Emby URL"}</Label>
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

          <div className="mb-3 row">
            <Label htmlFor="JF_API_KEY" className="col">API Key</Label>
            <div className="col">
              <div className="settings-input-group">
                <Input
                  id="JF_API_KEY"
                  name="JF_API_KEY"
                  value={formValues.JF_API_KEY || ""}
                  onChange={handleFormChange}
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                />
                <Button variant="outline" type="button" className={BUTTON_ICON_NATURAL_SIZE} onClick={() => setKeyState(!showKey)} aria-label={showKey ? "Hide API key" : "Show API key"}>
                  {showKey ? <RiEyeFill /> : <RiEyeOffFill />}
                </Button>
              </div>
            </div>
          </div>

          {isSubmitted !== "" ? (
            <Alert variant={isSubmitted === "Failed" ? "destructive" : "success"} className="tw:mb-4">
              <AlertDescription>{submissionMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div className="d-flex flex-column flex-md-row justify-content-end align-items-md-center gap-2">
            {firstRun && hasSavedConnection ? (
              <Button variant="secondary" type="button" onClick={() => setIsEditingConnection(false)}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit">
              Update
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
