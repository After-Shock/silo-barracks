import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Config from "../lib/config";

import "./css/settings/settings.css";
import "./css/settings/security.css";
import "./css/settings/operations.css";
import "./css/settings/connections.css";
import "./css/settings/apiKeys.css";
import "./css/settings/backups.css";
import "./css/settings/version.css";
import { useTranslation } from "react-i18next";
import ErrorBoundary from "./components/general/ErrorBoundary";
import Loading from "./components/general/loading";
import SettingsSearch from "./components/settings/SettingsSearch";
import { RiAppsLine, RiArchiveLine, RiCalendarLine, RiDatabase2Line, RiDeviceLine, RiFileList3Line, RiGalleryLine, RiHeartPulseLine, RiKey2Line, RiMailSettingsLine, RiNotification3Line, RiPlug2Line, RiPulseLine, RiSettings3Line, RiShieldKeyholeLine, RiSignalTowerLine, RiTaskLine, RiToolsLine, RiTv2Line } from "@remixicon/react";

const SettingsConfig = lazy(() => import("./components/settings/settingsConfig"));
const Tasks = lazy(() => import("./components/settings/Tasks"));
const SecuritySettings = lazy(() => import("./components/settings/security"));
const ApiKeys = lazy(() => import("./components/settings/apiKeys"));
const LibrarySelector = lazy(() => import("./library_selector"));
const ActivityMonitorSettings = lazy(() => import("./components/settings/ActivityMonitorSettings"));
const WebhooksSettings = lazy(() => import("./components/settings/webhooks"));
const Integrations = lazy(() => import("./integrations"));
const RepairHub = lazy(() => import("./repair-hub"));
const HealthSettings = lazy(() => import("./components/settings/health"));
import { ImportSourceLabel } from "../lib/import-source-logos";
const JellystatImport = lazy(() => import("./components/settings/JellystatImport"));
const TautulliImport = lazy(() => import("./components/settings/TautulliImport"));
const JellyfinSyncImport = lazy(() => import("./components/settings/JellyfinSyncImport"));
const TraktImport = lazy(() => import("./components/settings/TraktImport"));
const NewsletterSettings = lazy(() => import("./components/settings/NewsletterSettings"));
const NotificationSettings = lazy(() => import("./components/settings/NotificationSettings"));
const JellyfinAdminSettings = lazy(() => import("./components/settings/JellyfinAdminSettings"));
const JellyfinJobSchedules = lazy(() => import("./components/settings/JellyfinJobSchedules"));
const BackupPage = lazy(() => import("./components/settings/backup_page"));
const Logs = lazy(() => import("./components/settings/logs"));
const KioskSettings = lazy(() => import("./components/settings/KioskSettings"));
const SiloServers = lazy(() => import('./components/settings/SiloServers'));
const StatusPageBuilder = lazy(() => import("./components/settings/StatusPageBuilder"));

function tabTitle(Icon, label) {
  return (
    <span className="settings-tab-title">
      <Icon size={16} />
      <span>{label}</span>
    </span>
  );
}

