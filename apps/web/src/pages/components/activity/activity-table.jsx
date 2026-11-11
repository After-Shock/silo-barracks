/* eslint-disable react/prop-types */
import React, { useEffect } from "react";
import axios from "../../../lib/axios_instance";

import StreamInfo from "./stream_info";

import "../../css/activity/activity-table.css";
import i18next from "i18next";
import IpInfoModal from "../ip-info";
import BusyLoader from "../general/busyLoader.jsx";
import {
  DataTable,
  DataTableColumnsMenu,
  DataTablePagination,
  createExpandColumn,
  createSelectColumn,
  defaultDataTableLocalization,
  useDataTable,
} from "@/components/data-table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Link } from "react-router-dom";
import { Trans } from "react-i18next";

function formatTotalWatchTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  let timeString = "";

  if (hours > 0) {
    timeString += `${hours} ${hours === 1 ? i18next.t("UNITS.HOUR").toLowerCase() : i18next.t("UNITS.HOURS").toLowerCase()} `;
  }

  if (minutes > 0) {
    timeString += `${minutes} ${
      minutes === 1 ? i18next.t("UNITS.MINUTE").toLowerCase() : i18next.t("UNITS.MINUTES").toLowerCase()
    } `;
  }

  if (remainingSeconds > 0) {
    timeString += `${remainingSeconds} ${
      remainingSeconds === 1 ? i18next.t("UNITS.SECOND").toLowerCase() : i18next.t("UNITS.SECONDS").toLowerCase()
    }`;
  }

  return timeString.trim();
}

const token = localStorage.getItem("token");
const activityColumnVisibilityKey = "PREF_ACTIVITY_ColumnVisibility";
const defaultColumnVisibility = {
  RemoteEndPoint: false,
};

function ActivityPoster({ itemId, title, disabled = false }) {
  const [imageFailed, setImageFailed] = React.useState(false);

  if (!itemId || imageFailed || disabled) {
    return (
      <span className="activity-poster-fallback" aria-hidden="true">
        {title?.slice(0, 1)?.toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <img
      className="activity-poster-image"
      src={`/proxy/Items/Images/Primary?id=${itemId}&fillHeight=108&fillWidth=72&quality=72`}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setImageFailed(true)}
    />
  );
}

function ActivityUserAvatar({ userId, userName }) {
  const [imageFailed, setImageFailed] = React.useState(!userId);
  const initial = userName?.slice(0, 1)?.toUpperCase() || "?";

  if (imageFailed) {
    return (
      <span className="activity-user-avatar activity-user-avatar-fallback" aria-hidden="true">
        {initial}
      </span>
    );
  }

  return (
    <img
      className="activity-user-avatar"
      src={`/proxy/Users/Images/Primary?id=${userId}&fillWidth=72&quality=72`}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setImageFailed(true)}
    />
  );
}

function getStoredColumnVisibility() {
  try {
    return { ...defaultColumnVisibility, ...JSON.parse(localStorage.getItem(activityColumnVisibilityKey) || "{}") };
  } catch {
    return defaultColumnVisibility;
  }
}

