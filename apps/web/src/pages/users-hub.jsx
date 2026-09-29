import { lazy } from "react";
import UserLineIcon from "remixicon-react/UserLineIcon";
import UserAddLineIcon from "remixicon-react/UserAddLineIcon";
import PageTabs from "./components/general/PageTabs";
import { readFlags, usersHubTabIds } from "../lib/hub-tabs";

const Users = lazy(() => import("./users"));
const Wizarr = lazy(() => import("./wizarr"));

const TABS = [
  { id: "users", label: "Users", icon: UserLineIcon, render: () => <Users /> },
  { id: "invites", label: "Invites", icon: UserAddLineIcon, render: () => <Wizarr /> },
];

export default function UsersHub() {
  const visible = usersHubTabIds(readFlags());
  return <PageTabs title="Users" tabs={TABS.filter((tab) => visible.includes(tab.id))} />;
}
