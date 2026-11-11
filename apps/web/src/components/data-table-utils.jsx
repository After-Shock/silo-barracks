/* eslint-disable react/prop-types */
// Non-component helpers for components/data-table.jsx: the table hook, filter
// functions, default strings and the expand/select display columns.
import {
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { RiAddCircleFill, RiIndeterminateCircleFill } from "@remixicon/react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export const EXPAND_COLUMN_ID = "data-table-expand";
export const SELECT_COLUMN_ID = "data-table-select";

export const defaultDataTableLocalization = {
  expand: "Expand",
  collapse: "Collapse",
  sortByColumnAsc: "Sort by {column} ascending",
  sortByColumnDesc: "Sort by {column} descending",
  sortedByColumnAsc: "Sorted by {column} ascending",
  sortedByColumnDesc: "Sorted by {column} descending",
  clearFilter: "Clear filter",
  clearSort: "Clear sort",
  filterByColumn: "Filter by {column}",
  hideColumn: "Hide {column} column",
  showAllColumns: "Show all columns",
  showHideColumns: "Show/Hide columns",
  hideAll: "Hide all",
  showAll: "Show all",
  toggleSelectAll: "Toggle select all",
  toggleSelectRow: "Toggle select row",
  columnActions: "Column Actions",
  min: "Min",
  max: "Max",
  from: "From",
  to: "To",
  goToFirstPage: "Go to first page",
  goToPreviousPage: "Go to previous page",
  goToNextPage: "Go to next page",
  goToLastPage: "Go to last page",
  goToPage: "Go to page {page}",
  rowsPerPage: "Rows per page",
  noRecordsToDisplay: "No records to display",
};

export function fill(template, column) {
  return String(template ?? "").replace("{column}", column);
}

export function headerLabel(column) {
  const header = column.columnDef.meta?.label ?? column.columnDef.header;
  return typeof header === "string" ? header : column.id;
}

export function isEmptyFilterValue(value) {
  if (value === undefined || value === null || value === "") return true;
  return Array.isArray(value) && value.every((part) => part === undefined || part === null || part === "");
}

// Filter functions material-react-table provided by name; columns may still reference them.
export const dataTableFilterFns = {
  betweenInclusive: (row, columnId, [min, max] = []) => {
    const value = Number(row.getValue(columnId));
    const lower = min === "" || min === undefined || min === null ? -Infinity : Number(min);
    const upper = max === "" || max === undefined || max === null ? Infinity : Number(max);
    return value >= lower && value <= upper;
  },
  dateRange: (row, columnId, [from, to] = []) => {
    const value = new Date(row.getValue(columnId)).getTime();
    if (from && value < new Date(from).getTime()) return false;
    if (to && value > new Date(to).getTime() + 86399999) return false;
    return true;
  },
};
dataTableFilterFns.betweenInclusive.autoRemove = isEmptyFilterValue;
dataTableFilterFns.dateRange.autoRemove = isEmptyFilterValue;

/**
 * useReactTable with the row models wired up for whichever parts are not manual.
 */
export function useDataTable({ manualSorting, manualFiltering, manualPagination, filterFns, ...options }) {
  // Like material-react-table: no client-side sort/filter models when the feature is off.
  const clientSorting = !manualSorting && options.enableSorting !== false;
  const clientFiltering = !manualFiltering && options.enableFilters !== false;
  return useReactTable({
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    ...(clientSorting ? { getSortedRowModel: getSortedRowModel() } : {}),
    ...(clientFiltering ? { getFilteredRowModel: getFilteredRowModel() } : {}),
    ...(manualPagination ? {} : { getPaginationRowModel: getPaginationRowModel() }),
    manualSorting,
    manualFiltering,
    manualPagination,
    filterFns: { ...dataTableFilterFns, ...filterFns },
    ...options,
  });
}

/* ------------------------------------------------------------------ */
/* Display columns                                                     */
/* ------------------------------------------------------------------ */

export function createExpandColumn({ localization = defaultDataTableLocalization, onToggle, size = 95 } = {}) {
  return {
    id: EXPAND_COLUMN_ID,
    header: localization.expand,
    size,
    enableSorting: false,
    enableColumnFilter: false,
    enableHiding: false,
    meta: { label: localization.expand, isDisplayColumn: true },
    cell: ({ row, table }) => {
      const expanded = row.getIsExpanded();
      const canExpand = row.getCanExpand();
      return (
        <span className="data-table-expand-cell" style={{ paddingLeft: row.depth ? `${row.depth * 16}px` : undefined }}>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="data-table-expand-button tw:rounded-full tw:transition-transform tw:disabled:border-transparent tw:disabled:bg-transparent tw:disabled:opacity-30"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(-90deg)" }}
            disabled={!canExpand}
            aria-label={expanded ? localization.collapse : localization.expand}
            aria-expanded={canExpand ? expanded : undefined}
            onClick={() => (onToggle ? onToggle(row, table) : row.toggleExpanded())}
          >
            {expanded ? <RiIndeterminateCircleFill /> : <RiAddCircleFill />}
          </Button>
        </span>
      );
    },
  };
}

export function createSelectColumn({ localization = defaultDataTableLocalization, enableBatchRowSelection = true, size = 55 } = {}) {
  const lastSelected = { index: null };
  return {
    id: SELECT_COLUMN_ID,
    header: ({ table }) => (
      <Checkbox
        className="data-table-checkbox"
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(Boolean(checked))}
        aria-label={localization.toggleSelectAll}
      />
    ),
    size,
    enableSorting: false,
    enableColumnFilter: false,
    enableHiding: false,
    meta: { label: "Select", isDisplayColumn: true },
    cell: ({ row, table }) => (
      <Checkbox
        className="data-table-checkbox"
        checked={row.getIsSelected() ? true : row.getIsSomeSelected() ? "indeterminate" : false}
        disabled={!row.getCanSelect()}
        aria-label={localization.toggleSelectRow}
        onClick={(event) => {
          const rows = table.getRowModel().rows;
          const index = rows.findIndex((candidate) => candidate.id === row.id);
          if (enableBatchRowSelection && event.shiftKey && lastSelected.index !== null && table.options.enableMultiRowSelection !== false) {
            event.preventDefault();
            const value = !row.getIsSelected();
            const [start, end] = [Math.min(lastSelected.index, index), Math.max(lastSelected.index, index)];
            rows.slice(start, end + 1).forEach((candidate) => {
              if (candidate.getCanSelect()) candidate.toggleSelected(value);
            });
          }
          lastSelected.index = index;
        }}
        onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
      />
    ),
  };
}

// Page list in the same shape as MUI's usePagination (boundary + sibling pages with ellipses).
export function getPageItems(page, count, siblingCount = 1, boundaryCount = 1) {
  const range = (start, end) => Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index);
  const startPages = range(1, Math.min(boundaryCount, count));
  const endPages = range(Math.max(count - boundaryCount + 1, boundaryCount + 1), count);
  const siblingsStart = Math.max(Math.min(page - siblingCount, count - boundaryCount - siblingCount * 2 - 1), boundaryCount + 2);
  const siblingsEnd = Math.min(Math.max(page + siblingCount, boundaryCount + siblingCount * 2 + 2), endPages.length > 0 ? endPages[0] - 2 : count - 1);
  return [
    ...startPages,
    ...(siblingsStart > boundaryCount + 2 ? ["start-ellipsis"] : boundaryCount + 1 < count - boundaryCount ? [boundaryCount + 1] : []),
    ...range(siblingsStart, siblingsEnd),
    ...(siblingsEnd < count - boundaryCount - 1 ? ["end-ellipsis"] : count - boundaryCount > boundaryCount ? [count - boundaryCount] : []),
    ...endPages,
  ];
}