export default function ActivityTable(props) {
  let twelve_hr = false;
  try { twelve_hr = JSON.parse(localStorage.getItem("12hr") || "false"); } catch { twelve_hr = false; }
  const localization = localStorage.getItem("i18nextLng");
  const [data, setData] = React.useState(props.data ?? []);
  const pages = props.pageCount || 1;
  const isBusy = props.isBusy;

  const [rowSelection, setRowSelection] = React.useState({});
  const [pagination, setPagination] = React.useState({
    pageSize: 10,
    pageIndex: 0,
  });
  const [sorting, setSorting] = React.useState([{ id: "Date", desc: true }]);

  const [columnFilters, setColumnFilters] = React.useState([]);
  const [columnVisibility, setColumnVisibility] = React.useState(() => props.siloHistory
    ? { ...getStoredColumnVisibility(), Client: false, DeviceName: false, RemoteEndPoint: false, TotalPlays: false }
    : getStoredColumnVisibility());

  const [modalState, setModalState] = React.useState(false);
  const [modalData, setModalData] = React.useState();
  const handlePageChange = (updater) => {
    setPagination((old) => {
      const newPaginationState = typeof updater === "function" ? updater(old) : updater;
      const newPage = newPaginationState.pageIndex; // the table uses a 0-based index
      if (props.onPageChange) {
        props.onPageChange(newPage + 1);
      }
      return newPaginationState;
    });
  };

  //IP MODAL

  const ipv4Regex = new RegExp(
    /\b(?!(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168))(?:(?:2(?:[0-4][0-9]|5[0-5])|[0-1]?[0-9]?[0-9])\.){3}(?:(?:2([0-4][0-9]|5[0-5])|[0-1]?[0-9]?[0-9]))\b/
  );

  const [ipModalVisible, setIPModalVisible] = React.useState(false);
  const [confirmDeleteShow, setDeleteShow] = React.useState(false);
  const [ipAddressLookup, setIPAddressLookup] = React.useState();

  const isRemoteSession = (ipAddress) => {
    ipv4Regex.lastIndex = 0;
    if (ipv4Regex.test(ipAddress ?? ipAddressLookup)) {
      return true;
    }
    return false;
  };

  const openModal = (data) => {
    setModalData(data);
    setModalState(!modalState);
  };

  function showIPDataModal(ipAddress) {
    ipv4Regex.lastIndex = 0;
    setIPAddressLookup(ipAddress);
    if (!isRemoteSession) {
      return;
    }

    setIPModalVisible(true);
  }

  async function deleteActivity() {
    const url = `/api/deletePlaybackActivity`;

    axios
      .post(
        url,
        { ids: [...Object.keys(rowSelection)] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      )
      .then(() => {
        setData(data.filter((item) => !rowSelection[item.Id]));
        setRowSelection({});
      })
      .catch((error) => {
        console.log(error);
      });
  }

  // eslint-disable-next-line react/prop-types
  if (pagination.pageSize !== props.itemCount) {
    // eslint-disable-next-line react/prop-types
    setPagination({ pageIndex: 0, pageSize: props.itemCount });
  }

  const columns = [
    {
      accessorFn: (row) =>
        `${
          !row?.SeriesName
            ? row.NowPlayingItemName
            : row.SeriesName + " : S" + row.SeasonNumber + "E" + row.EpisodeNumber + " - " + row.NowPlayingItemName
      }`,
      field: "NowPlayingItemName",
      header: i18next.t("TITLE"),
      minSize: 360,
      grow: 1.6,
      cell: ({ row }) => {
        row = row.original;
        const title = !row.SeriesName
          ? row.NowPlayingItemName
          : row.SeriesName + " : S" + row.SeasonNumber + "E" + row.EpisodeNumber + " - " + row.NowPlayingItemName;
        const itemId = row.NowPlayingItemId || row.EpisodeId;

        const secondaryServer = props.siloHistory && props.serverId !== "primary";
        const mediaType = row.SiloMediaType || (row.SeriesName ? "Episode" : row.NowPlayingItemName ? "Movie" : "Media");
        const content = <span className="activity-title-media">
          <ActivityPoster itemId={itemId} title={title} disabled={secondaryServer} />
          <span className="activity-title-copy"><strong>{title || "Unknown item"}</strong><small>{mediaType}</small></span>
        </span>;
        if (!itemId) return <span className="activity-table-link activity-title-link">{content}</span>;
        return secondaryServer
          ? <Link to={`/silo-fleet/${encodeURIComponent(props.serverId)}/items/${encodeURIComponent(itemId)}`} className="activity-table-link activity-title-link">{content}</Link>
          : <Link to={`/libraries/item/${row.EpisodeId || row.NowPlayingItemId}`} className="activity-table-link activity-title-link">{content}</Link>;
      },
    },
    {
      accessorKey: "UserName",
      header: i18next.t("USER"),
      size: 190,
      cell: ({ row }) => {
        row = row.original;
        const content = <><ActivityUserAvatar userId={props.siloHistory ? null : row.UserId} userName={row.UserName} />
          <span>{row.UserName || "Unknown"}{row.ProfileName ? <small className="activity-profile-name">{row.ProfileName}</small> : null}</span></>;
        if (props.siloHistory && row.UserId) {
          const path = props.serverId !== "primary"
            ? `/silo-fleet/${encodeURIComponent(props.serverId)}/users/${encodeURIComponent(row.UserId)}`
            : `/silo/users/${encodeURIComponent(row.UserId)}`;
          return <Link to={path} className="activity-table-link activity-user-link">{content}</Link>;
        }
        return !row.UserId
          ? <span className="activity-table-link activity-user-link">{content}</span>
          : <Link to={`/users/${row.UserId}`} className="activity-table-link activity-user-link">{content}</Link>;
      },
    },
    {
      accessorKey: "Client",
      header: i18next.t("ACTIVITY_TABLE.CLIENT"),
      size: 160,
      cell: ({ row }) => {
        row = row.original;
        return row.Client ? <Link onClick={() => openModal(row)} className="activity-table-link activity-client-link">{row.Client}</Link> : <span>—</span>;
      },
    },
    {
      accessorKey: "DeviceName",
      header: i18next.t("ACTIVITY_TABLE.DEVICE"),
      size: 180,
      cell: ({ cell }) => <span className="activity-device-cell">{cell.getValue() || "-"}</span>,
    },
    {
      accessorKey: "PlayMethod",
      header: i18next.t("TRANSCODE"),
      size: 160,
      cell: ({ row }) => {
        row = row.original;
        const unavailableLabel = i18next.t("UNAVAILABLE");
        if (row.PlayMethod === "Transcode") {
          return (
            <Link onClick={() => openModal(row)} className="activity-method-pill is-transcode">
              <span>
                {i18next.t("TRANSCODE")}
                {row.TranscodingInfo ? (
                  <span>
                    {!row.TranscodingInfo.IsVideoDirect && <span> ({i18next.t("VIDEO")})</span>}
                    {!row.TranscodingInfo.IsAudioDirect && <span> ({i18next.t("AUDIO")})</span>}
                  </span>
                ) : (
                  ""
                )}
              </span>
            </Link>
          );
        } else if (row.PlayMethod === "DirectPlay") {
          return (
            <Link onClick={() => openModal(row)} className="activity-method-pill is-direct">
              {i18next.t("DIRECT")}{" "}
            </Link>
          );
        } else if (row.PlayMethod === "DirectStream") {
          return (
            <Link onClick={() => openModal(row)} className="activity-method-pill is-stream">
              {i18next.t("DIRECT_STREAM")}{" "}
            </Link>
          );
        } else {
          return (
            <Link
              onClick={() => openModal(row)}
              className="activity-method-pill is-empty"
              aria-label={unavailableLabel}
              title={unavailableLabel}
            >
              {unavailableLabel}
            </Link>
          );
        }
      },
    },
    {
      accessorFn: (row) => new Date(row.ActivityDateInserted),
      field: "ActivityDateInserted",
      header: i18next.t("DATE"),
      size: 170,
      filterVariant: "date-range",
      cell: ({ row }) => {
        const options = {
          day: "numeric",
          month: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          hour12: twelve_hr,
        };
        row = row.original;
        return <span className="activity-date-cell">{Intl.DateTimeFormat(localization, options).format(new Date(row.ActivityDateInserted))}</span>;
      },
    },
    {
      accessorKey: "RemoteEndPoint",
      header: i18next.t("ACTIVITY_TABLE.IP_ADDRESS"),
      size: 150,
      cell: ({ row }) => {
        row = row.original;
        if (
          isRemoteSession(row.RemoteEndPoint) &&
          (window.env?.JS_GEOLITE_ACCOUNT_ID ?? import.meta.env.JS_GEOLITE_ACCOUNT_ID) != undefined
        ) {
          return (
            <Link className="activity-table-link activity-ip-link" onClick={() => showIPDataModal(row.RemoteEndPoint)}>
              {row.RemoteEndPoint}
            </Link>
          );
        }
        return <span className="activity-ip-cell">{row.RemoteEndPoint || "-"}</span>;
      },
    },
    {
      accessorKey: "PlaybackDuration",
      header: i18next.t("ACTIVITY_TABLE.TOTAL_PLAYBACK"),
      size: 160,
      // filterFn: (row, id, filterValue) => formatTotalWatchTime(row.getValue(id)).startsWith(filterValue),
      filterVariant: "range",
      cell: ({ cell }) => <span className="activity-duration-cell">{formatTotalWatchTime(Math.round(Number(cell.getValue()) || 0)) || `0 ${i18next.t("UNITS.SECONDS").toLowerCase()}`}</span>,
    },
    ...(props.siloHistory ? [{
      accessorKey: "Completed",
      header: "Status",
      size: 120,
      enableColumnFilter: false,
      cell: ({ cell }) => <span className={`activity-completion ${cell.getValue() ? "is-complete" : "is-incomplete"}`}>{cell.getValue() ? "Completed" : "Stopped early"}</span>,
    }] : []),
    {
      accessorFn: (row) => Number(row.TotalPlays ?? 1),
      field: "TotalPlays",
      header: i18next.t("TOTAL_PLAYS"),
      filterFn: "betweenInclusive",
      size: 110,

      cell: ({ cell }) => <span className="activity-plays-cell">{cell.getValue() ?? 1}</span>,
    },
  ].filter((column) => !props.siloHistory || !["Client", "DeviceName", "RemoteEndPoint", "TotalPlays"].includes(column.accessorKey || column.field));

  const fieldMap = columns.map((column) => {
    return { accessorKey: column.accessorKey ?? column.field, header: column.header };
  });

  const handleSortingChange = (updater) => {
    setSorting((old) => {
      const newSortingState = typeof updater === "function" ? updater(old) : updater;
      const column = newSortingState.length > 0 ? newSortingState[0].id : "Date";
      const desc = newSortingState.length > 0 ? newSortingState[0].desc : true;
      if (props.onSortChange) {
        props.onSortChange({ column: fieldMap.find((field) => field.header == column)?.accessorKey ?? column, desc: desc });
      }
      return newSortingState;
    });
  };

  const handleFilteringChange = (updater) => {
    setColumnFilters((old) => {
      const newFilterState = typeof updater === "function" ? updater(old) : updater;

      const modifiedFilterState = newFilterState.map((filter) => ({ ...filter }));

      modifiedFilterState.map((filter) => {
        filter.field = fieldMap.find((field) => field.header == filter.id)?.accessorKey ?? filter.id;
        delete filter.id;
        if (Array.isArray(filter.value)) {
          filter.min = filter.value[0];
          filter.max = filter.value[1];
          delete filter.value;
        } else {
          const val = filter.value;
          delete filter.value;
          filter.value = val;
        }

        return filter;
      });

      if (props.onFilterChange) {
        props.onFilterChange(modifiedFilterState);
      }
      return newFilterState;
    });
  };

  const handleColumnVisibilityChange = (updater) => {
    setColumnVisibility((currentVisibility) => {
      const nextVisibility = typeof updater === "function" ? updater(currentVisibility) : updater;
      localStorage.setItem(activityColumnVisibilityKey, JSON.stringify(nextVisibility));
      return nextVisibility;
    });
  };

  useEffect(() => {
    setData(props.data);
  }, [props.data]);

  const localizationStrings = {
    ...defaultDataTableLocalization,
    expand: i18next.t("ACTIVITY_TABLE.EXPAND"),
    collapse: i18next.t("ACTIVITY_TABLE.COLLAPSE"),
    sortByColumnAsc: `${i18next.t("ACTIVITY_TABLE.SORT_BY")} {column} - ${i18next.t("ACTIVITY_TABLE.ASCENDING")}`,
    sortByColumnDesc: `${i18next.t("ACTIVITY_TABLE.SORT_BY")} {column} - ${i18next.t("ACTIVITY_TABLE.DESCENDING")}`,
    clearFilter: i18next.t("ACTIVITY_TABLE.CLEAR_FILTER"),
    clearSort: i18next.t("ACTIVITY_TABLE.CLEAR_SORT"),
    filterByColumn: `${i18next.t("ACTIVITY_TABLE.FILTER_BY")} {column}`,
    toggleSelectAll: i18next.t("ACTIVITY_TABLE.TOGGLE_SELECT_ALL"),
    toggleSelectRow: i18next.t("ACTIVITY_TABLE.TOGGLE_SELECT_ROW"),
    columnActions: i18next.t("ACTIVITY_TABLE.COLUMN_ACTIONS"),
  };

  const table = useDataTable({
    columns: [
      createExpandColumn({
        localization: localizationStrings,
        onToggle: (row, tableInstance) => tableInstance.setExpanded({ [row.id]: !row.getIsExpanded() }),
      }),
      createSelectColumn({ localization: localizationStrings, enableBatchRowSelection: true }),
      ...columns,
    ],
    data,
    enableExpanding: true,
    enableFilters: !props.siloHistory,
    enableSorting: !props.siloHistory,
    manualFiltering: !props.siloHistory,
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: handleFilteringChange,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    manualPagination: !props.cursorMode,
    manualSorting: !props.siloHistory,
    autoResetPageIndex: false,
    pageCount: pages,
    enableHiding: true,
    enableRowSelection: (row) => Boolean(!props.readOnly && row.original.Id),
    enableMultiRowSelection: true,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection, pagination, sorting, columnFilters, columnVisibility },
    filterFromLeafRows: true,
    getSubRows: (row) => {
      return Array.isArray(row.results) && row.results.length > 1 ? row.results : undefined;
    },
    onPaginationChange: handlePageChange,
    getRowId: (row) => row.Id,
  });

  const selectedCount = Object.keys(rowSelection).length;
  const toolbar = (
    <div className="activity-table-toolbar">
      {!props.readOnly && selectedCount > 0 ? (
        <div className="activity-table-selection">
          <h5>{i18next.t("X_ROWS_SELECTED").replace("{ROWS}", selectedCount)}</h5>
          <Button
            variant="destructive"
            onClick={() => {
              setDeleteShow(true);
            }}
          >
            <Trans i18nKey="DELETE" />
          </Button>
        </div>
      ) : (
        <span className="activity-table-toolbar-title">Activity view</span>
      )}
      <div className="activity-table-actions">
        <span className="activity-table-actions-label">Columns</span>
        <DataTableColumnsMenu table={table} localization={localizationStrings} />
      </div>
    </div>
  );

  return (
    <>
      {isBusy && <BusyLoader />}

      <IpInfoModal show={ipModalVisible} onHide={() => setIPModalVisible(false)} ipAddress={ipAddressLookup} />
      <AlertDialog
        open={confirmDeleteShow}
        onOpenChange={(open) => {
          if (!open) setDeleteShow(false);
        }}
      >
        <AlertDialogContent className="activity-delete-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans i18nKey="ITEM_INFO.CONFIRM_ACTION" />
              {" - "}
              {i18next.t("X_ROWS_SELECTED").replace("{ROWS}", selectedCount)}
            </AlertDialogTitle>
            <AlertDialogDescription>{i18next.t("PURGE_OPTIONS.PURGE_ACTIVITY")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                deleteActivity().then(() => setDeleteShow(false));
              }}
            >
              <Trans i18nKey="DELETE" />
            </Button>
            <Button
              onClick={() => {
                setDeleteShow(false);
              }}
            >
              <Trans i18nKey="CLOSE" />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={modalState} onOpenChange={(open) => !open && setModalState(false)}>
        <DialogContent className="stream-info-modal" showCloseButton={false}>
          <DialogHeader className="stream-info-modal-header">
            <DialogTitle className="stream-info-modal-title">
              <Trans i18nKey="ACTIVITY_TABLE.MODAL.HEADER" />
              {": "}
              {!modalData?.SeriesName
                ? modalData?.NowPlayingItemName
                : modalData?.SeriesName + " - " + modalData?.NowPlayingItemName}{" "}
              ({modalData?.UserName})
            </DialogTitle>
            <DialogDescription className="tw:sr-only">
              <Trans i18nKey="ACTIVITY_TABLE.MODAL.HEADER" />
            </DialogDescription>
          </DialogHeader>
          <StreamInfo data={modalData} />
          <DialogFooter className="stream-info-modal-footer">
            <Button variant="outline" onClick={() => setModalState(false)}>
              <Trans i18nKey="CLOSE" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DataTable
        table={table}
        localization={localizationStrings}
        className="activity-data-table"
        headClassName="activity-data-table-head"
        cellClassName="activity-data-table-cell"
        topToolbar={toolbar}
        emptyState={
          <span style={{ textAlign: "center", fontStyle: "italic", color: "var(--barracks-text-muted-raised)" }} className="d-block py-5">
            <Trans i18nKey="ERROR_MESSAGES.NO_ACTIVITY" />
          </span>
        }
      />
      {!props.cursorMode && (
        <DataTablePagination table={table} localization={localizationStrings} className="activity-table-pagination" />
      )}
    </>
  );
}
