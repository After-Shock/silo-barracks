import { useEffect, useState } from "react";
import { Trans } from "react-i18next";
import i18next from "i18next";
import ActivityTimelineComponent from "./components/activity-timeline/activity-timeline";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import axios from "../lib/axios_instance.jsx";
import Config from "../lib/config";
import Loading from "./components/general/loading";
import LibraryFilterModal from "./components/library/library-filter-modal";
import "./css/timeline/activity-timeline.css";

const NO_LIBRARY_FILTER = [];

function readStoredLibraries() {
  try {
    const parsed = JSON.parse(localStorage.getItem("PREF_ACTIVITY_TIMELINE_selectedLibraries"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ActivityTimeline(props) {
  const { preselectedUser } = props;
  const [users, setUsers] = useState();
  const [selectedUser, setSelectedUser] = useState(
    preselectedUser ?? localStorage.getItem("PREF_ACTIVITY_TIMELINE_selectedUser") ?? ""
  );
  const [libraries, setLibraries] = useState();
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState("");
  const [userError, setUserError] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [timelineDataState, setTimelineDataState] = useState("loading");
  const [showLibraryFilters, setShowLibraryFilters] = useState(false);
  const [selectedLibraries, setSelectedLibraries] = useState(readStoredLibraries);

  const handleLibraryFilter = (selectedOptions) => {
    setTimelineDataState("loading");
    setSelectedLibraries(selectedOptions);
    localStorage.setItem("PREF_ACTIVITY_TIMELINE_selectedLibraries", JSON.stringify(selectedOptions));
  };
  const handleUserSelection = (selectedUser) => {
    setTimelineDataState("loading");
    setSelectedUser(selectedUser);
    localStorage.setItem("PREF_ACTIVITY_TIMELINE_selectedUser", selectedUser);
  };

  const toggleSelectAll = () => {
    const allLibraryIds = (libraries || []).map((library) => library.Id);
    const currentlySelected = selectedLibraries ?? allLibraryIds;
    if (currentlySelected.length > 0) {
      setSelectedLibraries([]);
      localStorage.setItem("PREF_ACTIVITY_TIMELINE_selectedLibraries", JSON.stringify([]));
      return;
    }

    setSelectedLibraries(allLibraryIds);
    localStorage.setItem("PREF_ACTIVITY_TIMELINE_selectedLibraries", JSON.stringify(allLibraryIds));
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const newConfig = await Config.getConfig();
        setConfig(newConfig);
        setConfigError("");
      } catch (error) {
        setConfigError(i18next.t("ACTIVITY_STATES.TIMELINE_CONFIG_ERROR"));
        if (error.code === "ERR_NETWORK") {
          console.log(error);
        }
      }
    };

    if (!config) {
      fetchConfig();
    }

    if (preselectedUser) {
      return;
    }

    axios
      .get("/api/getTimelineUsers")
      .then((response) => {
        const nextUsers = response.data || [];
        setUsers(nextUsers);
        // A remembered choice may be someone this account can no longer see, so fall back to the first entry.
        setSelectedUser((current) => (nextUsers.some((user) => user.UserId === current) ? current : nextUsers[0]?.UserId || ""));
      })
      .catch((error) => {
        console.log(error);
        setUsers([]);
      });
  }, [preselectedUser]);

  useEffect(() => {
    if (config && !config.IS_SILO) {
      axios
        .get("/api/getLibraries")
        .then((response) => {
          const nextLibraries = (response.data || [])
            .filter((library) => !library.archived)
            .map((library) => ({ Id: library.Id, Name: library.Name }));
          setLibraries(nextLibraries);
          setLibraryError("");
          if (
            selectedLibraries?.length === 0 &&
            !localStorage.getItem("PREF_ACTIVITY_TIMELINE_selectedLibraries") &&
            nextLibraries.length > 0
          ) {
            setSelectedLibraries(nextLibraries.map((library) => library.Id));
          }
        })
        .catch((error) => {
          console.log(error);
          setLibraryError(i18next.t("ACTIVITY_STATES.TIMELINE_LIBRARIES_ERROR"));
        });
    }
  }, [config]);

  // Silo history has no library IDs, so its timeline is unfiltered.
  const isSilo = Boolean(config?.IS_SILO);

  const filterError = configError || userError || libraryError;
  const filtersResolved = Boolean(filterError) || Boolean(config && (isSilo || libraries !== undefined) && (preselectedUser || users !== undefined));
  const hasFilters = Boolean((preselectedUser || users?.length > 0) && (isSilo || libraries?.length > 0));
  const hasSelection = Boolean(selectedUser && (isSilo || selectedLibraries?.length > 0));
  const routeResolved = !hasSelection || timelineDataState !== "loading";

  if (!filtersResolved) {
    return <div aria-busy="true"><Loading /></div>;
  }

  if (filterError) {
    return (
      <div className="activity-timeline-screen" data-theme-screen={preselectedUser ? undefined : "timeline"}>
        <section className="timeline-state is-error" role="alert">
          <h1><Trans i18nKey={"TIMELINE_PAGE.TIMELINE"} /></h1>
          <p>{filterError}</p>
        </section>
      </div>
    );
  }

  if (!hasFilters) {
    return (
      <div className="activity-timeline-screen" data-theme-screen={preselectedUser ? undefined : "timeline"}>
        <section className="timeline-state is-empty">
          <h1><Trans i18nKey={"TIMELINE_PAGE.TIMELINE"} /></h1>
          <p><Trans i18nKey="ACTIVITY_STATES.TIMELINE_FILTERS_EMPTY" /></p>
        </section>
      </div>
    );
  }

  return (
    <div
      className="activity-timeline-screen"
      data-theme-screen={!preselectedUser && routeResolved ? "timeline" : undefined}
      aria-busy={!routeResolved}
    >
      <div className="Heading">
        <h1>
          <Trans i18nKey={"TIMELINE_PAGE.TIMELINE"} />
        </h1>
        <div className="d-flex flex-column flex-sm-row" style={{ whiteSpace: "nowrap" }}>
          <div className="user-selection">
            <div className="d-flex flex-row w-100 ms-sm-3 w-sm-100 w-sm-75 mb-3 my-sm-1">
              {!preselectedUser && (
                <>
                  <div className="d-flex flex-col rounded-0 rounded-start  align-items-center px-2 bg-primary-1">
                    <Trans i18nKey="USER" />
                  </div>
                  <select
                    onChange={(e) => handleUserSelection(e.target.value)}
                    value={selectedUser}
                    className="form-select w-sm-75 rounded-0 rounded-end"
                    disabled={!users?.length}
                  >
                    {(users || []).map((user) => (
                      <option key={user.UserId} value={user.UserId}>
                        {user.UserName}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
          {!isSilo && <div className="library-selection d-flex flex-column flex-sm-row">
            <Button
              onClick={() => setShowLibraryFilters(true)}
              className="ms-sm-3 mb-3 my-sm-1"
              disabled={!libraries?.length}
            >
              <Trans i18nKey="MENU_TABS.LIBRARIES" />
            </Button>

            <Dialog
              open={showLibraryFilters}
              onOpenChange={(open) => {
                if (!open) {
                  setShowLibraryFilters(false);
                }
              }}
            >
              <DialogContent showCloseButton={false}>
                <DialogTitle>
                  <Trans i18nKey="MENU_TABS.LIBRARIES" />
                </DialogTitle>
                <DialogDescription className="tw:sr-only">Choose which libraries appear in this timeline view</DialogDescription>
                <LibraryFilterModal
                  libraries={libraries}
                  selectedLibraries={selectedLibraries}
                  onSelectionChange={handleLibraryFilter}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={toggleSelectAll}>
                    <Trans i18nKey="ACTIVITY_TABLE.TOGGLE_SELECT_ALL" />
                  </Button>
                  <Button variant="outline" onClick={() => setShowLibraryFilters(false)}>
                    <Trans i18nKey="CLOSE" />
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>}
        </div>
      </div>
      <div>
        {hasSelection && (
          <ActivityTimelineComponent
            userId={selectedUser}
            libraries={isSilo ? NO_LIBRARY_FILTER : selectedLibraries}
            onStateChange={setTimelineDataState}
          />
        )}
        {!hasSelection ? <section className="timeline-state is-empty"><p><Trans i18nKey="ACTIVITY_STATES.TIMELINE_SELECTION_EMPTY" /></p></section> : null}
      </div>
    </div>
  );
}

export default ActivityTimeline;
