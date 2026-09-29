import { lazy } from "react";
import { Link } from "react-router-dom";
import ServerLineIcon from "remixicon-react/ServerLineIcon";
import RadarLineIcon from "remixicon-react/RadarLineIcon";
import PageTabs from "./components/general/PageTabs";
import { readFlags, serverHubTabIds } from "../lib/hub-tabs";

const ServerManagement = lazy(() => import("./server-management"));
const AutomationHealth = lazy(() => import("./automation-health"));

const TABS = [
  { id: "jobs", label: "Server Jobs", icon: ServerLineIcon, render: () => <ServerManagement /> },
  { id: "automation", label: "Automation Health", icon: RadarLineIcon, render: () => <AutomationHealth /> },
];

export default function ServerHub() {
  const visible = serverHubTabIds(readFlags());
  return <PageTabs title="Server" tabs={TABS.filter((tab) => visible.includes(tab.id))}
    empty={<section className="page-tabs-empty"><h1>Server</h1><p>No server tools are available. Configure Arr apps in <Link to="/settings/integrations">Settings → Integrations</Link> to enable Automation Health.</p></section>} />;
}
