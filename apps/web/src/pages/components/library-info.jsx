import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "../../lib/axios_instance";
import TvLineIcon from "remixicon-react/TvLineIcon";
import FilmLineIcon from "remixicon-react/FilmLineIcon";
import BarChartBoxLineIcon from "remixicon-react/BarChartBoxLineIcon";
import HistoryLineIcon from "remixicon-react/HistoryLineIcon";
import Settings3LineIcon from "remixicon-react/Settings3LineIcon";
import StackLineIcon from "remixicon-react/StackLineIcon";

// import LibraryDetails from './library/library-details';
import Loading from "./general/loading";
import LibraryLastWatched from "./library/last-watched";
import RecentlyAdded from "./library/recently-added";
import LibraryActivity from "./library/library-activity";
import LibraryItems from "./library/library-items";
import ErrorBoundary from "./general/ErrorBoundary";

import { Tabs, Tab, Button, ButtonGroup } from "react-bootstrap";
import { Trans } from "react-i18next";
import LibraryOptions from "./library/library-options";
import GlobalStats from "./general/globalStats";
import GenreLibraryStats from "./library/genre-library-stats.jsx";
import "../css/library-detail.css";
import Config from "../../lib/config";

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Pending";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function LibraryInfo() {
  const { LibraryId } = useParams();
  const [activeTab, setActiveTab] = useState(
    localStorage.getItem(`PREF_LIBRARY_TAB_LAST_SELECTED_${LibraryId}`) ?? "tabOverview"
  );
  const [data, setData] = useState();
  const [config, setConfig] = useState(null);
  const token = localStorage.getItem("token");

  function setTab(tabName) {
    setActiveTab(tabName);
    localStorage.setItem(`PREF_LIBRARY_TAB_LAST_SELECTED_${LibraryId}`, tabName);
  }

  useEffect(() => {
    let active = true;
    Config.getConfig().then((next) => { if (active) setConfig(next); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const libraryrData = await axios.post(
          `/api/getLibrary`,
          {
            libraryid: LibraryId,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        setData(libraryrData.data);
      } catch (error) {
        console.log(error);
      }
    };

    fetchData();

    const intervalId = setInterval(fetchData, 60000 * 5);
    return () => clearInterval(intervalId);
  }, [LibraryId, token]);

  if (!data || !config) {
    return <div data-theme-screen="library-detail" aria-busy="true"><Loading /></div>;
  }

  const isSilo = Boolean(config?.IS_SILO);
  const effectiveActiveTab = isSilo && activeTab === "tabOptions" ? "tabOverview" : activeTab;
  const tabs = [
    { key: "tabOverview", label: <Trans i18nKey="TAB_CONTROLS.OVERVIEW" />, icon: BarChartBoxLineIcon },
    { key: "tabItems", label: <Trans i18nKey="MEDIA" />, icon: StackLineIcon },
    { key: "tabActivity", label: <Trans i18nKey="TAB_CONTROLS.ACTIVITY" />, icon: HistoryLineIcon },
    ...(!isSilo ? [{ key: "tabOptions", label: <Trans i18nKey="TAB_CONTROLS.OPTIONS" />, icon: Settings3LineIcon }] : []),
  ];
  const LibraryIcon = data.CollectionType === "tvshows" ? TvLineIcon : FilmLineIcon;
  const libraryType = data.CollectionType === "tvshows" ? "Series library" : "Movie library";

  return (
    <div className="library-detail-page" data-theme-screen="library-detail">
      <section className="library-detail-hero">
        <div className="library-detail-icon">
          <LibraryIcon size={48} />
        </div>
        <div className="library-detail-title">
          <span>{libraryType}</span>
          <h1>{data.Name}</h1>
          <ButtonGroup className="library-detail-tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Button
                  key={tab.key}
                  onClick={() => setTab(tab.key)}
                  active={effectiveActiveTab === tab.key}
                  variant="outline-primary"
                  type="button"
                >
                  <Icon size={16} />
                  {tab.label}
                </Button>
              );
            })}
          </ButtonGroup>
        </div>
      </section>

      <Tabs defaultActiveKey={effectiveActiveTab} activeKey={effectiveActiveTab} variant="pills" className="hide-tab-titles">
        <Tab eventKey="tabOverview" title="Overview" className="bg-transparent">
          <div className="library-detail-overview">
            {isSilo ? <section className="library-native-summary">
              <div className="library-native-heading"><span>Silo API v2</span><h2>Library summary</h2>
                <p>Catalog and storage values come from Silo. Playback attempts are available in the Activity tab.</p></div>
              <div className="library-native-metrics">
                <article><span>Catalog items</span><strong>{data.Library_Count == null ? "Pending" : Number(data.Library_Count).toLocaleString()}</strong><small>{data.Library_Count_Exact ? "Exact total" : "Current catalog estimate"}</small></article>
                <article><span>Media files</span><strong>{data.files == null ? "Pending" : Number(data.files).toLocaleString()}</strong><small>{data.measurement_pending ? "Measurement in progress" : "Silo storage metadata"}</small></article>
                <article><span>Storage</span><strong>{formatBytes(data.Size)}</strong><small>{data.measurement_pending ? "Measurement in progress" : "Current measured size"}</small></article>
              </div>
            </section> : <>
              <GlobalStats id={LibraryId} param={"libraryid"} endpoint={"getGlobalLibraryStats"}
                title={<Trans i18nKey="LIBRARY_INFO.LIBRARY_STATS" />} />
              <GenreLibraryStats LibraryId={LibraryId} />
            </>}

            {!data.archived && <ErrorBoundary><RecentlyAdded LibraryId={LibraryId} /></ErrorBoundary>}
            {!isSilo ? <LibraryLastWatched LibraryId={LibraryId} /> : null}
          </div>
        </Tab>
        <Tab eventKey="tabItems" title="Items" className="bg-transparent">
          <LibraryItems LibraryId={LibraryId} />
        </Tab>
        <Tab eventKey="tabActivity" title="Activity" className="bg-transparent">
          <LibraryActivity LibraryId={LibraryId} />
        </Tab>
        {!isSilo ? <Tab eventKey="tabOptions" title="Options" className="bg-transparent">
          <LibraryOptions LibraryId={LibraryId} isArchived={data.archived} />
        </Tab> : null}
      </Tabs>
    </div>
  );
}
export default LibraryInfo;
