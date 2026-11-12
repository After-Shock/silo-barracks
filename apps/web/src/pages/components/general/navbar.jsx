import { useEffect, useMemo, useState, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "../../../lib/axios_instance";
import { navData } from "../../../lib/navdata";
import { RiAccountCircleLine, RiArrowLeftSLine, RiArrowRightSLine, RiLogoutBoxLine, RiMagicLine, RiMenuLine, RiShieldUserFill, RiUserStarFill } from "@remixicon/react";
import ErrorWarningLineIcon from "remixicon-react/ErrorWarningLineIcon";
import SearchLineIcon from "remixicon-react/SearchLineIcon";
import Apps2LineIcon from "remixicon-react/Apps2LineIcon";
import logo_dark from "../../../../public/brand/barracks-mark.svg";
import "../../css/navbar.css";
import VersionCard from "./version-card";
import { NAV_AVAILABILITY_EVENT, OPEN_WHATS_NEW_EVENT } from "../../../lib/events";
import { Trans, useTranslation } from "react-i18next";
import baseUrl from "../../../lib/baseurl";
import { toSafeHttpUrl } from "../../../lib/safe-url";
import socket from "../../../socket";
import { slugifyUserName } from "../../../lib/userProfile";
import Config from "../../../lib/config";
import { FONT_WEIGHT_OPTIONS, getStoredFontWeight, saveFontWeightPreference } from "../../../lib/appearance";
import { DEFAULT_THEME, THEME_GROUPS, filterThemePresets, findMatchingThemePreset, getStoredTheme, resetTheme, saveTheme, themeColorFields } from "../../../lib/theme";
import { applyNavOrder, getStoredHiddenNavLinks, getStoredNavOrder, LOCKED_NAV_LINKS } from "../../../lib/nav-order";
import { AUTOMATION_HEALTH_NAV_AVAILABLE_KEY, showServerNav, WIZARR_NAV_AVAILABLE_KEY } from "../../../lib/hub-tabs";
import useFleet from "../../../lib/use-fleet";
import { applyPwaStartUrl, pwaStartPath } from "../../../lib/pwa-manifest";
import InstallAppButton from "./InstallAppButton";
import {
  getStoredWorkspaceMode,
  saveWorkspaceMode,
  USER_WORKSPACE_NAV_LINKS,
  WORKSPACE_MODE_UPDATED_EVENT,
  workspaceHomePath,
} from "../../../lib/workspace-mode";
import { isEmby, mediaServerName } from "../../../lib/media-server";

function getTokenPayload() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    return JSON.parse(window.atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function getCachedConfig() {
  try {
    const config = JSON.parse(localStorage.getItem("config") || "{}");
    // Merge jellyfinUser from the JWT token so the avatar is always available
    const tokenUser = getTokenPayload()?.user;
    if (tokenUser?.jellyfinUser && !config.settings?.auth?.jellyfinUser) {
      config.settings = config.settings || {};
      config.settings.auth = config.settings.auth || {};
      config.settings.auth.jellyfinUser = tokenUser.jellyfinUser;
    }
    return config;
  } catch {
    return {};
  }
}

const REQUEST_NAV_AVAILABLE_KEY = "silo_barracks_request_nav_available";
const DOWNLOAD_NAV_AVAILABLE_KEY = "silo_barracks_download_nav_available";
const TDARR_NAV_AVAILABLE_KEY = "silo_barracks_tdarr_nav_available";
const MAINTAINERR_NAV_AVAILABLE_KEY = "silo_barracks_maintainerr_nav_available";
const CALENDAR_NAV_AVAILABLE_KEY = "silo_barracks_calendar_nav_available";
const NAV_COLLAPSED_KEY = "silo_barracks_nav_collapsed";
const INTEGRATIONS_CACHE_TTL_MS = 10000;

let integrationsCache = null;
let integrationsCacheAt = 0;
let integrationsRequest = null;

async function loadNavbarIntegrations() {
  const now = Date.now();
  if (integrationsCache && now - integrationsCacheAt < INTEGRATIONS_CACHE_TTL_MS) {
    return integrationsCache;
  }

  if (!integrationsRequest) {
    integrationsRequest = axios
      .get("/api/integrations", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
      .then((response) => {
        integrationsCache = response.data || { arrApps: [], clients: [], thirdParty: [] };
        integrationsCacheAt = Date.now();
        return integrationsCache;
      })
      .finally(() => {
        integrationsRequest = null;
      });
  }

  return integrationsRequest;
}

function clearNavbarIntegrationsCache() {
  integrationsCache = null;
  integrationsCacheAt = 0;
}

function getCachedRequestNavAvailable() {
  return localStorage.getItem(REQUEST_NAV_AVAILABLE_KEY) === "true";
}

function getCachedDownloadNavAvailable() {
  return localStorage.getItem(DOWNLOAD_NAV_AVAILABLE_KEY) === "true";
}

function getCachedWizarrNavAvailable() {
  return localStorage.getItem(WIZARR_NAV_AVAILABLE_KEY) === "true";
}

function getCachedTdarrNavAvailable() {
  return localStorage.getItem(TDARR_NAV_AVAILABLE_KEY) === "true";
}

function getCachedMaintainerrNavAvailable() {
  return localStorage.getItem(MAINTAINERR_NAV_AVAILABLE_KEY) === "true";
}

function getCachedAutomationHealthNavAvailable() {
  return localStorage.getItem(AUTOMATION_HEALTH_NAV_AVAILABLE_KEY) === "true";
}

function getCachedNavCollapsed() {
  return localStorage.getItem(NAV_COLLAPSED_KEY) === "true";
}

function getCachedCalendarNavAvailable() {
  return localStorage.getItem(CALENDAR_NAV_AVAILABLE_KEY) === "true";
}

function isConfiguredCalendarApp(app) {
  const name = String(app?.name || app?.slug || "").toLowerCase();
  const values = app?.values || {};
  return (
    (name.includes("sonarr") || name.includes("radarr") || name.includes("lidarr") || name.includes("readarr")) &&
    Boolean(app?.connected) &&
    Boolean(String(values.url || "").trim()) &&
    Boolean(String(values.secret || "").trim())
  );
}

function getCalendarAvailabilityFromIntegrations(integrations) {
  return Array.isArray(integrations?.arrApps) && integrations.arrApps.some(isConfiguredCalendarApp);
}

function isConfiguredSeerrApp(app) {
  const name = String(app?.name || app?.slug || "").toLowerCase();
  const values = app?.values || {};
  return (
    (name === "seerr" || name.includes("jellyseerr") || name.includes("overseerr")) &&
    Boolean(app?.connected) &&
    Boolean(String(values.url || "").trim()) &&
    Boolean(String(values.secret || "").trim())
  );
}

function getRequestAvailabilityFromIntegrations(integrations) {
  return Array.isArray(integrations?.arrApps) && integrations.arrApps.some(isConfiguredSeerrApp);
}

function isConfiguredDownloadClient(client) {
  const values = client?.values || {};
  return (
    Boolean(client?.connected) &&
    (client?.protocol === "Torrent" || client?.protocol === "Usenet") &&
    Boolean(String(values.url || "").trim()) &&
    Boolean(String(values.secret || "").trim())
  );
}

function getDownloadAvailabilityFromIntegrations(integrations) {
  return Array.isArray(integrations?.clients) && integrations.clients.some(isConfiguredDownloadClient);
}

function isConfiguredWizarrApp(app) {
  const name = String(app?.name || app?.slug || "").toLowerCase();
  const values = app?.values || {};
  return name.includes("wizarr") && Boolean(app?.connected) && Boolean(String(values.url || "").trim()) && Boolean(String(values.secret || "").trim());
}

function getWizarrAvailabilityFromIntegrations(integrations) {
  return Array.isArray(integrations?.thirdParty) && integrations.thirdParty.some(isConfiguredWizarrApp);
}

function isConfiguredTdarrApp(app) {
  const name = String(app?.name || app?.slug || "").toLowerCase();
  const values = app?.values || {};
  return name.includes("tdarr") && Boolean(app?.connected) && Boolean(String(values.url || "").trim());
}

function getTdarrAvailabilityFromIntegrations(integrations) {
  return Array.isArray(integrations?.thirdParty) && integrations.thirdParty.some(isConfiguredTdarrApp);
}

function isConfiguredMaintainerrApp(app) {
  const name = String(app?.name || app?.slug || "").toLowerCase();
  const values = app?.values || {};
  return name.includes("maintainerr") && Boolean(app?.connected) && Boolean(String(values.url || "").trim());
}

function getMaintainerrAvailabilityFromIntegrations(integrations) {
  return Array.isArray(integrations?.thirdParty) && integrations.thirdParty.some(isConfiguredMaintainerrApp);
}

function getAudiobookshelfAvailabilityFromIntegrations(integrations) {
  return (
    Array.isArray(integrations?.thirdParty) &&
    integrations.thirdParty.some(
      (app) => String(app?.name || app?.slug || "").toLowerCase().includes("audiobookshelf") && Boolean(app?.connected) && Boolean(String(app?.values?.url || "").trim())
    )
  );
}

function isConfiguredAutomationHealthApp(app) {
  const name = String(app?.name || app?.slug || "").toLowerCase();
  const values = app?.values || {};
  return (name.includes("bazarr") || name.includes("prowlarr")) && Boolean(app?.connected) && Boolean(String(values.url || "").trim()) && Boolean(String(values.secret || "").trim());
}

function getAutomationHealthAvailabilityFromIntegrations(integrations) {
  return Array.isArray(integrations?.arrApps) && integrations.arrApps.some(isConfiguredAutomationHealthApp);
}

function applyNavbarIntegrations(integrations, setters) {
  const calendar = getCalendarAvailabilityFromIntegrations(integrations);
  const downloads = getDownloadAvailabilityFromIntegrations(integrations);
  const requests = getRequestAvailabilityFromIntegrations(integrations);
  const wizarr = getWizarrAvailabilityFromIntegrations(integrations);
  const tdarr = getTdarrAvailabilityFromIntegrations(integrations);
  const maintainerr = getMaintainerrAvailabilityFromIntegrations(integrations);
  const automation = getAutomationHealthAvailabilityFromIntegrations(integrations);
  localStorage.setItem(CALENDAR_NAV_AVAILABLE_KEY, String(calendar));
  localStorage.setItem(DOWNLOAD_NAV_AVAILABLE_KEY, String(downloads));
  localStorage.setItem(REQUEST_NAV_AVAILABLE_KEY, String(requests));
  localStorage.setItem(WIZARR_NAV_AVAILABLE_KEY, String(wizarr));
  localStorage.setItem(TDARR_NAV_AVAILABLE_KEY, String(tdarr));
  localStorage.setItem(MAINTAINERR_NAV_AVAILABLE_KEY, String(maintainerr));
  localStorage.setItem("jellyglance_audiobookshelf_nav_available", String(getAudiobookshelfAvailabilityFromIntegrations(integrations)));
  localStorage.setItem(AUTOMATION_HEALTH_NAV_AVAILABLE_KEY, String(automation));
  setters.setShowCalendarNav(calendar);
  setters.setShowDownloadsNav(downloads);
  setters.setShowRequestsNav(requests);
  setters.setShowWizarrNav(wizarr);
  setters.setShowTdarrNav(tdarr);
  setters.setShowMaintainerrNav(maintainerr);
  setters.setShowAutomationHealthNav(automation);
  if (!downloads) setters.setActiveDownloadCount(0);
  if (!tdarr) setters.setActiveTranscodeCount(0);
  if (!requests) setters.setRequestBadgeCount(0);
  return { tdarr, requests };
}

const OPS_TAB_LINKS = ["", "activity", "libraries", "statistics"];
const USER_TAB_LINKS = ["me", "recently-added", "libraries", "statistics"];
const DETAIL_ROUTE = /^\/(users|libraries)\/[^/]+|^\/libraries\/item\/[^/]+/;

// Four primary destinations for the bottom tab bar, backfilled from the user's nav order when one is hidden.
export function pickTabItems(items, myGlanceFirst) {
  const tabs = (myGlanceFirst ? USER_TAB_LINKS : OPS_TAB_LINKS).map((link) => items.find((item) => item.link === link)).filter(Boolean);
  for (const item of items) {
    if (tabs.length >= 4) break;
    if (!tabs.includes(item)) tabs.push(item);
  }
  return tabs.slice(0, 4);
}

function navItemTo(item) {
  const link = String(item?.link || "");
  if (!link) return "/";
  return link.startsWith("/") ? link : `/${link}`;
}

function isNavItemActive(item, location) {
  const pathname = location.pathname.toLocaleLowerCase();
  const navPath = String(item.link || "").split("?")[0].toLocaleLowerCase();

  if (item.link === "settings") {
    return pathname === "/settings" || pathname.startsWith("/settings/");
  }

  return (
    pathname.includes(("/" + navPath).toLocaleLowerCase()) &&
    ((pathname.length > 0 && navPath.length > 0) || (pathname.length === 1 && navPath.length === 0))
  );
}

// All navbar state, data loading, and handlers. Kept as one hook so upstream
// logic changes to the navbar still apply here; the markup below
// is Barracks-owned.
function useNavbarState() {
  const [showAccount, setShowAccount] = useState(false);
  const [config, setConfig] = useState(() => getCachedConfig());
  const [customAvatar, setCustomAvatar] = useState(() => localStorage.getItem("silo_barracks_account_avatar") || "");
  const [customTheme, setCustomTheme] = useState(() => getStoredTheme());
  const [themeDraft, setThemeDraft] = useState(() => getStoredTheme());
  const [fontWeightPreference, setFontWeightPreference] = useState(() => getStoredFontWeight());
  const [activeStreamCount, setActiveStreamCount] = useState(0);
  const { snapshot: fleetSnapshot } = useFleet(config?.IS_SILO === true);
  const [activeDownloadCount, setActiveDownloadCount] = useState(() => Number(localStorage.getItem("silo_barracks_active_download_count") || 0));
  const [activeTranscodeCount, setActiveTranscodeCount] = useState(() => Number(localStorage.getItem("silo_barracks_active_transcode_count") || 0));
  const [requestBadgeCount, setRequestBadgeCount] = useState(() => Number(localStorage.getItem("silo_barracks_request_badge_count") || 0));
  const [showRequestsNav, setShowRequestsNav] = useState(() => getCachedRequestNavAvailable());
  const [showDownloadsNav, setShowDownloadsNav] = useState(() => getCachedDownloadNavAvailable());
  const [showCalendarNav, setShowCalendarNav] = useState(() => getCachedCalendarNavAvailable());
  const [showWizarrNav, setShowWizarrNav] = useState(() => getCachedWizarrNavAvailable());
  const [showTdarrNav, setShowTdarrNav] = useState(() => getCachedTdarrNavAvailable());
  const [showMaintainerrNav, setShowMaintainerrNav] = useState(() => getCachedMaintainerrNavAvailable());
  const [showAutomationHealthNav, setShowAutomationHealthNav] = useState(() => getCachedAutomationHealthNavAvailable());
  const [navOrder, setNavOrder] = useState(() => getStoredNavOrder(navData));
  const [hiddenNavLinks, setHiddenNavLinks] = useState(() => getStoredHiddenNavLinks(navData));
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [themeQuery, setThemeQuery] = useState("");
  const [themeGroup, setThemeGroup] = useState("all");
  const [isNavCollapsed, setIsNavCollapsed] = useState(() => getCachedNavCollapsed());
  const [workspaceMode, setWorkspaceMode] = useState(() => getStoredWorkspaceMode(true));
  const [jellyfinStatus, setJellyfinStatus] = useState(null);
  const authMode = config?.settings?.auth?.mode || (config?.requireLogin === false ? "quick-connect" : "local");
  const authLabel =
    config?.settings?.auth?.label ||
    (authMode === "quick-connect" ? (isEmby() ? "Emby login" : "Jellyfin Quick Connect") : authMode === "oidc" ? "OIDC / Authentik" : "Local login");
  const jellyfinUser = config?.settings?.auth?.jellyfinUser;
  const canUploadAvatar = authMode === "local" || authMode === "oidc";
  const accountName = jellyfinUser?.name || config?.username || authLabel;
  const currentRole = config?.settings?.auth?.role || "Viewer";
  const isJellyfinAdmin = currentRole === "Owner" || currentRole === "Admin";
  const accountRole = authMode === "quick-connect" ? (isJellyfinAdmin ? `${mediaServerName()} Admin` : `${mediaServerName()} User`) : authMode === "oidc" ? "OIDC User" : "Local User";
  const showServerManagementNav = isJellyfinAdmin;
  const permissions = config?.settings?.auth?.permissions || {};
  const canOpenHome = permissions.home !== false;
  const canOpenSettings = Boolean(permissions.settings || permissions.apiKeys || permissions.repair);
  const effectiveWorkspaceMode = isJellyfinAdmin ? workspaceMode : "user";
  const homePath = workspaceHomePath(isJellyfinAdmin, effectiveWorkspaceMode, permissions);
  const jellyfinUserId = jellyfinUser?.id || jellyfinUser?.Id || jellyfinUser?.userId || jellyfinUser?.UserId;
  const jellyfinImageTag = jellyfinUser?.primaryImageTag || jellyfinUser?.PrimaryImageTag || jellyfinUser?.imageTags?.Primary || jellyfinUser?.ImageTags?.Primary;
  const jellyfinAvatar = jellyfinUserId
    ? `${baseUrl}/proxy/Users/Images/Primary/?id=${encodeURIComponent(jellyfinUserId)}${jellyfinImageTag ? `&tag=${encodeURIComponent(jellyfinImageTag)}` : ""}&fillWidth=160&quality=80`
    : "";
  const avatarSrc = toSafeHttpUrl(jellyfinAvatar || (canUploadAvatar ? customAvatar : ""), { allowDataImage: true });
  const activeThemePreset = findMatchingThemePreset(themeDraft);
  const hasThemeDraftChanges = JSON.stringify(themeColorFields(themeDraft)) !== JSON.stringify(themeColorFields(customTheme));
  const visibleThemePresets = useMemo(() => filterThemePresets(themeQuery, themeGroup), [themeQuery, themeGroup]);
  const visibleNavData = useMemo(
    () =>
      applyNavOrder(
        navData.filter((item) => {
          if (!LOCKED_NAV_LINKS.has(item.link) && hiddenNavLinks.includes(item.link)) return false;
          if (isJellyfinAdmin && workspaceMode === "user" && !USER_WORKSPACE_NAV_LINKS.has(item.link)) return false;
          if (item.link === "") return canOpenHome;
          if (item.link === "settings") return canOpenSettings;
          if (item.link === "users") return Boolean(permissions.users) || showWizarrNav;
          if (item.link === "me") return permissions.myGlance !== false;
          if (item.link === "requests") return showRequestsNav && permissions.requests !== false;
          if (item.link === "downloads") return showDownloadsNav && Boolean(permissions.downloads || permissions.settings);
          if (item.link === "calendar") return showCalendarNav;
          if (item.link === "active-transcodes") return showTdarrNav;
          if (item.link === "server-management") return showServerNav({ isAdmin: isJellyfinAdmin, isSilo: config?.IS_SILO === true, automation: showAutomationHealthNav });
          return true;
        }),
        navOrder,
        { myGlanceFirst: !canOpenHome || (isJellyfinAdmin && workspaceMode === "user") }
      ),
    [canOpenHome, canOpenSettings, config?.IS_SILO, hiddenNavLinks, isJellyfinAdmin, navOrder, permissions.downloads, permissions.myGlance, permissions.requests, permissions.settings, permissions.users, showAutomationHealthNav, showCalendarNav, showDownloadsNav, showMaintainerrNav, showRequestsNav, showServerManagementNav, showTdarrNav, showWizarrNav, workspaceMode]
  );

  const handleLogout = () => {
    localStorage.setItem("silo_barracks_logged_out", "true");
    localStorage.removeItem("token");
    localStorage.removeItem("config");
    deleteLibraryTabKeys();
    window.location.reload();
  };

  const deleteLibraryTabKeys = () => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("PREF_"))
      .forEach((key) => localStorage.removeItem(key));
  };

  const location = useLocation();
  const navigate = useNavigate();

  const closeMobileNav = () => {
    setIsMobileNavOpen(false);
    document.getElementById("mobile-tab-more")?.focus();
  };

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileNavOpen) return undefined;
    document.querySelector("#mobile-app-navigation a, #mobile-app-navigation button")?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      setIsMobileNavOpen(false);
      document.getElementById("mobile-tab-more")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobileNavOpen]);

  useEffect(() => {
    function handleWorkspaceModeUpdated(event) {
      const next = event.detail === "user" ? "user" : "admin";
      setWorkspaceMode(next);
    }
    window.addEventListener(WORKSPACE_MODE_UPDATED_EVENT, handleWorkspaceModeUpdated);
    return () => window.removeEventListener(WORKSPACE_MODE_UPDATED_EVENT, handleWorkspaceModeUpdated);
  }, []);

  useEffect(() => {
    function handleThemeUpdated() {
      // The silo-barracks-theme-updated event carries resolved tokens, so re-read the stored theme.
      setCustomTheme(getStoredTheme());
    }
    window.addEventListener("silo-barracks-theme-updated", handleThemeUpdated);
    return () => window.removeEventListener("silo-barracks-theme-updated", handleThemeUpdated);
  }, []);

  useEffect(() => {
    if (showAccount) setThemeDraft(themeColorFields(customTheme));
  }, [showAccount]);

  useEffect(() => {
    let cancelled = false;
    async function loadJellyfinStatus() {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const response = await axios.get("/api/jellyfin/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setJellyfinStatus(response.data || null);
      } catch {
        if (!cancelled) setJellyfinStatus({ ok: false, error: `${mediaServerName()} unreachable` });
      }
    }
    loadJellyfinStatus();
    const interval = setInterval(loadJellyfinStatus, 45000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useLayoutEffect(() => {
    localStorage.setItem(NAV_COLLAPSED_KEY, String(isNavCollapsed));
    document.documentElement.classList.toggle("jg-nav-collapsed", isNavCollapsed);
    document.documentElement.style.removeProperty("--jg-sidebar-width");
  }, [isNavCollapsed]);

  useEffect(() => {
    function handleNavCollapsedUpdate(event) {
      setIsNavCollapsed(Boolean(event.detail));
    }

    window.addEventListener("silo-barracks-nav-collapsed-updated", handleNavCollapsedUpdate);
    return () => window.removeEventListener("silo-barracks-nav-collapsed-updated", handleNavCollapsedUpdate);
  }, []);

  useEffect(() => {
    let mounted = true;
    const setters = {
      setShowCalendarNav,
      setShowDownloadsNav,
      setShowRequestsNav,
      setShowWizarrNav,
      setShowTdarrNav,
      setShowMaintainerrNav,
      setShowAutomationHealthNav,
      setActiveDownloadCount,
      setActiveTranscodeCount,
      setRequestBadgeCount,
    };

    async function refresh() {
      if (!localStorage.getItem("token")) return;
      try {
        const integrations = await loadNavbarIntegrations();
        if (mounted) applyNavbarIntegrations(integrations, setters);
      } catch {
        /* cached flags already seed the nav */
      }
    }

    refresh();
    function onUpdated(event) {
      if (event.detail) {
        if (mounted) applyNavbarIntegrations(event.detail, setters);
        return;
      }
      clearNavbarIntegrationsCache();
      refresh();
    }
    window.addEventListener("silo-barracks-integrations-updated", onUpdated);
    return () => {
      mounted = false;
      window.removeEventListener("silo-barracks-integrations-updated", onUpdated);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const setAutomationHealthAvailability = (integrations) => {
      const nextAvailable = getAutomationHealthAvailabilityFromIntegrations(integrations);
      localStorage.setItem(AUTOMATION_HEALTH_NAV_AVAILABLE_KEY, String(nextAvailable));
      window.dispatchEvent(new Event(NAV_AVAILABILITY_EVENT));
      if (isMounted) {
        setShowAutomationHealthNav(nextAvailable);
      }
    };

    const refreshAutomationHealthAvailability = async () => {
      if (!localStorage.getItem("token")) {
        setAutomationHealthAvailability({ arrApps: [] });
        return;
      }

      try {
        setAutomationHealthAvailability(await loadNavbarIntegrations());
      } catch {
        if (isMounted) {
          setShowAutomationHealthNav(getCachedAutomationHealthNavAvailable());
        }
      }
    };

    const handleIntegrationsUpdated = (event) => {
      if (event.detail) {
        setAutomationHealthAvailability(event.detail);
        return;
      }
      clearNavbarIntegrationsCache();
      refreshAutomationHealthAvailability();
    };

    const startupTimer = window.setTimeout(refreshAutomationHealthAvailability, 500);
    window.addEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
      window.clearTimeout(startupTimer);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const refreshConfig = async () => {
      if (!localStorage.getItem("token")) {
        setConfig(getCachedConfig());
        return;
      }

      const freshConfig = await Config.getConfig();
      if (isMounted && !freshConfig?.response) {
        setConfig(freshConfig);
      }
    };

    refreshConfig();
    window.addEventListener("silo-barracks-config-updated", refreshConfig);
    window.addEventListener("storage", refreshConfig);

    return () => {
      isMounted = false;
      window.removeEventListener("silo-barracks-config-updated", refreshConfig);
      window.removeEventListener("storage", refreshConfig);
    };
  }, []);

  useEffect(() => {
    const refreshNavOrder = () => setNavOrder(getStoredNavOrder(navData));
    const refreshNavVisibility = () => setHiddenNavLinks(getStoredHiddenNavLinks(navData));

    window.addEventListener("silo-barracks-nav-order-updated", refreshNavOrder);
    window.addEventListener("silo-barracks-nav-visibility-updated", refreshNavVisibility);
    window.addEventListener("storage", refreshNavOrder);
    window.addEventListener("storage", refreshNavVisibility);
    return () => {
      window.removeEventListener("silo-barracks-nav-order-updated", refreshNavOrder);
      window.removeEventListener("silo-barracks-nav-visibility-updated", refreshNavVisibility);
      window.removeEventListener("storage", refreshNavOrder);
      window.removeEventListener("storage", refreshNavVisibility);
    };
  }, []);

  useEffect(() => {
    const handleSessions = (sessionData) => {
      if (!config?.IS_SILO && Array.isArray(sessionData)) {
        setActiveStreamCount(sessionData.filter((session) => session.NowPlayingItem !== undefined).length);
      }
    };

    socket.on("sessions", handleSessions);
    return () => socket.off("sessions", handleSessions);
  }, [config?.IS_SILO]);

  useEffect(() => {
    if (config?.IS_SILO) {
      setActiveStreamCount(Number.isFinite(fleetSnapshot?.totalActiveStreams)
        ? fleetSnapshot.totalActiveStreams : 0);
    }
  }, [config?.IS_SILO, fleetSnapshot?.totalActiveStreams]);

  useEffect(() => {
    const setCalendarAvailability = (integrations) => {
      const nextAvailable = getCalendarAvailabilityFromIntegrations(integrations);
      localStorage.setItem(CALENDAR_NAV_AVAILABLE_KEY, String(nextAvailable));
      setShowCalendarNav(nextAvailable);
    };

    const refreshCalendarAvailability = async () => {
      if (!localStorage.getItem("token")) {
        setCalendarAvailability({ arrApps: [] });
        return;
      }
      try {
        setCalendarAvailability(await loadNavbarIntegrations());
      } catch {
        setShowCalendarNav(getCachedCalendarNavAvailable());
      }
    };

    const handleIntegrationsUpdated = (event) => {
      if (event.detail) {
        setCalendarAvailability(event.detail);
        return;
      }
      clearNavbarIntegrationsCache();
      refreshCalendarAvailability();
    };

    window.addEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
    return () => {
      window.removeEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
    };
  }, []);

  useEffect(() => {
    const handleDownloadCount = (event) => {
      const nextCount = Number(event.detail ?? localStorage.getItem("silo_barracks_active_download_count") ?? 0);
      setActiveDownloadCount(Number.isFinite(nextCount) ? nextCount : 0);
    };

    const setDownloadAvailability = (integrations) => {
      const nextAvailable = getDownloadAvailabilityFromIntegrations(integrations);
      localStorage.setItem(DOWNLOAD_NAV_AVAILABLE_KEY, String(nextAvailable));
      setShowDownloadsNav(nextAvailable);
      if (!nextAvailable) {
        setActiveDownloadCount(0);
      }
    };

    const refreshDownloadAvailability = async () => {
      if (!localStorage.getItem("token")) {
        setDownloadAvailability({ clients: [] });
        return;
      }

      try {
        setDownloadAvailability(await loadNavbarIntegrations());
      } catch {
        setShowDownloadsNav(getCachedDownloadNavAvailable());
      }
    };

    const handleIntegrationsUpdated = (event) => {
      if (event.detail) {
        setDownloadAvailability(event.detail);
        return;
      }
      clearNavbarIntegrationsCache();
      refreshDownloadAvailability();
    };

    const startupTimer = window.setTimeout(refreshDownloadAvailability, 500);
    window.addEventListener("silo-barracks-download-count", handleDownloadCount);
    window.addEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
    window.addEventListener("storage", handleDownloadCount);
    return () => {
      window.removeEventListener("silo-barracks-download-count", handleDownloadCount);
      window.removeEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
      window.removeEventListener("storage", handleDownloadCount);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const setWizarrAvailability = (integrations) => {
      const nextAvailable = getWizarrAvailabilityFromIntegrations(integrations);
      localStorage.setItem(WIZARR_NAV_AVAILABLE_KEY, String(nextAvailable));
      window.dispatchEvent(new Event(NAV_AVAILABILITY_EVENT));
      if (isMounted) {
        setShowWizarrNav(nextAvailable);
      }
    };

    const refreshWizarrAvailability = async () => {
      if (!localStorage.getItem("token")) {
        setWizarrAvailability({ thirdParty: [] });
        return;
      }

      try {
        setWizarrAvailability(await loadNavbarIntegrations());
      } catch {
        if (isMounted) {
          setShowWizarrNav(getCachedWizarrNavAvailable());
        }
      }
    };

    const handleIntegrationsUpdated = (event) => {
      if (event.detail) {
        setWizarrAvailability(event.detail);
        return;
      }
      clearNavbarIntegrationsCache();
      refreshWizarrAvailability();
    };

    const startupTimer = window.setTimeout(refreshWizarrAvailability, 500);
    window.addEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
      window.clearTimeout(startupTimer);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const setMaintainerrAvailability = (integrations) => {
      const nextAvailable = getMaintainerrAvailabilityFromIntegrations(integrations);
      localStorage.setItem(MAINTAINERR_NAV_AVAILABLE_KEY, String(nextAvailable));
      if (isMounted) {
        setShowMaintainerrNav(nextAvailable);
      }
    };

    const refreshMaintainerrAvailability = async () => {
      if (!localStorage.getItem("token")) {
        setMaintainerrAvailability({ thirdParty: [] });
        return;
      }

      try {
        setMaintainerrAvailability(await loadNavbarIntegrations());
      } catch {
        if (isMounted) {
          setShowMaintainerrNav(getCachedMaintainerrNavAvailable());
        }
      }
    };

    const handleIntegrationsUpdated = (event) => {
      if (event.detail) {
        setMaintainerrAvailability(event.detail);
        return;
      }
      clearNavbarIntegrationsCache();
      refreshMaintainerrAvailability();
    };

    const startupTimer = window.setTimeout(refreshMaintainerrAvailability, 500);
    window.addEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
      window.clearTimeout(startupTimer);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const setTranscodeAvailability = (integrations) => {
      const nextAvailable = getTdarrAvailabilityFromIntegrations(integrations);
      localStorage.setItem(TDARR_NAV_AVAILABLE_KEY, String(nextAvailable));
      if (isMounted) {
        setShowTdarrNav(nextAvailable);
        if (!nextAvailable) {
          setActiveTranscodeCount(0);
        }
      }
      return nextAvailable;
    };

    const setSafeTranscodeCount = (value) => {
      const nextCount = Number(value || 0);
      if (isMounted) {
        setActiveTranscodeCount(Number.isFinite(nextCount) ? nextCount : 0);
      }
    };

    const refreshTranscodeAvailability = async () => {
      if (!localStorage.getItem("token")) {
        setTranscodeAvailability({ thirdParty: [] });
        return false;
      }

      try {
        return setTranscodeAvailability(await loadNavbarIntegrations());
      } catch {
        if (isMounted) {
          setShowTdarrNav(getCachedTdarrNavAvailable());
        }
        return getCachedTdarrNavAvailable();
      }
    };

    const refreshTranscodeCount = async () => {
      if (!localStorage.getItem("token")) {
        setTranscodeAvailability({ thirdParty: [] });
        return;
      }
      try {
        const response = await axios.get("/api/tdarr/transcodes", {
          params: { activeOnly: "true" },
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        const nextCount = Number(response.data?.stats?.active || response.data?.active?.length || 0);
        localStorage.setItem("silo_barracks_active_transcode_count", String(nextCount));
        setSafeTranscodeCount(nextCount);
      } catch {
        setSafeTranscodeCount(localStorage.getItem("silo_barracks_active_transcode_count"));
      }
    };

    const handleTranscodeCount = (event) => setSafeTranscodeCount(event.detail ?? localStorage.getItem("silo_barracks_active_transcode_count"));
    const handleIntegrationsUpdated = (event) => {
      const hasTdarr = event.detail ? setTranscodeAvailability(event.detail) : getCachedTdarrNavAvailable();
      if (!event.detail) {
        clearNavbarIntegrationsCache();
        refreshTranscodeAvailability();
      }
      if (hasTdarr) {
        refreshTranscodeCount();
      }
    };

    const startupTimer = window.setTimeout(() => {
      refreshTranscodeAvailability().then((hasTdarr) => {
        if (hasTdarr) refreshTranscodeCount();
      });
    }, 4000);
    const intervalId = setInterval(refreshTranscodeCount, 60000);
    window.addEventListener("silo-barracks-transcode-count", handleTranscodeCount);
    window.addEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
    window.addEventListener("storage", handleTranscodeCount);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      window.clearTimeout(startupTimer);
      window.removeEventListener("silo-barracks-transcode-count", handleTranscodeCount);
      window.removeEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
      window.removeEventListener("storage", handleTranscodeCount);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const setSafeCount = (value) => {
      const nextCount = Number(value || 0);
      if (isMounted) {
        setRequestBadgeCount(Number.isFinite(nextCount) ? nextCount : 0);
      }
    };

    const setRequestAvailability = (sources) => {
      const nextAvailable = Array.isArray(sources) && sources.length > 0;
      localStorage.setItem(REQUEST_NAV_AVAILABLE_KEY, String(nextAvailable));
      if (isMounted) {
        setShowRequestsNav(nextAvailable);
      }
    };

    const refreshRequestAvailability = async () => {
      if (!localStorage.getItem("token")) {
        setRequestAvailability([]);
        return false;
      }

      try {
        const nextAvailable = getRequestAvailabilityFromIntegrations(await loadNavbarIntegrations());
        localStorage.setItem(REQUEST_NAV_AVAILABLE_KEY, String(nextAvailable));
        if (isMounted) {
          setShowRequestsNav(nextAvailable);
          if (!nextAvailable) {
            setRequestBadgeCount(0);
          }
        }
        return nextAvailable;
      } catch {
        if (isMounted) {
          setShowRequestsNav(getCachedRequestNavAvailable());
        }
        return getCachedRequestNavAvailable();
      }
    };

    const refreshRequestCount = async () => {
      if (!localStorage.getItem("token")) {
        setRequestAvailability([]);
        return;
      }
      try {
        const response = await axios.get("/api/requests/summary", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        const nextCount = Number(response.data?.stats?.badgeCount || 0);
        localStorage.setItem("silo_barracks_request_badge_count", String(nextCount));
        setRequestAvailability(response.data?.sources);
        setSafeCount(nextCount);
      } catch {
        refreshRequestAvailability();
        setSafeCount(localStorage.getItem("silo_barracks_request_badge_count"));
      }
    };

    const handleRequestCount = (event) => setSafeCount(event.detail ?? localStorage.getItem("silo_barracks_request_badge_count"));
    const handleIntegrationsUpdated = (event) => {
      if (event.detail) {
        const nextAvailable = getRequestAvailabilityFromIntegrations(event.detail);
        localStorage.setItem(REQUEST_NAV_AVAILABLE_KEY, String(nextAvailable));
        if (isMounted) {
          setShowRequestsNav(nextAvailable);
          if (!nextAvailable) {
            setRequestBadgeCount(0);
          }
        }
        if (!nextAvailable) {
          return;
        }
      } else {
        clearNavbarIntegrationsCache();
      }
      refreshRequestCount();
    };

    const startupTimer = window.setTimeout(() => {
      refreshRequestCount();
    }, 4000);
    const intervalId = setInterval(refreshRequestCount, 60000);
    window.addEventListener("silo-barracks-request-count", handleRequestCount);
    window.addEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
    window.addEventListener("storage", handleRequestCount);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      window.clearTimeout(startupTimer);
      window.removeEventListener("silo-barracks-request-count", handleRequestCount);
      window.removeEventListener("silo-barracks-integrations-updated", handleIntegrationsUpdated);
      window.removeEventListener("storage", handleRequestCount);
    };
  }, []);

  const profilePath = `/users/${slugifyUserName(accountName) || "account"}`;

  const handleThemeChange = (key, value) => {
    setThemeDraft((currentTheme) => ({ ...currentTheme, [key]: value }));
  };

  const handleThemePreset = (preset) => {
    setThemeDraft(themeColorFields(preset));
    setIsThemeMenuOpen(false);
  };

  const handleThemeApply = () => {
    const nextTheme = saveTheme(themeColorFields(themeDraft));
    setCustomTheme(nextTheme);
    setThemeDraft(nextTheme);
  };

  const handleThemeDiscard = () => {
    setThemeDraft(themeColorFields(customTheme));
  };

  const handleThemeReset = () => {
    const restored = resetTheme();
    setCustomTheme(restored);
    setThemeDraft(restored);
    setIsThemeMenuOpen(false);
  };

  const handleFontWeightPreference = (preference) => {
    setFontWeightPreference(saveFontWeightPreference(preference));
  };

  const handleAvatarUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextAvatar = toSafeHttpUrl(typeof reader.result === "string" ? reader.result : "", { allowDataImage: true });
      if (!nextAvatar) {
        return;
      }
      localStorage.setItem("silo_barracks_account_avatar", nextAvatar);
      setCustomAvatar(nextAvatar);
    };
    reader.readAsDataURL(file);
  };

  const openWhatsNew = () => {
    window.dispatchEvent(new Event(OPEN_WHATS_NEW_EVENT));
    setShowAccount(false);
  };

  const handleWorkspaceMode = (nextMode) => {
    const next = saveWorkspaceMode(nextMode);
    setWorkspaceMode(next);
    applyPwaStartUrl(pwaStartPath(currentRole, next, permissions));
    setShowAccount(false);
    setIsMobileNavOpen(false);
    navigate(workspaceHomePath(true, next, permissions));
  };

  const getNavBadgeCount = (link) => {
    if (link === "") return activeStreamCount;
    if (link === "downloads") return activeDownloadCount;
    if (link === "active-transcodes") return activeTranscodeCount;
    if (link === "requests") return requestBadgeCount;
    return 0;
  };

  return {
    showAccount,
    setShowAccount,
    isMobileNavOpen,
    setIsMobileNavOpen,
    isThemeMenuOpen,
    setIsThemeMenuOpen,
    isNavCollapsed,
    setIsNavCollapsed,
    avatarSrc,
    visibleNavData,
    location,
    getNavBadgeCount,
    accountName,
    accountRole,
    profilePath,
    canUploadAvatar,
    handleLogout,
    activeStreamCount,
    activeDownloadCount,
    activeTranscodeCount,
    requestBadgeCount,
    handleAvatarUpload,
    openWhatsNew,
    fontWeightPreference,
    handleFontWeightPreference,
    customTheme,
    activeThemePreset,
    handleThemeChange,
    handleThemePreset,
    handleThemeReset,
    homePath,
    closeMobileNav,
    canOpenHome,
    workspaceMode,
    isJellyfinAdmin,
    effectiveWorkspaceMode,
    handleWorkspaceMode,
  };
}

const PROFILE_SECONDARY_BUTTON =
  "tw:min-h-[34px] tw:w-full tw:border tw:border-border-strong tw:bg-secondary tw:px-2.5 tw:py-1.5 tw:text-[13px] tw:font-black tw:text-secondary-foreground tw:no-underline tw:hover:border-border-inset tw:hover:bg-surface-inset tw:hover:text-inset-foreground";

export default function Navbar() {
  const { t } = useTranslation();
  const {
    showAccount,
    setShowAccount,
    isMobileNavOpen,
    setIsMobileNavOpen,
    isThemeMenuOpen,
    setIsThemeMenuOpen,
    isNavCollapsed,
    setIsNavCollapsed,
    avatarSrc,
    visibleNavData,
    location,
    getNavBadgeCount,
    accountName,
    accountRole,
    profilePath,
    canUploadAvatar,
    handleLogout,
    activeStreamCount,
    activeDownloadCount,
    activeTranscodeCount,
    requestBadgeCount,
    handleAvatarUpload,
    openWhatsNew,
    fontWeightPreference,
    handleFontWeightPreference,
    customTheme,
    activeThemePreset,
    handleThemeChange,
    handleThemePreset,
    handleThemeReset,
    homePath,
    closeMobileNav,
    canOpenHome,
    workspaceMode,
    isJellyfinAdmin,
    effectiveWorkspaceMode,
    handleWorkspaceMode,
  } = useNavbarState();

  const myGlanceFirst = !canOpenHome || (isJellyfinAdmin && workspaceMode === "user");
  const tabItems = pickTabItems(visibleNavData, myGlanceFirst);
  const moreItems = visibleNavData.filter((item) => !tabItems.includes(item));
  const moreActive = moreItems.some((item) => isNavItemActive(item, location));
  const moreHasBadge = moreItems.some((item) => getNavBadgeCount(item.link) > 0);
  const isDetailRoute = DETAIL_ROUTE.test(location.pathname);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mobile-app-topbar">
        <button
          className="mobile-app-menu"
          type="button"
          onClick={() => setIsMobileNavOpen((isOpen) => !isOpen)}
          aria-label={isMobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-controls="mobile-app-navigation"
          aria-expanded={isMobileNavOpen}
        >
          <RiMenuLine size={24} />
        </button>
        <Link className="mobile-app-brand" to={homePath}>
          <img src={logo_dark} alt="" />
          <strong className="silo-wordmark">Silo Barracks</strong>
        </Link>
        <button
          className="mobile-app-account"
          type="button"
          onClick={() => setShowAccount(true)}
          aria-label="Open account settings"
          data-testid="theme-account-mobile"
        >
          {avatarSrc ? <img src={avatarSrc} alt="" onError={(event) => (event.currentTarget.style.display = "none")} /> : <RiAccountCircleLine />}
        </button>
      </div>

      <nav className="mobile-tabbar" aria-label={t("MOBILE_NAV.PRIMARY")}>
        {tabItems.map((item) => {
          const badgeCount = getNavBadgeCount(item.link);
          const isActive = !isMobileNavOpen && isNavItemActive(item, location);
          return (
            <Link key={item.id} to={navItemTo(item)} className="mobile-tab" aria-current={isActive ? "page" : undefined} onClick={() => setIsMobileNavOpen(false)}>
              <span className="mobile-tab-ico">{item.icon}</span>
              <span className="mobile-tab-label">{item.text}</span>
              {badgeCount > 0 ? <span className="mobile-tab-badge">{badgeCount}</span> : null}
            </Link>
          );
        })}
        <button
          type="button"
          className="mobile-tab"
          id="mobile-tab-more"
          aria-haspopup="dialog"
          aria-controls="mobile-app-navigation"
          aria-expanded={isMobileNavOpen}
          aria-current={isMobileNavOpen || moreActive ? "page" : undefined}
          onClick={() => setIsMobileNavOpen((isOpen) => !isOpen)}
        >
          <span className="mobile-tab-ico">
            <Apps2LineIcon />
          </span>
          <span className="mobile-tab-label">{t("MOBILE_NAV.MORE")}</span>
          {moreHasBadge ? <span className="mobile-tab-dot" aria-label={t("MOBILE_NAV.MORE_HAS_UPDATES")} /> : null}
        </button>
      </nav>

      {isMobileNavOpen ? <button type="button" className="mobile-app-menu-scrim" aria-label={t("MOBILE_NAV.CLOSE")} onClick={closeMobileNav} /> : null}

      <div
        id="mobile-app-navigation"
        className={`mobile-app-menu-panel${isMobileNavOpen ? " is-open" : ""}`}
        aria-hidden={!isMobileNavOpen}
        role="dialog"
        aria-modal={isMobileNavOpen ? "true" : undefined}
        aria-label={t("MOBILE_NAV.MORE")}
        inert={isMobileNavOpen ? undefined : ""}
      >
        <span className="mobile-app-menu-grabber" aria-hidden="true" />
        <nav className="mobile-app-menu-shell" aria-label="Mobile navigation">
          <div className="mobile-app-menu-grid">
            {moreItems.map((item) => {
              const isActive = isNavItemActive(item, location);
              const badgeCount = getNavBadgeCount(item.link);

              return (
                <Link
                  key={item.id}
                  className={`mobile-app-menu-tile${isActive ? " active" : ""}`}
                  to={navItemTo(item)}
                  onClick={() => setIsMobileNavOpen(false)}
                >
                  <span className="mobile-app-menu-icon">{item.icon}</span>
                  <span className="mobile-app-menu-label">{item.text}</span>
                  {badgeCount > 0 ? <span className="mobile-app-menu-badge">{badgeCount}</span> : null}
                </Link>
              );
            })}
          </div>

          <div className="mobile-app-menu-footer">
            <button
              className="mobile-app-menu-account"
              type="button"
              onClick={() => {
                setIsMobileNavOpen(false);
                setShowAccount(true);
              }}
            >
              <span className="account-nav-avatar">
                {avatarSrc ? (
                  <img src={encodeURI(avatarSrc)} alt="" onError={(event) => (event.currentTarget.style.display = "none")} />
                ) : (
                  <RiAccountCircleLine />
                )}
              </span>
              <span className="account-nav-copy">
                <strong>{accountName}</strong>
                <small>{accountRole}</small>
              </span>
            </button>
            <InstallAppButton className="is-mobile" />
            <button className="mobile-app-menu-logout" type="button" onClick={handleLogout}>
              <RiLogoutBoxLine size={22} />
              <span>
                <Trans i18nKey="MENU_TABS.LOGOUT" />
              </span>
            </button>
            <div className="mobile-app-menu-version">
              <VersionCard />
            </div>
          </div>
        </nav>
      </div>

      <nav
        id="primary-navigation"
        aria-label="Primary navigation"
        className={`desktop-navigation d-flex flex-column py-0 text-center sticky-top ${isNavCollapsed ? "is-collapsed" : ""} navbar navbar-expand navbar-dark`}
      >
      <div className="sticky-top py-md-3">
        <div className="navbar-brand-row">
          <Link to={homePath} className="d-none d-md-inline navbar-brand">
          <img src={logo_dark} className="navbar-brand-icon px-2" alt="" />
          <strong className="silo-wordmark">Silo Barracks</strong>
        </Link>
        </div>

        <div className="flex-row flex-md-column w-100 navbar-nav">
          <div className="navbar-links-scroll">
          {visibleNavData.map((item) => {
            const isActive = isNavItemActive(item, location);
            const badgeCount =
              item.link === ""
                ? activeStreamCount
                : item.link === "downloads"
                ? activeDownloadCount
                : item.link === "active-transcodes"
                ? activeTranscodeCount
                : item.link === "requests"
                ? requestBadgeCount
                : 0;
            const navLabel = item.label || (typeof item.text === "string" ? item.text : "");
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                <Link
                  className={`navitem${isActive ? " active" : ""} p-2 nav-link`}
                  to={navItemTo(item)}
                  onClick={() => setIsMobileNavOpen(false)}
                  aria-label={navLabel}
                  aria-current={isActive ? "page" : undefined}
                >
                  {item.icon}
                  {badgeCount > 0 ? <span className="nav-icon-badge">{badgeCount}</span> : null}
                  <span className="nav-text">
                    <span>{item.text}</span>
                    {item.link === "" && activeStreamCount > 0 ? (
                      <span className="nav-live-count" aria-label={`${activeStreamCount} active streams`}>
                        {activeStreamCount}
                      </span>
                    ) : null}
                    {item.link === "downloads" && activeDownloadCount > 0 ? (
                      <span className="nav-live-count" aria-label={`${activeDownloadCount} active downloads`}>
                        {activeDownloadCount}
                      </span>
                    ) : null}
                    {item.link === "active-transcodes" && activeTranscodeCount > 0 ? (
                      <span className="nav-live-count" aria-label={`${activeTranscodeCount} active transcodes`}>
                        {activeTranscodeCount}
                      </span>
                    ) : null}
                    {item.link === "requests" && requestBadgeCount > 0 ? (
                      <span className="nav-live-count" aria-label={`${requestBadgeCount} pending or failed requests`}>
                        {requestBadgeCount}
                      </span>
                    ) : null}
                  </span>
                </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{navLabel}</TooltipContent>
              </Tooltip>
            );
          })}
          <button
            type="button"
            className="navbar-collapse-toggle"
            onClick={() => setIsNavCollapsed((current) => !current)}
            aria-label={isNavCollapsed ? "Expand side menu" : "Collapse side menu"}
            title={isNavCollapsed ? "Expand side menu" : "Collapse side menu"}
          >
            {isNavCollapsed ? <RiArrowRightSLine size={16} /> : <RiArrowLeftSLine size={16} />}
          </button>
          </div>
          <div className="navbar-inline-footer">
            <div className="navbar-footer-account-row">
              <button
                className="navitem account-navitem p-2"
                type="button"
                onClick={() => setShowAccount(true)}
                data-testid="theme-account-desktop"
              >
                <span className="account-nav-avatar">
                  {avatarSrc ? (
                    <img src={encodeURI(avatarSrc)} alt="" onError={(event) => (event.currentTarget.style.display = "none")} />
                  ) : (
                    <RiAccountCircleLine />
                  )}
                </span>
                <span className="account-nav-copy">
                  <strong>{accountName}</strong>
                  <small>{accountRole}</small>
                </span>
              </button>
            </div>
            <InstallAppButton className="is-desktop" />
            <div className="navbar-version-row">
              {jellyfinStatus && jellyfinStatus.ok === false ? (
                <Link to="/settings/health" className="navbar-jellyfin-down" title={jellyfinStatus.error || t("FEATURES.OPS.JELLYFIN_DOWN")}>
                  <ErrorWarningLineIcon size={16} />
                  <span>{t("FEATURES.OPS.JELLYFIN_DOWN")}</span>
                </Link>
              ) : null}
              <VersionCard />
            </div>
          </div>
        </div>
      </div>

      </nav>

      <Dialog open={showAccount} onOpenChange={setShowAccount}>
        <DialogContent
          className="profile-modal tw:grid-rows-[auto_minmax(0,1fr)_auto] tw:gap-0 tw:p-0 tw:w-[min(calc(100vw-48px),420px)] tw:max-w-none tw:sm:max-w-none tw:max-h-[calc(100dvh-2rem)] tw:overflow-hidden tw:compact:w-[min(calc(100vw-18px),692px)] tw:compact:max-h-[calc(100dvh-16px)] tw:compact:rounded-[18px]"
          closeClassName="tw:top-3 tw:right-3.5 tw:[&_svg:not([class*=size-])]:size-5"
          onOpenAutoFocus={(event) => {
            // Focus the dialog itself (no ring) instead of the first control (the file input).
            event.preventDefault();
            event.target?.focus?.();
          }}
        >
          <DialogHeader className="tw:gap-0 tw:border-b tw:border-border tw:px-3.5 tw:pt-2.5 tw:pb-2 tw:text-left tw:sm:text-left tw:compact:min-h-11 tw:compact:py-2.5">
            <DialogTitle className="tw:m-0 tw:text-[15px] tw:leading-normal tw:font-black tw:compact:text-base">Account</DialogTitle>
            <DialogDescription className="tw:sr-only">Account, font weight, and theme settings for this browser.</DialogDescription>
          </DialogHeader>
          <div className="tw:overflow-y-auto tw:px-3.5 tw:pt-2 tw:pb-3 tw:compact:py-3">
          <div className="profile-modal-identity">
            <div className="profile-modal-avatar">
              {avatarSrc ? <img src={avatarSrc} alt="" onError={(event) => (event.currentTarget.style.display = "none")} /> : <RiAccountCircleLine />}
            </div>
            <div className="profile-modal-copy">
              <strong>{accountName}</strong>
              <span className="profile-modal-role">{accountRole}</span>
              {isJellyfinAdmin ? (
                <div className="profile-mode-toggle" role="tablist" aria-label={t("FEATURES.WORKSPACE.MODE")}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={effectiveWorkspaceMode === "admin"}
                    className={effectiveWorkspaceMode === "admin" ? "is-active" : ""}
                    onClick={() => handleWorkspaceMode("admin")}
                  >
                    <RiShieldUserFill size={16} />
                    {t("FEATURES.WORKSPACE.ADMIN")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={effectiveWorkspaceMode === "user"}
                    className={effectiveWorkspaceMode === "user" ? "is-active" : ""}
                    onClick={() => handleWorkspaceMode("user")}
                  >
                    <RiUserStarFill size={16} />
                    {t("FEATURES.WORKSPACE.USER")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {isJellyfinAdmin ? (
            <p className="profile-mode-hint">
              {effectiveWorkspaceMode === "user"
                ? t("FEATURES.WORKSPACE.USER_HINT")
                : t("FEATURES.WORKSPACE.ADMIN_HINT")}
            </p>
          ) : null}
          <div className="profile-quick-links">
            <Link to={profilePath} onClick={() => setShowAccount(false)}>
              View profile
            </Link>
          </div>

          {canUploadAvatar ? (
            <label className="profile-avatar-upload">
              <span>Custom avatar</span>
              <input type="file" accept="image/*" onChange={handleAvatarUpload} />
            </label>
          ) : null}

          <button className="profile-whats-new-button" type="button" onClick={openWhatsNew}>
            <RiMagicLine size={18} />
            <span>
              <strong>What&apos;s new</strong>
              <small>{t("FEATURES.WORKSPACE.WHAT_NEW")}</small>
            </span>
          </button>
          </div>

          <div className="profile-modal-prefs">
          <section className="profile-font-panel" aria-labelledby="profile-font-heading">
            <div className="profile-font-header">
              <h3 id="profile-font-heading"><Trans i18nKey="SETTINGS_PAGE.FONT_WEIGHT" /></h3>
              <span>Choose how bold the interface feels for this browser.</span>
            </div>

            <div className="profile-font-options">
              {FONT_WEIGHT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={fontWeightPreference === option.id ? "is-active" : ""}
                  onClick={() => handleFontWeightPreference(option.id)}
                  aria-pressed={fontWeightPreference === option.id}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="profile-theme-panel" aria-labelledby="profile-theme-heading">
            <div className="profile-theme-header">
              <div>
                <h3 id="profile-theme-heading">Custom colours</h3>
                <span>{t("FEATURES.WORKSPACE.THEME_HINT")}</span>
              </div>
              <button className="profile-theme-reset" type="button" onClick={handleThemeReset}>
                <Trans i18nKey="SETTINGS_PAGE.RESET" />
              </button>
            </div>

            <div className="profile-theme-select">
              <span>Theme preset</span>
              <button
                className="profile-theme-select-button"
                type="button"
                onClick={() => setIsThemeMenuOpen((open) => !open)}
                aria-expanded={isThemeMenuOpen}
                data-testid="theme-menu"
              >
                <span className="profile-theme-preset-swatches" aria-hidden="true">
                  <i style={{ backgroundColor: themeDraft.primary }} />
                  <i style={{ backgroundColor: themeDraft.secondary }} />
                  <i style={{ backgroundColor: themeDraft.background }} />
                </span>
                <strong>{activeThemePreset?.name || t("SETTINGS_PAGE.CUSTOM")}</strong>
                <span className="profile-theme-select-arrow" aria-hidden="true">
                  ▾
                </span>
              </button>
              {isThemeMenuOpen ? (
                <div className="profile-theme-select-menu" role="listbox">
                  <label className="profile-theme-search">
                    <SearchLineIcon size={14} />
                    <input
                      type="search"
                      value={themeQuery}
                      onChange={(event) => setThemeQuery(event.target.value)}
                      placeholder={t("SETTINGS_PAGE.THEME_SEARCH")}
                    />
                  </label>
                  <div className="profile-theme-groups">
                    {THEME_GROUPS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={themeGroup === item.id ? "is-active" : ""}
                        onClick={() => setThemeGroup(item.id)}
                      >
                        {t(`SETTINGS_PAGE.THEME_GROUP_${item.id.toUpperCase()}`)}
                      </button>
                    ))}
                  </div>
                  {visibleThemePresets.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      className={activeThemePreset?.name === preset.name ? "is-active" : ""}
                      onClick={() => handleThemePreset(preset)}
                      role="option"
                      aria-selected={activeThemePreset?.name === preset.name}
                      data-testid={preset.name === "Ocean" ? "theme-preset-ocean" : preset.name === "Mono" ? "theme-preset-mono" : undefined}
                    >
                      <span className="profile-theme-preset-swatches" aria-hidden="true">
                        <i style={{ backgroundColor: preset.primary }} />
                        <i style={{ backgroundColor: preset.secondary }} />
                        <i style={{ backgroundColor: preset.background }} />
                      </span>
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="profile-theme-fields">
              {[
                ["primary", "Primary"],
                ["secondary", "Secondary"],
                ["background", "Background"],
                ["surface", "Surface"],
              ].map(([key, label]) => (
                <label className="profile-theme-field" key={key}>
                  <span>{label}</span>
                  <div className="profile-theme-input">
                    <input
                      type="color"
                      value={themeDraft[key] || DEFAULT_THEME[key]}
                      onChange={(event) => handleThemeChange(key, event.target.value)}
                      aria-label={`${label} colour`}
                      data-testid={key === "primary" ? "theme-color-primary" : undefined}
                    />
                    <input
                      type="text"
                      value={themeDraft[key] || DEFAULT_THEME[key]}
                      aria-label={`${label} hex colour`}
                      maxLength={7}
                      readOnly
                      spellCheck="false"
                    />
                  </div>
                </label>
              ))}
            </div>
            <div className="profile-theme-actions">
              <button type="button" className="profile-theme-apply" disabled={!hasThemeDraftChanges} onClick={handleThemeApply}>
                {t("SETTINGS_PAGE.APPLY_THEME")}
              </button>
              <button type="button" className="profile-theme-reset" disabled={!hasThemeDraftChanges} onClick={handleThemeDiscard}>
                {t("SETTINGS_PAGE.DISCARD_THEME")}
              </button>
              {hasThemeDraftChanges ? <span>{t("SETTINGS_PAGE.THEME_PREVIEW_PENDING")}</span> : null}
            </div>
          </section>
          </div>
          <DialogFooter className="tw:grid tw:grid-cols-1 tw:gap-2 tw:border-t tw:border-border tw:px-3.5 tw:pt-2.5 tw:pb-3 tw:sm:grid tw:sm:justify-stretch tw:compact:grid-cols-2 tw:compact:pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
            <div className="profile-modal-secondary-actions">
              <Button asChild variant="secondary" className={PROFILE_SECONDARY_BUTTON}>
                <Link to={profilePath} onClick={() => setShowAccount(false)}>
                  View profile
                </Link>
              </Button>
              <Button variant="secondary" className={PROFILE_SECONDARY_BUTTON} onClick={() => setShowAccount(false)}>
                Close
              </Button>
            </div>
            <Button className="profile-logout-button tw:min-h-[34px] tw:w-full tw:text-[13px] tw:font-black" onClick={handleLogout}>
              Log out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
