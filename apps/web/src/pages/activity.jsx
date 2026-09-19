import { useState, useEffect } from "react";

import axios from "../lib/axios_instance";

import "./css/activity.css";
import Config from "../lib/config";

import ActivityTable from "./components/activity/activity-table";
import Loading from "./components/general/loading";
import { Trans } from "react-i18next";
import { Button, FormControl, FormSelect, Modal } from "react-bootstrap";
import i18next from "i18next";
import LibraryFilterModal from "./components/library/library-filter-modal";
import socket from "../socket";
import SiloActivity from "./silo-activity";

function LegacyActivity({ initialConfig }) {
  const [data, setData] = useState();
  const [config, setConfig] = useState(initialConfig);
  const [streamTypeFilter, setStreamTypeFilter] = useState(localStorage.getItem("PREF_ACTIVITY_StreamTypeFilter") ?? "All");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [itemCount, setItemCount] = useState(parseInt(localStorage.getItem("PREF_ACTIVITY_ItemCount") ?? "10"));
  const [libraryFilters, setLibraryFilters] = useState(
    localStorage.getItem("PREF_ACTIVITY_libraryFilters") != undefined
      ? JSON.parse(localStorage.getItem("PREF_ACTIVITY_libraryFilters"))
      : []
  );
  const [libraries, setLibraries] = useState([]);
  const [showLibraryFilters, setShowLibraryFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sorting, setSorting] = useState({ column: "ActivityDateInserted", desc: true });
  const [filterParams, setFilterParams] = useState([]);
  const [isBusy, setIsBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [historyServers, setHistoryServers] = useState([]);
  const [historyServerId, setHistoryServerId] = useState("primary");

  const handlePageChange = (newPage) => {
    setCurrentPage((currentPage) => (currentPage === newPage ? currentPage : newPage));
  };

  const onSortChange = (sort) => {
    setSorting((currentSort) => {
      if (currentSort.column === sort.column && currentSort.desc === sort.desc) {
        return currentSort;
      }
      return { column: sort.column, desc: sort.desc };
    });
  };

  const onFilterChange = (filter) => {
    setFilterParams((currentFilters) => (JSON.stringify(currentFilters) === JSON.stringify(filter) ? currentFilters : filter));
  };

  function setItemLimit(limit) {
    setItemCount(parseInt(limit));
    localStorage.setItem("PREF_ACTIVITY_ItemCount", limit);
  }

  function setTypeFilterParam(filter) {
    const type = config?.IS_JELLYFIN ? filter : filter.replace("Play", "Stream");
    const params = [...filterParams];
    const playMethodFilterIndex = params.findIndex((filter) => filter.field === "PlayMethod");
    if (playMethodFilterIndex !== -1) {
      params[playMethodFilterIndex].value = type;
    } else {
      params.push({ field: "PlayMethod", value: type });
    }
    if (filter == "All") {
      const playMethodFilterIndex = params.findIndex((filter) => filter.field === "PlayMethod");
      if (playMethodFilterIndex !== -1) {
        params.splice(playMethodFilterIndex, 1);
      }
    }
    setFilterParams(params);
  }

  function setTypeFilter(filter) {
    setStreamTypeFilter(filter);
    localStorage.setItem("PREF_ACTIVITY_StreamTypeFilter", filter);
    setTypeFilterParam(filter);
  }

  const updateLibraryFilterParams = (selectedLibraries) => {
    const params = [...filterParams];
    const selectedAllLibraries =
      libraries.length > 0 &&
      selectedLibraries.length === libraries.length &&
      libraries.every((library) => selectedLibraries.includes(library.Id));
    if (selectedAllLibraries) {
      setFilterParams(params.filter((filter) => filter.field !== "ParentId"));
      return;
    }

    if (selectedLibraries.length != 0) {
      const libraryFilterIndex = params.findIndex((filter) => filter.field === "ParentId");
      if (libraryFilterIndex !== -1) {
        params[libraryFilterIndex].in = selectedLibraries.join(",");
      } else {
        params.push({ field: "ParentId", in: selectedLibraries.join(",") });
      }
    } else {
      const libraryFilterIndex = params.findIndex((filter) => filter.field === "ParentId");
      if (libraryFilterIndex !== -1) {
        params[libraryFilterIndex].in = "no_libraries";
      } else {
        params.push({ field: "ParentId", in: "no_libraries" });
      }
    }
    setFilterParams(params);
  };

  const handleLibraryFilter = (selectedOptions) => {
    setLibraryFilters(selectedOptions);
    localStorage.setItem("PREF_ACTIVITY_libraryFilters", JSON.stringify(selectedOptions));
    updateLibraryFilterParams(selectedOptions);
  };

  const allLibrariesSelected =
    libraries.length > 0 &&
    libraryFilters.length === libraries.length &&
    libraries.every((library) => libraryFilters.includes(library.Id));

  const toggleSelectAll = () => {
    if (libraryFilters.length > 0) {
      setLibraryFilters([]);
      localStorage.setItem("PREF_ACTIVITY_libraryFilters", JSON.stringify([]));
      updateLibraryFilterParams([]);
    } else {
      setLibraryFilters(libraries.map((library) => library.Id));
      localStorage.setItem("PREF_ACTIVITY_libraryFilters", JSON.stringify(libraries.map((library) => library.Id)));
      updateLibraryFilterParams(libraries.map((library) => library.Id));
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // Adjust the delay as needed

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  useEffect(() => {
    const handleRestoredData = () => {
      localStorage.removeItem("PREF_ACTIVITY_libraryFilters");
      setLibraryFilters([]);
      setLibraries([]);
      setFilterParams((currentFilters) => currentFilters.filter((filter) => filter.field !== "ParentId"));
      setCurrentPage(1);
      setData(undefined);
      Config.getConfig(true)
        .then((newConfig) => {
          if (!newConfig?.response) {
            setConfig(newConfig);
          }
        })
        .catch((error) => console.log(error));
    };

    const handleImportedData = () => {
      setCurrentPage(1);
      setData(undefined);
    };

    window.addEventListener("silo-barracks-backup-restored", handleRestoredData);
    window.addEventListener("silo-barracks-history-imported", handleImportedData);
    socket.on("BackupRestore", handleRestoredData);

    return () => {
      window.removeEventListener("silo-barracks-backup-restored", handleRestoredData);
      window.removeEventListener("silo-barracks-history-imported", handleImportedData);
      socket.off("BackupRestore", handleRestoredData);
    };
  }, []);

  useEffect(() => {
    if (!config?.IS_SILO || !config.token) return;
    axios.get("/fleet", { headers: { Authorization: `Bearer ${config.token}` } })
      .then(({ data: snapshot }) => setHistoryServers((snapshot.servers || []).filter(server => server.enabled)))
      .catch(() => setHistoryServers([]));
  }, [config]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const newConfig = await Config.getConfig();
        setConfig(newConfig);
      } catch (error) {
        setHistoryError(i18next.t("ACTIVITY_STATES.CONFIG_ERROR"));
        if (error.code === "ERR_NETWORK") {
          console.log(error);
        }
      }
    };

    if (!config) {
      fetchConfig();
      return;
    }

    const requestFilters = [...filterParams].filter((filter) => filter.field !== "ParentId");
    if (libraries.length > 0 && libraryFilters.length != 0 && !allLibrariesSelected) {
      const libraryFilterIndex = requestFilters.findIndex((filter) => filter.field === "ParentId");
      if (libraryFilterIndex !== -1) {
        requestFilters[libraryFilterIndex].in = libraryFilters.join(",");
      } else {
        requestFilters.push({ field: "ParentId", in: libraryFilters.join(",") });
      }
    }

    if (streamTypeFilter != "All") {
      const streamTypeFilterIndex = requestFilters.findIndex((filter) => filter.field === "PlayMethod");
      if (streamTypeFilterIndex !== -1) {
        requestFilters[streamTypeFilterIndex].value = streamTypeFilter;
      } else {
        requestFilters.push({ field: "PlayMethod", value: streamTypeFilter });
      }
    }

    const fetchHistory = () => {
      setIsBusy(true);
      const url = config.IS_SILO && historyServerId !== "primary"
        ? `/fleet/history/${encodeURIComponent(historyServerId)}`
        : `/api/getHistory`;

      axios
        .get(url, {
          params: {
            size: itemCount,
            page: currentPage,
            search: debouncedSearchQuery,
            sort: sorting.column,
            desc: sorting.desc,
            filters: requestFilters != undefined ? JSON.stringify(requestFilters) : null,
          },
          headers: {
            Authorization: `Bearer ${config.token}`,
            "Content-Type": "application/json",
          },
        })
        .then((data) => {
          setData(data.data);
          setHistoryError("");
          setIsBusy(false);
        })
        .catch((error) => {
          console.log(error);
          setHistoryError(i18next.t("ACTIVITY_STATES.HISTORY_ERROR"));
          setIsBusy(false);
        });
    };

    const fetchLibraries = () => {
      const url = `/api/getLibraries`;
      axios
        .get(url, {
          headers: {
            Authorization: `Bearer ${config.token}`,
            "Content-Type": "application/json",
          },
        })
        .then((data) => {
          const fetchedLibraryFilters = data.data.map((library) => {
            return {
              Name: library.Name,
              Id: library.Id,
              Archived: library.archived,
            };
          });
          setLibraries(fetchedLibraryFilters);
          setLibraryError("");
          if (libraryFilters.length == 0) {
            setLibraryFilters(fetchedLibraryFilters.map((library) => library.Id));
            localStorage.setItem(
              "PREF_ACTIVITY_libraryFilters",
              JSON.stringify(fetchedLibraryFilters.map((library) => library.Id))
            );
          }
        })
        .catch((error) => {
          console.log(error);
          setLibraryError(i18next.t("ACTIVITY_STATES.FILTERS_PARTIAL"));
        });
    };

    fetchHistory();
    if (libraries.length == 0) {
      fetchLibraries();
    }

    const intervalId = setInterval(fetchHistory, 60000 * 60);
    return () => clearInterval(intervalId);
  }, [config, itemCount, currentPage, debouncedSearchQuery, sorting, filterParams, libraries.length, libraryFilters, allLibrariesSelected, streamTypeFilter, historyServerId]);

  const activityRows = Array.isArray(data) ? data : data?.results;
  const activityError = historyError || libraryError;

  if (!data && !historyError) {
    return <div aria-busy="true"><Loading /></div>;
  }

  if (!data && historyError) {
    return (
      <div className="Activity" data-theme-screen="activity">
        <section className="activity-state is-error" role="alert">
          <h1><Trans i18nKey="MENU_TABS.ACTIVITY" /></h1>
          <p>{historyError}</p>
        </section>
      </div>
    );
  }

  if (!config?.IS_SILO && Array.isArray(activityRows) && activityRows.length === 0) {
    return (
      <div className="Activity" data-theme-screen="activity">
        {activityError ? <p className="activity-notice is-error" role="alert">{activityError}</p> : null}
        <section className="activity-state is-empty">
          <h1><Trans i18nKey="MENU_TABS.ACTIVITY" /></h1>
          <h2>
            <Trans i18nKey="ERROR_MESSAGES.NO_ACTIVITY" />
          </h2>
        </section>
      </div>
    );
  }

  return (
    <div className="Activity" data-theme-screen="activity">
      {activityError ? <p className="activity-notice is-error" role="alert">{activityError}</p> : null}
      <Modal show={showLibraryFilters} onHide={() => setShowLibraryFilters(false)}>
        <Modal.Header>
          <Modal.Title>
            <Trans i18nKey="MENU_TABS.LIBRARIES" />
          </Modal.Title>
        </Modal.Header>
        <LibraryFilterModal libraries={libraries} selectedLibraries={libraryFilters} onSelectionChange={handleLibraryFilter} />
        <Modal.Footer>
          <Button variant="outline-primary" onClick={toggleSelectAll}>
            <Trans i18nKey="ACTIVITY_TABLE.TOGGLE_SELECT_ALL" />
          </Button>
          <Button variant="outline-primary" onClick={() => setShowLibraryFilters(false)}>
            <Trans i18nKey="CLOSE" />
          </Button>
        </Modal.Footer>
      </Modal>
      <header className="activity-page-header">
        <div>
          <p>Playback log</p>
          <h1>
            <Trans i18nKey="MENU_TABS.ACTIVITY" />
          </h1>
          <span>Review watch history, playback method, device, and session details.</span>
        </div>

        {config?.IS_SILO && <p className="activity-notice" role="status">History is read directly from Silo retention, newest first. Barracks does not duplicate or delete these records.</p>}
        <div className="activity-controls">
          {config?.IS_SILO && historyServers.length > 1 && <label className="activity-control-field">
            <span>Silo server</span>
            <FormSelect value={historyServerId} onChange={(event) => {
              setHistoryServerId(event.target.value);
              setCurrentPage(1);
            }}>
              <option value="primary">Primary server</option>
              {historyServers.filter(server => !server.isPrimary).map(server => (
                <option key={server.id} value={server.id}>{server.name}{server.state === "connected" ? "" : " (unavailable)"}</option>
              ))}
            </FormSelect>
          </label>}
          {!config?.IS_SILO && <Button onClick={() => setShowLibraryFilters(true)} className="activity-control-button">
            <Trans i18nKey="MENU_TABS.LIBRARIES" />
          </Button>}

          {!config?.IS_SILO && <label className="activity-control-field">
            <span>
              <Trans i18nKey="TYPE" />
            </span>
            <FormSelect
              onChange={(event) => {
                setTypeFilter(event.target.value);
              }}
              value={streamTypeFilter}
            >
              <option value="All">
                <Trans i18nKey="ALL" />
              </option>
              <option value="Transcode">
                <Trans i18nKey="TRANSCODE" />
              </option>
              <option value="DirectPlay">
                <Trans i18nKey="DIRECT" />
              </option>
              <option value="DirectStream">
                <Trans i18nKey="DIRECT_STREAM" />
              </option>
            </FormSelect>
          </label>}

          <label className="activity-control-field is-compact">
            <span>
              <Trans i18nKey="UNITS.ITEMS" />
            </span>
            <FormSelect
              onChange={(event) => {
                setItemLimit(event.target.value);
              }}
              value={itemCount}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </FormSelect>
          </label>
          {!config?.IS_SILO && <FormControl
            type="text"
            placeholder={i18next.t("SEARCH")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="activity-search-input"
          />}
        </div>
      </header>
      <div className="Activity activity-table-shell">
        <ActivityTable
          data={activityRows ?? []}
          itemCount={itemCount}
          onPageChange={handlePageChange}
          onSortChange={onSortChange}
          onFilterChange={onFilterChange}
          pageCount={data.pages ?? 1}
          isBusy={isBusy}
          readOnly={Boolean(config?.IS_SILO)}
        />
      </div>
    </div>
  );
}

export default function Activity() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Config.getConfig().then((next) => { if (active) setConfig(next); })
      .catch(() => { if (active) setError(i18next.t("ACTIVITY_STATES.CONFIG_ERROR")); });
    return () => { active = false; };
  }, []);
  if (error) return <div className="Activity"><section className="activity-state is-error" role="alert"><h1>Activity</h1><p>{error}</p></section></div>;
  if (!config) return <div aria-busy="true"><Loading /></div>;
  return config.IS_SILO ? <SiloActivity config={config} /> : <LegacyActivity initialConfig={config} />;
}
