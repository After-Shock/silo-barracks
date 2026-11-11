import { useEffect, useState } from "react";
import axios from "../../../lib/axios_instance";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { RiEyeFill, RiEyeOffFill, RiLoginCircleLine, RiShieldKeyholeLine, RiUserSettingsLine } from "@remixicon/react";
import { Link } from "react-router-dom";

import Config from "../../../lib/config";
import {
  ACTIVE_SESSION_IP_PRIVACY_OPTIONS,
  getActiveSessionIpPrivacy,
  setActiveSessionIpPrivacy,
} from "../../../lib/privacy-settings";

import "../../css/settings/settings.css";

// Keep the remixicon size props; the Button primitive would otherwise force 1rem icons.
const BUTTON_ICON_NATURAL_SIZE = "tw:[&_svg:not([class*=size-])]:size-auto";

const authModes = [
  {
    id: "quick-connect",
    title: "Jellyfin Login / Quick Connect",
    text: "Use Jellyfin Quick Connect for account access.",
    Icon: RiLoginCircleLine,
  },
  {
    id: "oidc",
    title: "OIDC / Authentik",
    text: "Use an external identity provider.",
    Icon: RiShieldKeyholeLine,
  },
  {
    id: "local",
    title: "Local",
    text: "Use a Silo Barracks username and password.",
    Icon: RiUserSettingsLine,
  },
];