function SettingsPane({ children }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

// Bootstrap `.nav-pills .nav-link` metrics; colours come from the page CSS.
const PILL_TRIGGER_CLASS =
  "tw:h-auto tw:flex-none tw:rounded-[0.375rem] tw:border-0 tw:bg-transparent tw:px-4 tw:py-2 tw:text-[length:inherit] tw:font-[inherit] tw:group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none";

const importTabs = [
  { value: "jellystat", label: <ImportSourceLabel source="jellystat" label="Jellystat" />, Component: JellystatImport },
  { value: "tautulli", label: <ImportSourceLabel source="tautulli" label="Tautulli" />, Component: TautulliImport },
  { value: "jellyfin", label: <ImportSourceLabel source="jellyfin" label="Jellyfin" />, Component: JellyfinSyncImport },
  { value: "trakt", label: <ImportSourceLabel source="trakt" label="Trakt" />, Component: TraktImport },
];

// Panes mount on first visit and then stay mounted (hidden) so an import in progress keeps its state.
function ImportTabs() {
  const [activeImport, setActiveImport] = useState("jellystat");
  const [visitedImports, setVisitedImports] = useState(() => new Set(["jellystat"]));

  function selectImport(value) {
    setActiveImport(value);
    setVisitedImports((current) => (current.has(value) ? current : new Set(current).add(value)));
  }

  return (
    <Tabs value={activeImport} onValueChange={selectImport} className="tw:gap-0">
      <TabsList className="settings-import-tabs tw:group-data-[orientation=horizontal]/tabs:h-auto">
        {importTabs.map(({ value, label }) => (
          <TabsTrigger key={value} value={value} className={PILL_TRIGGER_CLASS}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {importTabs.map(({ value, Component }) =>
        visitedImports.has(value) ? (
          <TabsContent key={value} value={value} forceMount hidden={activeImport !== value} className="settings-import-pane">
            <SettingsPane>
              <Component />
            </SettingsPane>
          </TabsContent>
        ) : null
      )}
    </Tabs>
  );
}

const settingsTabItems = [
  { key: "tabGeneral", Icon: RiSettings3Line, labelKey: "SETTINGS_PAGE.GENERAL", groupKey: "SETTINGS_PAGE.GROUP_CORE" },
  { key: "tabSecurity", Icon: RiShieldKeyholeLine, labelKey: "SETTINGS_PAGE.SECURITY", groupKey: "SETTINGS_PAGE.GROUP_CORE" },
  { key: "tabKiosk", Icon: RiTv2Line, labelKey: "SETTINGS_PAGE.KIOSK", groupKey: "SETTINGS_PAGE.GROUP_CORE" },
  { key: "tabStatusPage", Icon: RiSignalTowerLine, labelKey: "SETTINGS_PAGE.STATUS_PAGE", groupKey: "SETTINGS_PAGE.GROUP_CORE" },
  { key: "tabLibraries", Icon: RiGalleryLine, labelKey: "SETTINGS_PAGE.LIBRARY_SETTINGS", groupKey: "SETTINGS_PAGE.GROUP_MEDIA" },
  { key: "tabActivityMonitor", Icon: RiPulseLine, labelKey: "SETTINGS_PAGE.ACTIVITY_MONITOR", groupKey: "SETTINGS_PAGE.GROUP_MEDIA" },
  { key: "tabJellyfinDevices", Icon: RiDeviceLine, labelKey: "SETTINGS_PAGE.AUTHORISED_DEVICES", groupKey: "SETTINGS_PAGE.GROUP_MEDIA" },
  { key: "tabJellyfinPlugins", Icon: RiAppsLine, labelKey: "SETTINGS_PAGE.PLUGINS", groupKey: "SETTINGS_PAGE.GROUP_MEDIA" },
  { key: "tabJellyfinJobs", Icon: RiCalendarLine, labelKey: "SETTINGS_PAGE.JELLYFIN_JOBS", groupKey: "SETTINGS_PAGE.GROUP_MEDIA" },
  { key: "tabIntegrations", Icon: RiPlug2Line, labelKey: "SETTINGS_PAGE.INTEGRATIONS", groupKey: "SETTINGS_PAGE.GROUP_CONNECTIONS" },
  { key: "tabServers", Icon: RiDeviceLine, label: "Silo Servers", groupKey: "SETTINGS_PAGE.GROUP_CONNECTIONS" },
  { key: "tabKeys", Icon: RiKey2Line, labelKey: "SETTINGS_PAGE.API_KEY", groupKey: "SETTINGS_PAGE.GROUP_CONNECTIONS" },
  { key: "tabWebhooks", Icon: RiNotification3Line, labelKey: "SETTINGS_PAGE.WEBHOOKS", groupKey: "SETTINGS_PAGE.GROUP_CONNECTIONS" },
  { key: "tabNotifications", Icon: RiNotification3Line, labelKey: "SETTINGS_PAGE.NOTIFICATIONS", groupKey: "SETTINGS_PAGE.GROUP_CONNECTIONS" },
  { key: "tabNewsletter", Icon: RiMailSettingsLine, labelKey: "SETTINGS_PAGE.NEWSLETTER", groupKey: "SETTINGS_PAGE.GROUP_CONNECTIONS" },
  { key: "tabTasks", Icon: RiTaskLine, labelKey: "SETTINGS_PAGE.TASKS", groupKey: "SETTINGS_PAGE.GROUP_OPERATIONS" },
  { key: "tabBackup", Icon: RiArchiveLine, labelKey: "SETTINGS_PAGE.BACKUP", groupKey: "SETTINGS_PAGE.GROUP_OPERATIONS" },
  { key: "tabImports", Icon: RiDatabase2Line, labelKey: "SETTINGS_PAGE.IMPORTS", groupKey: "SETTINGS_PAGE.GROUP_OPERATIONS" },
  { key: "tabHealth", Icon: RiHeartPulseLine, labelKey: "SETTINGS_PAGE.HEALTH", groupKey: "SETTINGS_PAGE.GROUP_OPERATIONS" },
  { key: "tabRepair", Icon: RiToolsLine, labelKey: "SETTINGS_PAGE.REPAIR", groupKey: "SETTINGS_PAGE.GROUP_OPERATIONS" },
  { key: "tabLogs", Icon: RiFileList3Line, labelKey: "SETTINGS_PAGE.LOGS", groupKey: "SETTINGS_PAGE.GROUP_OPERATIONS" },
];

const settingsTabs = settingsTabItems.map((item) => item.key);
const settingsTabGroups = settingsTabItems.reduce((groups, item) => {
  const group = groups.find((entry) => entry.groupKey === item.groupKey);
  if (group) {
    group.items.push(item);
  } else {
    groups.push({ groupKey: item.groupKey, items: [item] });
  }
  return groups;
}, []);
const settingsTabItemMap = Object.fromEntries(settingsTabItems.map((item) => [item.key, item]));

function tabTitleFor(key, t) {
  const item = settingsTabItemMap[key] || settingsTabItems[0];
  return tabTitle(item.Icon, t(item.labelKey));
}
const settingsTabHashes = {
  tabGeneral: "general",
  tabSecurity: "security",
  tabActivityMonitor: "activity-monitor",
  tabJellyfinDevices: "devices",
  tabJellyfinPlugins: "plugins",
  tabJellyfinJobs: "jellyfin-jobs",
  tabTasks: "tasks",
  tabKiosk: "kiosk",
  tabStatusPage: "status-page",
  tabLibraries: "libraries",
  tabIntegrations: "integrations",
  tabKeys: "apikeys",
  tabWebhooks: "webhooks",
  tabNotifications: "notifications",
  tabBackup: "backup",
  tabImports: "imports",
  tabNewsletter: "newsletter",
  tabHealth: "health",
  tabRepair: "repair",
  tabLogs: "logs",
};
const settingsTabPaths = {
  tabServers: 'servers',
  tabGeneral: "general",
  tabSecurity: "security",
  tabActivityMonitor: "activity-monitor",
  tabJellyfinDevices: "devices",
  tabJellyfinPlugins: "plugins",
  tabJellyfinJobs: "jellyfin-jobs",
  tabTasks: "tasks",
  tabKiosk: "kiosk",
  tabStatusPage: "status-page",
  tabLibraries: "libraries",
  tabIntegrations: "integrations",
  tabKeys: "api-key",
  tabWebhooks: "webhooks",
  tabNotifications: "notifications",
  tabBackup: "backup",
  tabImports: "imports",
  tabNewsletter: "newsletter",
  tabHealth: "health",
  tabRepair: "repair",
  tabLogs: "logs",
};
const settingsHashAliases = {
  api: "tabKeys",
  apikey: "tabKeys",
  apiKey: "tabKeys",
  apikeys: "tabKeys",
  apiKeys: "tabKeys",
  keys: "tabKeys",
  swagger: "tabKeys",
  swaggerui: "tabKeys",
  "swagger-ui": "tabKeys",
  apidocs: "tabKeys",
  "api-docs": "tabKeys",
  activity: "tabActivityMonitor",
  activitymonitor: "tabActivityMonitor",
  "activity-monitor": "tabActivityMonitor",
  authorizeddevices: "tabJellyfinDevices",
  authoriseddevices: "tabJellyfinDevices",
  "authorized-devices": "tabJellyfinDevices",
  "authorised-devices": "tabJellyfinDevices",
  jellyfindevices: "tabJellyfinDevices",
  "jellyfin-devices": "tabJellyfinDevices",
  jellyfinplugins: "tabJellyfinPlugins",
  "jellyfin-plugins": "tabJellyfinPlugins",
  jellyfinjobs: "tabJellyfinJobs",
  "jellyfin-jobs": "tabJellyfinJobs",
  jobs: "tabJellyfinJobs",
  "scheduled-jobs": "tabJellyfinJobs",
  schedules: "tabJellyfinJobs",
};
const settingsHashToTab = {
  ...Object.fromEntries(Object.entries(settingsTabHashes).map(([key, hash]) => [hash, key])),
  ...Object.fromEntries(Object.entries(settingsTabPaths).map(([key, slug]) => [slug, key])),
  ...settingsHashAliases,
};
const integrationSettingsTabAliases = {
  media: "media-server",
  mediaserver: "media-server",
  "media-server": "media-server",
  jellyfin: "media-server",
  arr: "automation",
  arrapps: "automation",
  "arr-apps": "automation",
  automation: "automation",
  jellyseerr: "seerr",
  overseerr: "seerr",
  seerr: "seerr",
  download: "downloads",
  downloads: "downloads",
  "download-clients": "downloads",
  clients: "downloads",
  invite: "invites",
  invites: "invites",
  "invites-transcodes": "invites",
  transcodes: "invites",
  tdarr: "invites",
};

function normalizeSettingsSlug(value = "") {
  return String(value).replace(/^#\/?/, "").trim().toLowerCase();
}

function normalizeIntegrationSettingsTabSlug(value = "") {
  const normalized = normalizeSettingsSlug(value);
  return integrationSettingsTabAliases[normalized] || "";
}

function getTabFromHash(hash = window.location.hash) {
  return settingsHashToTab[normalizeSettingsSlug(hash)] || "";
}

function getSettingsPathParts(pathname = window.location.pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const settingsIndex = parts.findIndex((part) => part.toLowerCase() === "settings");
  return settingsIndex >= 0 ? parts.slice(settingsIndex + 1) : [];
}

function getTabFromPath(pathname = window.location.pathname) {
  const [tabSlug] = getSettingsPathParts(pathname);
  return settingsHashToTab[normalizeSettingsSlug(tabSlug)] || "";
}

function getSettingsIntegrationPathTab(pathname = window.location.pathname) {
  const [tabSlug, integrationTabSlug] = getSettingsPathParts(pathname);
  const tabName = settingsHashToTab[normalizeSettingsSlug(tabSlug)];
  return tabName === "tabIntegrations" ? normalizeIntegrationSettingsTabSlug(integrationTabSlug) : "";
}

function getSettingsInitialTab(location = window.location) {
  const pathTab = getTabFromPath(location.pathname);
  if (settingsTabs.includes(pathTab)) return pathTab;

  const hashTab = getTabFromHash(location.hash);
  if (settingsTabs.includes(hashTab)) return hashTab;

  const requestedTab = new URLSearchParams(location.search).get("tab");
  if (settingsTabs.includes(requestedTab)) return requestedTab;

  const savedTab = localStorage.getItem(`PREF_SETTINGS_LAST_SELECTED_TAB`) ?? "tabGeneral";
  return settingsTabs.includes(savedTab) ? savedTab : "tabGeneral";
}

function getSettingsPath(tabName, integrationTab = "") {
  const tabSlug = settingsTabPaths[tabName] || settingsTabPaths.tabGeneral;
  const integrationSlug = tabName === "tabIntegrations" ? normalizeIntegrationSettingsTabSlug(integrationTab) : "";
  return integrationSlug ? `/settings/${tabSlug}/${integrationSlug}` : `/settings/${tabSlug}`;
}

function isSettingsHubPath(pathname = "") {
  return String(pathname).replace(/\/+$/, "") === "/settings";
}

function settingsTabAllowed(key, permissions = {}) {
  if (key === "tabKeys") return Boolean(permissions.apiKeys);
  if (key === "tabRepair") return Boolean(permissions.settings || permissions.repair);
  return Boolean(permissions.settings);
}

export default function Settings() {
  const { t } = useTranslation();
  const [isSilo, setIsSilo] = useState(true);
  useEffect(() => { Config.getConfig().then(value => setIsSilo(value.IS_SILO)).catch(() => {}); }, []);
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => getSettingsInitialTab(location));
  const [activeIntegrationTab, setActiveIntegrationTab] = useState(() => getSettingsIntegrationPathTab(location.pathname) || "media-server");
  const [permissions, setPermissions] = useState(null);

  useEffect(() => {
    Config.getConfig()
      .then((cfg) => setPermissions(cfg?.settings?.auth?.permissions || {}))
      .catch(() => setPermissions({}));
  }, []);

  const allowedTabItems = useMemo(
    () => settingsTabItems.filter((item) => settingsTabAllowed(item.key, permissions || {})),
    [permissions]
  );
  const visibleTabGroups = useMemo(
    () =>
      settingsTabGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => settingsTabAllowed(item.key, permissions || {})),
        }))
        .filter((group) => group.items.length),
    [permissions]
  );

  useEffect(() => {
    const nextTab = getSettingsInitialTab(location);
    const nextIntegrationTab = getSettingsIntegrationPathTab(location.pathname) || normalizeIntegrationSettingsTabSlug(location.hash) || "media-server";
    if (settingsTabs.includes(nextTab)) {
      setActiveTab(nextTab);
      localStorage.setItem(`PREF_SETTINGS_LAST_SELECTED_TAB`, nextTab);
    }
    if (nextTab === "tabIntegrations") {
      setActiveIntegrationTab(nextIntegrationTab);
    }
  }, [location]);

  useEffect(() => {
    const pathTab = getTabFromPath(location.pathname);
    if (settingsTabs.includes(pathTab)) return;

    const hashTab = getTabFromHash(location.hash);
    if (settingsTabs.includes(hashTab)) {
      const hashIntegrationTab = hashTab === "tabIntegrations" ? normalizeIntegrationSettingsTabSlug(location.hash) || activeIntegrationTab : "";
      navigate(getSettingsPath(hashTab, hashIntegrationTab), { replace: true });
      return;
    }

    if (isSettingsHubPath(location.pathname)) {
      const requestedTab = new URLSearchParams(location.search).get("tab");
      if (settingsTabs.includes(requestedTab)) {
        navigate(getSettingsPath(requestedTab), { replace: true });
        return;
      }
      if (!location.hash) {
        navigate(getSettingsPath(activeTab, activeIntegrationTab), { replace: true });
      }
    }
  }, [activeIntegrationTab, activeTab, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!permissions) return;
    if (!allowedTabItems.length) {
      navigate("/me", { replace: true });
      return;
    }
    if (!allowedTabItems.some((item) => item.key === activeTab)) {
      const nextTab = allowedTabItems[0].key;
      setActiveTab(nextTab);
      localStorage.setItem(`PREF_SETTINGS_LAST_SELECTED_TAB`, nextTab);
      navigate(getSettingsPath(nextTab, activeIntegrationTab), { replace: true });
    }
  }, [activeIntegrationTab, activeTab, allowedTabItems, navigate, permissions]);

  function setTab(tabName, updateMode = "push") {
    if (!allowedTabItems.some((item) => item.key === tabName)) {
      tabName = allowedTabItems[0]?.key || "tabGeneral";
    }
    setActiveTab(tabName);
    localStorage.setItem(`PREF_SETTINGS_LAST_SELECTED_TAB`, tabName);
    navigate(getSettingsPath(tabName, activeIntegrationTab), { replace: updateMode === "replace" });
  }

  const searchTabKeys = useMemo(() => allowedTabItems.map((item) => item.key), [allowedTabItems]);
  const searchTabLabels = useMemo(() => Object.fromEntries(settingsTabItems.map((item) => [item.key, item.labelKey ? t(item.labelKey) : item.label])), [t]);

  function openFromSearch(tabName, integrationTab) {
    if (tabName === "tabIntegrations" && integrationTab) {
      setActiveTab("tabIntegrations");
      localStorage.setItem(`PREF_SETTINGS_LAST_SELECTED_TAB`, "tabIntegrations");
      setIntegrationTab(integrationTab);
      return;
    }
    setTab(tabName);
  }

  function setIntegrationTab(tabName) {
    const nextTab = normalizeIntegrationSettingsTabSlug(tabName) || "media-server";
    setActiveIntegrationTab(nextTab);
    navigate(getSettingsPath("tabIntegrations", nextTab));
  }

  function renderActiveSettingsPane() {
    switch (activeTab) {
      case 'tabServers':
        return <SettingsPane><SiloServers /></SettingsPane>;
      case "tabSecurity":
        return (
          <SettingsPane>
            <SecuritySettings />
          </SettingsPane>
        );
      case "tabKiosk":
        return (
          <SettingsPane>
            <KioskSettings />
          </SettingsPane>
        );
      case "tabStatusPage":
        return (
          <SettingsPane>
            <StatusPageBuilder />
          </SettingsPane>
        );
      case "tabLibraries":
        return (
          <SettingsPane>
            <LibrarySelector />
          </SettingsPane>
        );
      case "tabActivityMonitor":
        return (
          <SettingsPane>
            <ActivityMonitorSettings />
          </SettingsPane>
        );
      case "tabJellyfinDevices":
        if (isSilo) return <p>Device management is not supported by Silo Barracks.</p>;
        return (
          <SettingsPane>
            <JellyfinAdminSettings view="devices" />
          </SettingsPane>
        );
      case "tabJellyfinPlugins":
        if (isSilo) return <p>Jellyfin plugins are not supported by Silo Barracks.</p>;
        return (
          <SettingsPane>
            <JellyfinAdminSettings view="plugins" />
          </SettingsPane>
        );
      case "tabJellyfinJobs":
        return (
          <SettingsPane>
            <JellyfinJobSchedules />
          </SettingsPane>
        );
      case "tabIntegrations":
        return (
          <SettingsPane>
            <Integrations embedded activeTab={activeIntegrationTab} onTabChange={setIntegrationTab} />
          </SettingsPane>
        );
      case "tabKeys":
        return (
          <SettingsPane>
            <ApiKeys />
          </SettingsPane>
        );
      case "tabWebhooks":
        return (
          <SettingsPane>
            <WebhooksSettings />
          </SettingsPane>
        );
      case "tabNotifications":
        return (
          <SettingsPane>
            <NotificationSettings />
          </SettingsPane>
        );
      case "tabNewsletter":
        return (
          <SettingsPane>
            <NewsletterSettings />
          </SettingsPane>
        );
      case "tabTasks":
        return (
          <SettingsPane>
            <Tasks />
          </SettingsPane>
        );
      case "tabBackup":
        return (
          <SettingsPane>
            <BackupPage />
          </SettingsPane>
        );
      case "tabImports":
        return <ImportTabs />;
      case "tabHealth":
        return (
          <SettingsPane>
            <HealthSettings />
          </SettingsPane>
        );
      case "tabRepair":
        return (
          <SettingsPane>
            <RepairHub embedded />
          </SettingsPane>
        );
      case "tabLogs":
        return (
          <SettingsPane>
            <Logs />
          </SettingsPane>
        );
      case "tabGeneral":
      default:
        return (
          <SettingsPane>
            <SettingsConfig />
          </SettingsPane>
        );
    }
  }

  if (!permissions) {
    return <Loading />;
  }

  return (
    <div
      className="settings has-mobile-settings-menu"
      data-theme-screen="settings"
      data-theme-active-tab={settingsTabPaths[activeTab] || "general"}
      data-theme-active-integration-tab={activeTab === "tabIntegrations" ? activeIntegrationTab : undefined}
    >
      <div className="settings-mobile-menu">
        <SettingsSearch allowedTabs={searchTabKeys} tabLabels={searchTabLabels} onOpen={openFromSearch} />
        <div className="settings-mobile-menu-list" role="tablist" aria-label="Settings sections">
          {allowedTabItems.filter(({ key }) => isSilo ? !['tabJellyfinDevices', 'tabJellyfinPlugins'].includes(key) : key !== 'tabServers').map(({ key, Icon, labelKey, label }) => (
            <button
              key={key}
              type="button"
              className={activeTab === key ? "is-active" : ""}
              onClick={() => setTab(key)}
              role="tab"
              aria-selected={activeTab === key}
            >
              {tabTitle(Icon, labelKey ? t(labelKey) : label)}
            </button>
          ))}
        </div>
      </div>

      <nav className="nav nav-pills settings-sidebar-nav" role="tablist" aria-label="Settings sections">
        <SettingsSearch allowedTabs={searchTabKeys} tabLabels={searchTabLabels} onOpen={openFromSearch} />
        {visibleTabGroups.map((group) => (
          <div className="settings-sidebar-group" key={group.groupKey}>
            <span className="settings-sidebar-category">{t(group.groupKey)}</span>
            {group.items.filter(({ key }) => isSilo ? !['tabJellyfinDevices', 'tabJellyfinPlugins'].includes(key) : key !== 'tabServers').map(({ key }) => (
              <button
                key={key}
                type="button"
                className={`nav-link ${activeTab === key ? "active" : ""}`.trim()}
                onClick={() => setTab(key)}
                role="tab"
                aria-selected={activeTab === key}
              >
                {tabTitleFor(key, t)}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="tab-content">
        <div className={`settings-tab-pane bg-transparent tab-pane active show${activeTab === "tabIntegrations" ? " integrations-settings-tab" : ""}`.trim()}>
          {renderActiveSettingsPane()}
        </div>
      </div>
    </div>
  );
}
