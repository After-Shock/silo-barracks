import { lazy } from "react";
import { Link, Navigate } from "react-router-dom";
import { RiUserAddLine, RiUserLine } from "@remixicon/react";
import PageTabs, { readAuth } from "./components/general/PageTabs";
import { usersHubTabIds } from "../lib/hub-tabs";
import useHubFlags from "./components/general/use-hub-flags";

const Users = lazy(() => import("./users"));
const Wizarr = lazy(() => import("./wizarr"));

const TABS = [
  { id: "users", label: "Users", icon: RiUserLine, render: () => <Users /> },
  { id: "invites", label: "Invites", icon: RiUserAddLine, render: () => <Wizarr /> },
];

function readOwnUserId() {
  try {
    const config = JSON.parse(localStorage.getItem("config") || "{}");
    const auth = config?.settings?.auth || {};
    if (!["quick-connect", "oidc"].includes(auth.mode)) return "";
    return String(auth.jellyfinUser?.id || auth.jellyfinUser?.Id || "");
  } catch {
    return "";
  }
}

export default function UsersHub() {
  const flags = useHubFlags();
  const { permissions } = readAuth();
  const visible = permissions.users ? usersHubTabIds(flags) : [];

  // Without the Users permission there's nothing to list, so send people to their own profile.
  if (!visible.length) {
    const ownId = readOwnUserId();
    if (ownId) {
      return <Navigate to={`/users/${encodeURIComponent(ownId)}`} replace />;
    }
    return (
      <div className="user-profile-page">
        <section className="user-profile-empty">
          <h1>Users not available</h1>
          <p>The user list is only available to admins.</p>
          <Link to="/me">Go to My Glance</Link>
        </section>
      </div>
    );
  }

  return <PageTabs title="Users" tabs={TABS} visible={visible} reachable={["users", "invites"]} />;
}