export default function SecuritySettings() {
  const [isSilo, setIsSilo] = useState(true);
  const [authMode, setAuthMode] = useState("quick-connect");
  const [showOidcSecret, setShowOidcSecret] = useState(false);
  const [oidcValues, setOidcValues] = useState({});
  const [activeSessionIpPrivacy, setActiveSessionIpPrivacyState] = useState(() => getActiveSessionIpPrivacy());
  const [saving, setSaving] = useState(false);
  const [isSubmitted, setisSubmitted] = useState("");
  const [submissionMessage, setsubmissionMessage] = useState("");
  const token = localStorage.getItem("token");
  const activeAuthMode = authModes.find((mode) => mode.id === authMode) || authModes[0];
  const activePrivacyMode = ACTIVE_SESSION_IP_PRIVACY_OPTIONS.find((option) => option.id === activeSessionIpPrivacy) || ACTIVE_SESSION_IP_PRIVACY_OPTIONS[0];

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const newConfig = await Config.getConfig(true);
        setIsSilo(newConfig.IS_SILO === true);
        const nextAuth = newConfig.settings?.auth || {};
        const nextMode = nextAuth.mode || (newConfig.requireLogin ? "local" : "quick-connect");

        setAuthMode(nextMode);
        setOidcValues({
          issuerUrl: nextAuth.issuerUrl || "",
          clientId: nextAuth.clientId || "",
          clientSecret: nextAuth.clientSecret || "",
          redirectUri: nextAuth.redirectUri || `${window.location.origin}/auth/oidc/callback`,
        });
      } catch (error) {
        console.log(error);
      }
    };

    fetchConfig();

    const intervalId = setInterval(fetchConfig, 60000 * 5);
    return () => clearInterval(intervalId);
  }, []);

  async function saveAuthMode(payload) {
    const result = await axios
      .post("/api/setAuthMode", payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })
      .catch((error) => error.response);

    if (result?.status >= 400) {
      return { isValid: false, errorMessage: result?.data?.errorMessage || "Unable to update authentication mode" };
    }

    await Config.setConfig();
    return { isValid: true };
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setisSubmitted("");

    let result;

    if (authMode === "quick-connect") {
      result = await saveAuthMode({ mode: "quick-connect" });
    }

    if (authMode === "oidc") {
      result = await saveAuthMode({ mode: "oidc", ...oidcValues });
    }

    if (authMode === "local") {
      result = await saveAuthMode({ mode: "local" });
    }

    setSaving(false);
    if (result?.isValid) {
      setisSubmitted("Success");
      setsubmissionMessage("Authentication settings updated.");
      return;
    }

    setisSubmitted("Failed");
    setsubmissionMessage(result?.errorMessage || "Unable to update authentication settings.");
  }

  function handleOidcChange(event) {
    setOidcValues({ ...oidcValues, [event.target.name]: event.target.value });
  }

  function handleActiveSessionIpPrivacyChange(value) {
    const nextValue = setActiveSessionIpPrivacy(value);
    setActiveSessionIpPrivacyState(nextValue);
    setisSubmitted("Success");
    setsubmissionMessage("Active Sessions IP privacy updated.");
  }

  return (
    <div className="security-page">
      <header className="security-hero">
        <div>
          <span>Access Control</span>
          <h1>Security</h1>
          <p>Manage sign-in, identity providers, and what sensitive session details are visible on shared screens.</p>
        </div>
        <div className="security-current-stack" aria-label="Current security settings">
          <article>
            <RiLoginCircleLine size={18} />
            <span>Authentication</span>
            <strong>{activeAuthMode.title}</strong>
          </article>
          <article>
            <RiShieldKeyholeLine size={18} />
            <span>IP Privacy</span>
            <strong>{activePrivacyMode.title}</strong>
          </article>
        </div>
      </header>

      {isSubmitted !== "" ? (
        <Alert variant={isSubmitted === "Failed" ? "destructive" : "success"} className="security-status-alert tw:mb-4">
          <AlertDescription>{submissionMessage}</AlertDescription>
        </Alert>
      ) : null}

      <section className="settings-form security-auth-form security-privacy-form">
        <div className="security-auth-header">
          <div>
            <h2>Active Sessions privacy</h2>
            <p>Choose where Silo Barracks hides viewer IP addresses in Active Sessions cards and details.</p>
          </div>
          <strong>{activePrivacyMode.title}</strong>
        </div>

        <div className="security-auth-grid security-privacy-grid" role="radiogroup" aria-label="Active Sessions IP privacy">
          {ACTIVE_SESSION_IP_PRIVACY_OPTIONS.map(({ id, title, text }) => (
            <button
              key={id}
              type="button"
              className={`security-auth-card ${activeSessionIpPrivacy === id ? "is-active" : ""}`}
              onClick={() => handleActiveSessionIpPrivacyChange(id)}
            >
              <RiShieldKeyholeLine size={22} />
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <form onSubmit={handleAuthSubmit} className="settings-form security-auth-form">
        <div className="security-auth-header">
          <div>
            <h2>Authentication</h2>
            <p>Choose how Silo Barracks signs users in after Jellyfin setup.</p>
          </div>
          <strong>{activeAuthMode.title}</strong>
        </div>

        <div className="security-auth-grid" role="radiogroup" aria-label="Authentication mode">
          {authModes.filter(mode => !isSilo || mode.id !== 'quick-connect').map(({ id, title, text, Icon }) => (
            <button
              key={id}
              type="button"
              className={`security-auth-card ${authMode === id ? "is-active" : ""}`}
              onClick={() => setAuthMode(id)}
            >
              <Icon size={22} />
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
            </button>
          ))}
        </div>

        {authMode === "quick-connect" && (
          <div className="security-auth-panel">
            <strong>Jellyfin Login / Quick Connect selected</strong>
            <p>
              Silo Barracks will send users through Jellyfin Quick Connect. No local admin username or password is needed for
              this mode.
            </p>
          </div>
        )}

        {authMode === "oidc" && (
          <div className="security-auth-panel">
            <div className="mb-3 row">
              <Label htmlFor="oidc-issuer-url" className="col">Issuer URL</Label>
              <div className="col">
                <Input
                  id="oidc-issuer-url"
                  name="issuerUrl"
                  value={oidcValues.issuerUrl || ""}
                  onChange={handleOidcChange}
                  placeholder="https://auth.example.com/application/o/barracks/"
                  required={authMode === "oidc"}
                />
              </div>
            </div>

            <div className="mb-3 row">
              <Label htmlFor="oidc-client-id" className="col">Client ID</Label>
              <div className="col">
                <Input id="oidc-client-id" name="clientId" value={oidcValues.clientId || ""} onChange={handleOidcChange} required={authMode === "oidc"} />
              </div>
            </div>

            <div className="mb-3 row">
              <Label htmlFor="oidc-client-secret" className="col">Client Secret</Label>
              <div className="col">
                <div className="settings-input-group">
                  <Input
                    id="oidc-client-secret"
                    name="clientSecret"
                    value={oidcValues.clientSecret || ""}
                    onChange={handleOidcChange}
                    type={showOidcSecret ? "text" : "password"}
                    autoComplete="off"
                  />
                  <Button variant="outline" type="button" className={BUTTON_ICON_NATURAL_SIZE} onClick={() => setShowOidcSecret(!showOidcSecret)} aria-label={showOidcSecret ? "Hide client secret" : "Show client secret"}>
                    {showOidcSecret ? <RiEyeFill /> : <RiEyeOffFill />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="mb-3 row">
              <Label htmlFor="oidc-redirect-uri" className="col">Redirect URI</Label>
              <div className="col">
                <Input id="oidc-redirect-uri" name="redirectUri" value={oidcValues.redirectUri || ""} onChange={handleOidcChange} />
              </div>
            </div>
          </div>
        )}

        {authMode === "local" && (
          <div className="security-auth-panel">
            <strong>Local login selected</strong>
            <p>
              Local Silo Barracks accounts are created and managed on the Users page. Add users there, assign them Admin,
              Manager, Viewer, or Disabled roles, and reset passwords without changing the authentication mode here.
            </p>
            <Link className="security-users-link" to="/users">
              Manage local users
            </Link>
          </div>
        )}

        <div className="security-form-actions">
          <Button variant="secondary" type="submit" disabled={saving}>
            {saving ? <Spinner className="tw:size-4" /> : authMode === "oidc" ? "Test & Save" : "Save Authentication"}
          </Button>
        </div>
      </form>
    </div>
  );
}
