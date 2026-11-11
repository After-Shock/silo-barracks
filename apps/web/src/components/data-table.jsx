/* eslint-disable react/prop-types */
// Reusable data table on TanStack Table + the shadcn Table primitives.
// Feature set mirrors what the app used from material-react-table: sorting,
// per-column filters (text, number range, date range) in a header popover,
// column visibility, column actions menu, row selection (with shift ranges),
// row expansion (sub rows), and page-number pagination.
import * as React from "react";
import { flexRender } from "@tanstack/react-table";

import ArrowDownLineIcon from "remixicon-react/ArrowDownLineIcon";
import ArrowLeftSLineIcon from "remixicon-react/ArrowLeftSLineIcon";
import ArrowRightSLineIcon from "remixicon-react/ArrowRightSLineIcon";
import ArrowUpLineIcon from "remixicon-react/ArrowUpLineIcon";
import CloseLineIcon from "remixicon-react/CloseLineIcon";
import EyeOffLineIcon from "remixicon-react/EyeOffLineIcon";
import FilterLineIcon from "remixicon-react/FilterLineIcon";
import More2FillIcon from "remixicon-react/More2FillIcon";
import SkipBackLineIcon from "remixicon-react/SkipBackLineIcon";
import SkipForwardLineIcon from "remixicon-react/SkipForwardLineIcon";
import SortAscIcon from "remixicon-react/SortAscIcon";
import SortDescIcon from "remixicon-react/SortDescIcon";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { defaultDataTableLocalization, fill, getPageItems, headerLabel, isEmptyFilterValue } from "@/components/data-table-utils";

export {
  EXPAND_COLUMN_ID,
  SELECT_COLUMN_ID,
  createExpandColumn,
  createSelectColumn,
  dataTableFilterFns,
  defaultDataTableLocalization,
  useDataTable,
} from "@/components/data-table-utils";

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

function useDebouncedCallback(callback, delay) {
  const timer = React.useRef();
  const latest = React.useRef(callback);
  latest.current = callback;
  React.useEffect(() => () => clearTimeout(timer.current), []);
  return React.useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(...args), delay);
  }, [delay]);
}

function filterVariantOf(column) {
  const variant = column.columnDef.meta?.filterVariant ?? column.columnDef.filterVariant;
  if (variant) return variant;
  const filterFn = column.columnDef.filterFn;
  if (["between", "betweenInclusive", "inNumberRange"].includes(filterFn)) return "range";
  return "text";
}

function TextFilter({ column, localization, label }) {
  const [value, setValue] = React.useState(column.getFilterValue() ?? "");
  const commit = useDebouncedCallback((next) => column.setFilterValue(next === "" ? undefined : next), 300);
  return (
    <div className="tw:flex tw:items-center tw:gap-1">
      <Input
        autoFocus
        value={value}
        placeholder={fill(localization.filterByColumn, label)}
        aria-label={fill(localization.filterByColumn, label)}
        className="tw:text-sm"
        onChange={(event) => {
          setValue(event.target.value);
          commit(event.target.value);
        }}
      />
      {value !== "" && (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={localization.clearFilter}
          onClick={() => { setValue(""); column.setFilterValue(undefined); }}>
          <CloseLineIcon />
        </Button>
      )}
    </div>
  );
}

function RangeFilter({ column, localization, label }) {
  const initial = column.getFilterValue() ?? ["", ""];
  const [range, setRange] = React.useState([initial[0] ?? "", initial[1] ?? ""]);
  const commit = useDebouncedCallback((next) => column.setFilterValue(isEmptyFilterValue(next) ? undefined : next), 300);
  const update = (index, value) => {
    const next = [...range];
    next[index] = value;
    setRange(next);
    commit(next);
  };
  return (
    <div className="tw:grid tw:grid-cols-[1fr_1fr_auto] tw:items-center tw:gap-2">
      <Input autoFocus type="number" value={range[0]} placeholder={localization.min} aria-label={`${label} ${localization.min}`} className="tw:text-sm" onChange={(event) => update(0, event.target.value)} />
      <Input type="number" value={range[1]} placeholder={localization.max} aria-label={`${label} ${localization.max}`} className="tw:text-sm" onChange={(event) => update(1, event.target.value)} />
      <Button type="button" variant="ghost" size="icon-sm" aria-label={localization.clearFilter} disabled={isEmptyFilterValue(range)}
        onClick={() => { setRange(["", ""]); column.setFilterValue(undefined); }}>
        <CloseLineIcon />
      </Button>
    </div>
  );
}

