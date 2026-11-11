import { lazy } from "react";
import { RiUserAddLine, RiUserLine } from "@remixicon/react";
import PageTabs from "./components/general/PageTabs";
import { usersHubTabIds } from "../lib/hub-tabs";
import useHubFlags from "./components/general/use-hub-flags";

const Users = lazy(() => import("./users"));
const Wizarr = lazy(() => import("./wizarr"));

const TABS = [
  { id: "users", label: "Users", icon: RiUserLine, render: () => <Users /> },
  { id: "invites", label: "Invites", icon: RiUserAddLine, render: () => <Wizarr /> },
];

export default function UsersHub() {
  const visible = usersHubTabIds(useHubFlags());
  return <PageTabs title="Users" tabs={TABS} visible={visible} reachable={["users", "invites"]} />;
}
