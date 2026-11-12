import { useEffect, useMemo, useState } from "react";
import axios from "../../../lib/axios_instance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import DismissibleAlert from "./dismissible-alert";
import { RiAddLine, RiClipboardLine, RiDeleteBinLine, RiKey2Line } from "@remixicon/react";
import { useTranslation } from "react-i18next";

import "../../css/settings/apiKeys.css";
import ApiKeyWidgets from "./apiKeyWidgets";

const token = localStorage.getItem("token");

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function maskKey(key = "") {
  if (key.length <= 12) {
    return key;
  }

  return `${key.slice(0, 8)} ... ${key.slice(-6)}`;
}

function formatLastUsed(value, neverLabel) {
  if (!value) return neverLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return neverLabel;
  return date.toLocaleString();
}

export default function ApiKeys() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("widgets");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const sortedKeys = useMemo(() => [...keys].sort((a, b) => a.name.localeCompare(b.name)), [keys]);

  async function fetchKeys() {
    try {
      const response = await axios.get("/api/keys", { headers: authHeaders() });
      setKeys(response.data || []);
    } catch (error) {
      setMessage({ variant: "danger", text: error.response?.data?.error || t("SETTINGS_PAGE.API_KEY_LOAD_ERROR") });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchKeys();
  }, []);

  async function addKey(event) {
    event.preventDefault();
    if (!name.trim()) {
      setMessage({ variant: "danger", text: t("SETTINGS_PAGE.API_KEY_NAME_REQUIRED") });
      return;
    }

    try {
      setSaving(true);
      const response = await axios.post("/api/keys", { name: name.trim(), scope }, { headers: authHeaders() });
      setKeys(response.data || []);
      setName("");
      setMessage({ variant: "success", text: t("SETTINGS_PAGE.API_KEY_CREATED") });
    } catch (error) {
      setMessage({ variant: "danger", text: error.response?.data?.error || t("SETTINGS_PAGE.API_KEY_CREATE_ERROR") });
    } finally {
      setSaving(false);
    }
  }

  async function changeScope(keyValue, nextScope) {
    try {
      const response = await axios.patch("/api/keys", { key: keyValue, scope: nextScope }, { headers: authHeaders() });
      setKeys(response.data || []);
      setMessage({ variant: "success", text: t("SETTINGS_PAGE.API_KEY_SCOPE_SAVED") });
    } catch (error) {
      setMessage({ variant: "danger", text: error.response?.data?.error || t("SETTINGS_PAGE.API_KEY_SCOPE_ERROR") });
    }
  }

  async function deleteKey(keyValue) {
    try {
      await axios.delete("/api/keys", {
        headers: authHeaders(),
        data: { key: keyValue },
      });
      setKeys((currentKeys) => currentKeys.filter((key) => key.key !== keyValue));
      setMessage({ variant: "success", text: t("SETTINGS_PAGE.API_KEY_DELETED") });
    } catch (error) {
      setMessage({ variant: "danger", text: error.response?.data?.error || t("SETTINGS_PAGE.API_KEY_DELETE_ERROR") });
    }
  }

  async function copyKey(keyValue) {
    try {
      await navigator.clipboard.writeText(keyValue);
      setMessage({ variant: "success", text: t("SETTINGS_PAGE.API_KEY_COPIED") });
    } catch {
      setMessage({ variant: "danger", text: t("SETTINGS_PAGE.API_KEY_COPY_ERROR") });
    }
  }

  if (loading) {
    return (
      <div className="api-keys-page">
        <Spinner className="tw:size-10" />
      </div>
    );
  }

  return (
    <div className="api-keys-page">
      <div className="api-keys-header">
        <div>
          <p className="api-keys-eyebrow">Access tokens</p>
          <h1>{t("SETTINGS_PAGE.API_KEYS")}</h1>
          <p>{t("SETTINGS_PAGE.API_KEY_INTRO")}</p>
        </div>
        <div className="api-keys-count">
          <RiKey2Line size={22} />
          <span>{keys.length}</span>
        </div>
      </div>

      {message && (
        <DismissibleAlert type={message.variant} onClose={() => setMessage(null)}>
          {message.text}
        </DismissibleAlert>
      )}

      <form className="api-key-create" onSubmit={addKey}>
        <div>
          <Label htmlFor="api-key-name">{t("SETTINGS_PAGE.API_KEY_NAME")}</Label>
          <Input id="api-key-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("SETTINGS_PAGE.API_KEY_NAME_PLACEHOLDER")} />
        </div>
        <div>
          <Label>{t("SETTINGS_PAGE.API_KEY_SCOPE")}</Label>
          <NativeSelect value={scope} onChange={(event) => setScope(event.target.value)}>
            <NativeSelectOption value="widgets">{t("SETTINGS_PAGE.API_KEY_SCOPE_WIDGETS")}</NativeSelectOption>
            <NativeSelectOption value="widgets-write">{t("SETTINGS_PAGE.API_KEY_SCOPE_WRITE")}</NativeSelectOption>
            <NativeSelectOption value="full">{t("SETTINGS_PAGE.API_KEY_SCOPE_FULL")}</NativeSelectOption>
          </NativeSelect>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner className="tw:size-4" /> : <RiAddLine size={18} />}
          {t("SETTINGS_PAGE.API_KEY_ADD")}
        </Button>
      </form>
      <p className="api-key-scope-help">{t("SETTINGS_PAGE.API_KEY_SCOPE_HELP")}</p>

      {sortedKeys.length ? (
        <div className="api-key-list">
          {sortedKeys.map((apiKey) => (
            <article className="api-key-card" key={apiKey.key}>
              <div className="api-key-icon">
                <RiKey2Line size={20} />
              </div>
              <div className="api-key-main">
                <strong>{apiKey.name}</strong>
                <code>{maskKey(apiKey.key)}</code>
                <span className="api-key-meta">
                  {t("SETTINGS_PAGE.API_KEY_LAST_USED")}: {formatLastUsed(apiKey.lastUsed, t("SETTINGS_PAGE.API_KEY_NEVER_USED"))}
                </span>
              </div>
              <div className="api-key-actions">
                <NativeSelect
                  className="api-key-scope-select"
                  value={apiKey.scope === "widgets" || apiKey.scope === "widgets-write" ? apiKey.scope : "full"}
                  onChange={(event) => changeScope(apiKey.key, event.target.value)}
                  aria-label={t("SETTINGS_PAGE.API_KEY_SCOPE")}
                >
                  <NativeSelectOption value="widgets">{t("SETTINGS_PAGE.API_KEY_SCOPE_WIDGETS")}</NativeSelectOption>
                  <NativeSelectOption value="widgets-write">{t("SETTINGS_PAGE.API_KEY_SCOPE_WRITE")}</NativeSelectOption>
                  <NativeSelectOption value="full">{t("SETTINGS_PAGE.API_KEY_SCOPE_FULL")}</NativeSelectOption>
                </NativeSelect>
                <Button variant="outline" onClick={() => copyKey(apiKey.key)} title={t("SETTINGS_PAGE.API_KEY_COPY")}>
                  <RiClipboardLine size={17} />
                </Button>
                <Button variant="destructive" onClick={() => deleteKey(apiKey.key)} title={t("SETTINGS_PAGE.API_KEY_DELETE")}>
                  <RiDeleteBinLine size={17} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="api-keys-empty">
          <RiKey2Line size={32} />
          <strong>{t("SETTINGS_PAGE.API_KEY_EMPTY")}</strong>
          <p>{t("SETTINGS_PAGE.API_KEY_EMPTY_HINT")}</p>
        </div>
      )}

      <ApiKeyWidgets keys={sortedKeys} onMessage={setMessage} />
    </div>
  );
}
