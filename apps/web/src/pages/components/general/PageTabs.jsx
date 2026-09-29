/* eslint-disable react/prop-types */
import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { resolveHubTabs } from "../../../lib/hub-tabs";
import "./css/page-tabs.css";

// Tabbed hub page: the active tab lives in ?tab=, and the tab bar hides when only one tab is visible.
// `tabs` lists every tab the hub has; `visible` and `reachable` are tab ids (see hub-tabs.js).
export default function PageTabs({ title, tabs, visible, reachable, empty = null }) {
  const [params, setParams] = useSearchParams();
  const { active: activeId, shown } = resolveHubTabs({ visible, reachable, requested: params.get("tab") });
  const active = tabs.find((tab) => tab.id === activeId);
  if (!active) return empty;
  const shownTabs = tabs.filter((tab) => shown.includes(tab.id));
  return (
    <div className="page-tabs-hub">
      {shownTabs.length > 1 ? (
        <nav className="page-tabs" role="tablist" aria-label={title}>
          {shownTabs.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.id === active.id;
            return (
              <button key={tab.id} type="button" role="tab" aria-selected={selected} className={selected ? "is-active" : ""}
                onClick={() => setParams({ tab: tab.id })}>
                {Icon ? <Icon size={16} /> : null}
                {tab.label}
              </button>
            );
          })}
        </nav>
      ) : null}
      <Suspense fallback={null}>
        <div key={active.id}>{active.render()}</div>
      </Suspense>
    </div>
  );
}
