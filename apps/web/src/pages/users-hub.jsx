import { lazy } from "react";
import UserLineIcon from "remixicon-react/UserLineIcon";
import UserAddLineIcon from "remixicon-react/UserAddLineIcon";
import PageTabs from "./components/general/PageTabs";
import { usersHubTabIds } from "../lib/hub-tabs";
import useHubFlags from "./components/general/use-hub-flags";

const Users = lazy(() => import("./users"));
const Wizarr = lazy(() => import("./wizarr"));

const TABS = [
  { id: "users", label: "Users", icon: UserLineIcon, render: () => <Users /> },
  { id: "invites", label: "Invites", icon: UserAddLineIcon, render: () => <Wizarr /> },
];

export default function UsersHub() {
  const visible = usersHubTabIds(useHubFlags());
  return <PageTabs title="Users" tabs={TABS} visible={visible} reachable={["users", "invites"]} />;
}
