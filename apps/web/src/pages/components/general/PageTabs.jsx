/* eslint-disable react/prop-types */
import { Suspense, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { resolveHubTabs } from "../../../lib/hub-tabs";
import Loading from "./loading";
import "./css/page-tabs.css";

// Tabbed hub page: the active tab lives in ?tab=, and the tab bar hides when only one tab is shown.
// `tabs` lists every tab the hub has; `visible` and `reachable` are tab ids (see hub-tabs.js).
export default function PageTabs({ title, tabs, visible, reachable, empty = null }) {
  const [params, setParams] = useSearchParams();
  const tabRefs = useRef({});
  const { active: activeId, shown } = resolveHubTabs({ visible, reachable, requested: params.get("tab") });
  const active = tabs.find((tab) => tab.id === activeId);
  if (!active) return empty;
  const shownTabs = tabs.filter((tab) => shown.includes(tab.id));
  const withBar = shownTabs.length > 1;

  const select = (id) => {
    if (id !== active.id) setParams({ tab: id }, { replace: true });
  };
  const onKeyDown = (event) => {
    const index = shownTabs.findIndex((tab) => tab.id === active.id);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: shownTabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = shownTabs[(next + shownTabs.length) % shownTabs.length];
    select(target.id);
    tabRefs.current[target.id]?.focus();
  };

  const content = (
    <Suspense fallback={<Loading />}>
      <div key={active.id}>{active.render()}</div>
    </Suspense>
  );
  return (
    <div className="page-tabs-hub">
      {withBar ? (
        <div className="page-tabs" role="tablist" aria-label={title} onKeyDown={onKeyDown}>
          {shownTabs.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.id === active.id;
            return (
              <button key={tab.id} ref={(node) => { tabRefs.current[tab.id] = node; }} type="button" role="tab"
                id={`hub-tab-${tab.id}`} aria-controls={`hub-panel-${tab.id}`} aria-selected={selected}
                tabIndex={selected ? 0 : -1} className={selected ? "is-active" : ""} onClick={() => select(tab.id)}>
                {Icon ? <Icon size={16} /> : null}
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {withBar ? (
        <div role="tabpanel" id={`hub-panel-${active.id}`} aria-labelledby={`hub-tab-${active.id}`} tabIndex={0}>{content}</div>
      ) : content}
    </div>
  );
}
