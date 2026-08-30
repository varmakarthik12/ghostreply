import React, { useState, useMemo } from "react";
import {
  Search,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Download,
} from "lucide-react";
import Spinner from "./Spinner";

export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  error = null,
  searchPlaceholder = "Search records…",
  searchKeys = [], // keys to search in each object
  defaultSortKey = null,
  defaultSortDir = "asc",
  pageSizeOptions = [10, 25, 50, 100],
  defaultPageSize = 25,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  idKey = "id",
  emptyIcon: EmptyIcon = Inbox,
  emptyTitle = "No records found",
  emptyDescription = "There are no records matching your current criteria.",
  emptyAction = null,
  toolbarActions = null,
  filterControls = null,
  onRowClick = null,
  className = "",
  style = {},
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortDir, setSortDir] = useState(defaultSortDir);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // ── 1. Search Filtering ──
  const filteredData = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    if (!search.trim()) return data;

    const term = search.toLowerCase();
    return data.filter((item) => {
      if (!item) return false;
      // If searchKeys specified, search only those
      if (searchKeys.length > 0) {
        return searchKeys.some((k) => {
          const val = item[k];
          return val !== null && val !== undefined && String(val).toLowerCase().includes(term);
        });
      }
      // Otherwise search all string/number properties
      return Object.values(item).some((val) => {
        if (val === null || val === undefined) return false;
        if (typeof val === "object") return false;
        return String(val).toLowerCase().includes(term);
      });
    });
  }, [data, search, searchKeys]);

  // ── 2. Sorting ──
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [filteredData, sortKey, sortDir]);

  // ── 3. Pagination ──
  const totalItems = sortedData.length;
  const isAll = pageSize === -1;
  const totalPages = isAll ? 1 : Math.ceil(totalItems / pageSize) || 1;
  const currentPage = Math.min(page, totalPages);

  const paginatedData = useMemo(() => {
    if (isAll) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize, isAll]);

  // ── Sorting Toggle ──
  const handleSort = (key) => {
    if (!key) return;
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else {
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // ── Selection Handlers ──
  const allCurrentIds = paginatedData.map((d) => d[idKey]);
  const isAllSelected =
    allCurrentIds.length > 0 &&
    allCurrentIds.every((id) => selectedIds.includes(id));
  const isSomeSelected =
    allCurrentIds.some((id) => selectedIds.includes(id)) && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      const next = selectedIds.filter((id) => !allCurrentIds.includes(id));
      onSelectionChange?.(next);
    } else {
      const next = Array.from(new Set([...selectedIds, ...allCurrentIds]));
      onSelectionChange?.(next);
    }
  };

  const toggleRow = (id, e) => {
    e?.stopPropagation();
    if (selectedIds.includes(id)) {
      onSelectionChange?.(selectedIds.filter((x) => x !== id));
    } else {
      onSelectionChange?.([...selectedIds, id]);
    }
  };

  // ── Export to CSV ──
  const exportCSV = () => {
    if (!sortedData.length) return;
    const headers = columns.map((c) => (typeof c.header === "string" ? c.header : c.key || ""));
    const rows = sortedData.map((row) =>
      columns.map((c) => {
        const val = row[c.key];
        return `"${String(val ?? "").replace(/"/g, '""')}"`;
      })
    );
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`table-container ${className}`} style={style}>
      {/* ── Toolbar ── */}
      <div className="table-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, flexWrap: "wrap" }}>
          <div className="table-search-box">
            <Search className="table-search-icon" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={searchPlaceholder}
            />
            {search && (
              <button
                className="table-search-clear"
                onClick={() => setSearch("")}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {filterControls}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {toolbarActions}
          {sortedData.length > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={exportCSV}
              title="Export CSV"
            >
              <Download size={14} />
              <span className="mobile-hide">Export</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="alert alert-error" style={{ margin: 12 }}>
          {error}
        </div>
      )}

      {/* ── Table Scroll Area ── */}
      <div className="table-scroll-area">
        <table className="modern-table">
          <thead>
            <tr>
              {selectable && (
                <th style={{ width: 44, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeSelected;
                    }}
                    onChange={toggleSelectAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
              )}
              {columns.map((col, idx) => {
                const isSortable = col.sortable !== false && col.key;
                const isCurrentSort = sortKey === col.key;
                return (
                  <th
                    key={col.key || idx}
                    className={isSortable ? "sortable" : ""}
                    onClick={() => isSortable && handleSort(col.key)}
                    style={{ width: col.width, minWidth: col.minWidth, ...col.headerStyle }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{col.header}</span>
                      {isSortable && (
                        <span style={{ color: isCurrentSort ? "var(--primary)" : "var(--text-subtle)", display: "inline-flex" }}>
                          {isCurrentSort ? (
                            sortDir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                          ) : (
                            <ChevronsUpDown size={13} style={{ opacity: 0.4 }} />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              // ── Skeleton Loader ──
              Array.from({ length: Math.min(pageSize > 0 ? pageSize : 5, 5) }).map((_, rIdx) => (
                <tr key={rIdx}>
                  {selectable && (
                    <td style={{ textAlign: "center" }}>
                      <div className="skeleton" style={{ width: 16, height: 16, borderRadius: 4 }} />
                    </td>
                  )}
                  {columns.map((col, cIdx) => (
                    <td key={cIdx}>
                      <div
                        className="skeleton"
                        style={{
                          width: cIdx === 0 ? "60%" : cIdx === 1 ? "80%" : "40%",
                          height: 16,
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              // ── Empty State ──
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)}>
                  <div className="empty-state-box">
                    <div className="empty-state-icon">
                      <EmptyIcon size={28} />
                    </div>
                    <div className="empty-state-title">{emptyTitle}</div>
                    <div className="empty-state-desc">
                      {search ? `No results found matching "${search}"` : emptyDescription}
                    </div>
                    {emptyAction && <div style={{ marginTop: 8 }}>{emptyAction}</div>}
                  </div>
                </td>
              </tr>
            ) : (
              // ── Data Rows ──
              paginatedData.map((row, rIdx) => {
                const rowId = row[idKey] ?? rIdx;
                const isSelected = selectedIds.includes(rowId);
                return (
                  <tr
                    key={rowId}
                    className={isSelected ? "selected" : ""}
                    onClick={() => onRowClick?.(row)}
                    style={{ cursor: onRowClick ? "pointer" : "default" }}
                  >
                    {selectable && (
                      <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleRow(rowId, e)}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                    )}
                    {columns.map((col, cIdx) => (
                      <td key={col.key || cIdx} style={col.cellStyle}>
                        {col.render ? col.render(row, rIdx) : row[col.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination Bar ── */}
      {!loading && totalItems > 0 && (
        <div className="table-pagination">
          <div>
            Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to{" "}
            <strong>{isAll ? totalItems : Math.min(currentPage * pageSize, totalItems)}</strong> of{" "}
            <strong>{totalItems}</strong> entries
            {search && ` (filtered from ${data.length})`}
          </div>

          <div className="pagination-controls">
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 12 }}>
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                style={{ width: "auto", padding: "4px 24px 4px 8px", fontSize: 12 }}
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === -1 ? "All" : opt}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="btn btn-secondary btn-xs"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ padding: "0 6px" }}>
              {currentPage} / {totalPages}
            </span>
            <button
              className="btn btn-secondary btn-xs"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              title="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
