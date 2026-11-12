import { lazy } from "react";
import { Link } from "react-router-dom";
import { RiClosedCaptioningLine, RiDatabase2Line, RiHeadphoneLine, RiRadarLine, RiServerLine, RiTerminalBoxLine, RiTv2Line } from "@remixicon/react";
import PageTabs from "./components/general/PageTabs";
import { AUTOMATION_HEALTH_NAV_AVAILABLE_KEY } from "../lib/hub-tabs";
import useHubFlags from "./components/general/use-hub-flags";

const ServerManagement = lazy(() => import("./server-management"));
const AutomationHealth = lazy(() => import("./automation-health"));
const Maintainerr = lazy(() => import("./maintainerr"));
const Audiobookshelf = lazy(() => import("./audiobookshelf"));
const OpsCopilot = lazy(() => import("./ops-copilot"));
const IncompleteSeasons = lazy(() => import("./incomplete-seasons"));
const SubtitleGap = lazy(() => import("./subtitle-gap"));

const navFlag = (key) => {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
};

const TABS = [
  { id: "jobs", label: "Server Jobs", icon: RiServerLine, visible: (flags) => flags.isAdmin && !flags.isSilo, render: () => <ServerManagement /> },
  { id: "ops-copilot", label: "Ops Copilot", icon: RiTerminalBoxLine, visible: (flags) => flags.isAdmin, render: () => <OpsCopilot /> },
  { id: "incomplete-seasons", label: "Incomplete Seasons", icon: RiTv2Line, visible: (flags) => flags.isAdmin, render: () => <IncompleteSeasons /> },
  { id: "subtitle-gaps", label: "Subtitle Gaps", icon: RiClosedCaptioningLine, visible: (flags) => flags.isAdmin, render: () => <SubtitleGap /> },
  { id: "automation", label: "Automation Health", icon: RiRadarLine, visible: () => navFlag(AUTOMATION_HEALTH_NAV_AVAILABLE_KEY), render: () => <AutomationHealth /> },
  { id: "maintainerr", label: "Maintainerr", icon: RiDatabase2Line, visible: () => navFlag("silo_barracks_maintainerr_nav_available"), render: () => <Maintainerr /> },
  { id: "audiobooks", label: "Audiobooks", icon: RiHeadphoneLine, visible: () => navFlag("jellyglance_audiobookshelf_nav_available"), render: () => <Audiobookshelf /> },
];

export default function ServerHub() {
  const flags = useHubFlags();
  const visible = TABS.filter((tab) => tab.visible(flags)).map((tab) => tab.id);
  return (
    <PageTabs
      title="Server"
      tabs={TABS}
      visible={visible}
      reachable={TABS.map((tab) => tab.id)}
      empty={<section className="page-tabs-empty" data-theme-screen="server-management"><h1>Server</h1><p>No server tools are available. Configure Arr apps in <Link to="/settings/integrations">Settings → Integrations</Link> to enable Automation Health.</p></section>}
    />
  );
}