function DateRangeFilter({ column, localization, formatDate }) {
  const [from, to] = column.getFilterValue() ?? [];
  const selected = from || to ? { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined } : undefined;
  const format = (date) => (date ? (formatDate ? formatDate(date) : new Date(date).toLocaleDateString()) : "—");
  return (
    <div className="tw:grid tw:gap-2">
      <div className="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:text-sm">
        <span><span className="tw:text-muted-raised">{localization.from}: </span>{format(from)}</span>
        <span><span className="tw:text-muted-raised">{localization.to}: </span>{format(to)}</span>
      </div>
      <Calendar
        mode="range"
        selected={selected}
        defaultMonth={selected?.from ?? selected?.to}
        onSelect={(next) => {
          const value = [next?.from, next?.to];
          column.setFilterValue(isEmptyFilterValue(value) ? undefined : value);
        }}
        className="tw:p-0"
      />
      <Button type="button" variant="secondary" size="sm" disabled={!selected} onClick={() => column.setFilterValue(undefined)}>
        {localization.clearFilter}
      </Button>
    </div>
  );
}

function ColumnFilter({ column, localization, formatDate }) {
  const label = headerLabel(column);
  const variant = filterVariantOf(column);
  if (variant === "date-range") return <DateRangeFilter column={column} localization={localization} formatDate={formatDate} />;
  if (variant === "range") return <RangeFilter column={column} localization={localization} label={label} />;
  return <TextFilter column={column} localization={localization} label={label} />;
}

// Three-column glyph (same shape as the "view column" icon the old table used).
function ColumnsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M14.67 5v14H9.33V5zm1 14H21V5h-5.33zm-7.34 0V5H3v14z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function ColumnActionsMenu({ column, table, localization, onOpenFilter }) {
  const label = headerLabel(column);
  const canSort = column.getCanSort();
  const canFilter = column.getCanFilter();
  const sorted = column.getIsSorted();
  const filtered = !isEmptyFilterValue(column.getFilterValue());
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-xs" className="data-table-column-actions tw:rounded-full tw:opacity-30 tw:hover:opacity-100 tw:data-[state=open]:opacity-100" aria-label={localization.columnActions}>
              <More2FillIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{localization.columnActions}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="data-table-menu">
        {canSort && (
          <>
            <DropdownMenuItem disabled={!sorted} onSelect={() => column.clearSorting()}>
              <CloseLineIcon /> {localization.clearSort}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={sorted === "asc"} onSelect={() => column.toggleSorting(false)}>
              <SortAscIcon /> {fill(localization.sortByColumnAsc, label)}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={sorted === "desc"} onSelect={() => column.toggleSorting(true)}>
              <SortDescIcon /> {fill(localization.sortByColumnDesc, label)}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {canFilter && (
          <>
            <DropdownMenuItem disabled={!filtered} onSelect={() => column.setFilterValue(undefined)}>
              <CloseLineIcon /> {localization.clearFilter}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpenFilter(column.id)}>
              <FilterLineIcon /> {fill(localization.filterByColumn, label)}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {column.getCanHide() && (
          <DropdownMenuItem onSelect={() => column.toggleVisibility(false)}>
            <EyeOffLineIcon /> {fill(localization.hideColumn, label)}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => table.toggleAllColumnsVisible(true)}>
          <ColumnsIcon /> {localization.showAllColumns}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DataTableHeadContent({ header, table, localization, filterOpen, setFilterOpen, enableColumnActions, formatDate }) {
  const { column } = header;
  if (header.isPlaceholder) return null;
  const rendered = flexRender(column.columnDef.header, header.getContext());
  if (column.columnDef.meta?.isDisplayColumn) return rendered;

  const label = headerLabel(column);
  const canSort = column.getCanSort();
  const canFilter = column.getCanFilter();
  const sorted = column.getIsSorted();
  const filtered = !isEmptyFilterValue(column.getFilterValue());
  const nextSort = column.getNextSortingOrder();

  return (
    <Popover open={filterOpen} onOpenChange={(open) => setFilterOpen(open ? column.id : null)}>
      <PopoverAnchor asChild>
        <div className="data-table-head-content tw:flex tw:min-w-0 tw:items-center tw:gap-0.5">
          {canSort ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="data-table-sort-button tw:inline-flex tw:min-w-0 tw:cursor-pointer tw:items-center tw:gap-1 tw:border-0 tw:bg-transparent tw:p-0 tw:text-inherit tw:uppercase"
                  onClick={column.getToggleSortingHandler()}
                  aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
                >
                  <span className="tw:truncate">{rendered}</span>
                  <span className={cn("data-table-sort-icon tw:inline-flex tw:size-3.5 tw:shrink-0 tw:[&_svg]:size-3.5", !sorted && "tw:opacity-0 tw:group-hover/head:opacity-40")}>
                    {sorted === "asc" ? <ArrowUpLineIcon /> : <ArrowDownLineIcon />}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {sorted
                  ? fill(sorted === "asc" ? localization.sortedByColumnAsc : localization.sortedByColumnDesc, label)
                  : nextSort === "desc"
                    ? fill(localization.sortByColumnDesc, label)
                    : fill(localization.sortByColumnAsc, label)}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="tw:truncate">{rendered}</span>
          )}
          {canFilter && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className={cn("data-table-filter-button tw:rounded-full", filtered ? "tw:opacity-100" : "tw:opacity-0 tw:group-hover/head:opacity-40 tw:focus-visible:opacity-100")}
              aria-label={fill(localization.filterByColumn, label)}
              aria-pressed={filtered}
              onClick={() => setFilterOpen(filterOpen ? null : column.id)}
            >
              <FilterLineIcon />
            </Button>
          )}
          {enableColumnActions && (
            <ColumnActionsMenu column={column} table={table} localization={localization} onOpenFilter={(id) => setTimeout(() => setFilterOpen(id), 0)} />
          )}
        </div>
      </PopoverAnchor>
      {canFilter && (
        <PopoverContent align="start" className="data-table-filter-popover tw:w-auto tw:min-w-64 tw:p-3">
          <ColumnFilter column={column} localization={localization} formatDate={formatDate} />
        </PopoverContent>
      )}
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar pieces                                                      */
/* ------------------------------------------------------------------ */

const menuTextButton = "tw:cursor-pointer tw:rounded-sm tw:border-0 tw:bg-transparent tw:px-2 tw:py-1.5 tw:text-sm tw:font-medium tw:text-card-foreground tw:uppercase tw:hover:bg-accent tw:hover:text-accent-foreground";

export function DataTableColumnsMenu({ table, localization = defaultDataTableLocalization, className, align = "end" }) {
  const columns = table.getAllLeafColumns();
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" className={cn("data-table-columns-button tw:size-[29px] tw:rounded-full", className)} aria-label={localization.showHideColumns}>
              <ColumnsIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{localization.showHideColumns}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align={align} className="data-table-menu tw:min-w-44">
        <div className="tw:flex tw:items-center tw:justify-between tw:gap-4 tw:px-1 tw:pb-1">
          <button type="button" className={menuTextButton}
            onClick={() => table.getAllLeafColumns().forEach((column) => column.getCanHide() && column.toggleVisibility(false))}>
            {localization.hideAll}
          </button>
          <button type="button" className={menuTextButton} onClick={() => table.toggleAllColumnsVisible(true)}>
            {localization.showAll}
          </button>
        </div>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuItem
            key={column.id}
            disabled={!column.getCanHide()}
            className="tw:gap-3"
            onSelect={(event) => {
              event.preventDefault();
              column.toggleVisibility();
            }}
          >
            <Switch checked={column.getIsVisible()} tabIndex={-1} aria-hidden="true" className="tw:pointer-events-none" />
            {headerLabel(column)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DataTablePagination({ table, localization = defaultDataTableLocalization, showFirstLastButtons = true, pageSizeOptions, className }) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = Math.max(table.getPageCount(), 1);
  const page = pageIndex + 1;
  const itemClass = "data-table-page-item tw:h-[32px] tw:min-w-[32px] tw:rounded-full tw:px-[6px] tw:text-[13px] tw:leading-none";
  return (
    <nav className={cn("data-table-pagination tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-1.5", className)} aria-label="pagination navigation">
      {pageSizeOptions?.length > 0 && (
        <label className="tw:mr-2 tw:flex tw:items-center tw:gap-2 tw:text-sm">
          <span>{localization.rowsPerPage}</span>
          <select className="data-table-page-size tw:rounded-md tw:border tw:border-border-strong tw:bg-surface-interactive tw:px-2 tw:py-1 tw:text-secondary-foreground"
            value={pageSize} onChange={(event) => table.setPageSize(Number(event.target.value))}>
            {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      )}
      {showFirstLastButtons && (
        <Button type="button" variant="outline" size="sm" className={itemClass} aria-label={localization.goToFirstPage} disabled={page <= 1} onClick={() => table.firstPage()}>
          <SkipBackLineIcon />
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" className={itemClass} aria-label={localization.goToPreviousPage} disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
        <ArrowLeftSLineIcon />
      </Button>
      {getPageItems(page, pageCount).map((item) =>
        typeof item === "number" ? (
          <Button
            key={item}
            type="button"
            variant="outline"
            size="sm"
            className={itemClass}
            aria-current={item === page ? "page" : undefined}
            aria-pressed={item === page}
            aria-label={item === page ? `page ${item}` : String(localization.goToPage).replace("{page}", item)}
            onClick={() => table.setPageIndex(item - 1)}
          >
            {item}
          </Button>
        ) : (
          <span key={item} className="tw:min-w-[32px] tw:text-center tw:text-[13px]">…</span>
        )
      )}
      <Button type="button" variant="outline" size="sm" className={itemClass} aria-label={localization.goToNextPage} disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
        <ArrowRightSLineIcon />
      </Button>
      {showFirstLastButtons && (
        <Button type="button" variant="outline" size="sm" className={itemClass} aria-label={localization.goToLastPage} disabled={page >= pageCount} onClick={() => table.lastPage()}>
          <SkipForwardLineIcon />
        </Button>
      )}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

/**
 * Renders a TanStack table instance.
 * Column options: `size` (relative width), `meta.headerClassName`, `meta.cellClassName`,
 * `meta.filterVariant` ("text" | "range" | "date-range"), `meta.label`.
 */
export function DataTable({
  table,
  localization = defaultDataTableLocalization,
  className,
  tableClassName,
  headClassName,
  cellClassName,
  rowClassName,
  minWidth,
  topToolbar,
  emptyState,
  enableColumnActions = true,
  formatDate,
}) {
  const [filterOpenId, setFilterOpenId] = React.useState(null);
  const leafColumns = table.getVisibleLeafColumns();
  const totalSize = leafColumns.reduce((sum, column) => sum + column.getSize(), 0) || 1;
  const rows = table.getRowModel().rows;

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("data-table tw:overflow-hidden", className)}>
        {topToolbar}
        <Table className={cn("data-table-table tw:table-fixed tw:border-separate tw:border-spacing-0", tableClassName)} style={minWidth ? { width: `max(100%, ${typeof minWidth === "number" ? `${minWidth}px` : minWidth})` } : undefined}>
          <colgroup>
            {leafColumns.map((column) => (
              <col key={column.id} style={{ width: `${(column.getSize() / totalSize) * 100}%` }} />
            ))}
          </colgroup>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="tw:hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className={cn("tw:group/head", headClassName, header.column.columnDef.meta?.headerClassName)}
                    aria-sort={header.column.getIsSorted() ? (header.column.getIsSorted() === "asc" ? "ascending" : "descending") : undefined}
                  >
                    <DataTableHeadContent
                      header={header}
                      table={table}
                      localization={localization}
                      filterOpen={filterOpenId === header.column.id}
                      setFilterOpen={setFilterOpenId}
                      enableColumnActions={enableColumnActions}
                      formatDate={formatDate}
                    />
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="tw:hover:bg-transparent">
                <TableCell colSpan={leafColumns.length} className={cn("tw:text-center", cellClassName)}>
                  {emptyState ?? localization.noRecordsToDisplay}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  data-depth={row.depth || undefined}
                  className={cn(typeof rowClassName === "function" ? rowClassName(row) : rowClassName)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(cellClassName, cell.column.columnDef.meta?.cellClassName)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
