import React from "react";
import { Inbox } from "lucide-react";
import Spinner from "./Spinner";

export default function LoadTable({
  state,
  cols = [],
  renderRow,
  emptyIcon = null,
  emptyText = "No data available",
  toolbarActions = null,
}) {
  if (state.loading) {
    return (
      <div className="table-container">
        {toolbarActions && <div className="table-toolbar">{toolbarActions}</div>}
        <div className="table-scroll-area">
          <table className="modern-table">
            <thead>
              <tr>
                {cols.map((c, idx) => (
                  <th key={idx}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, rIdx) => (
                <tr key={rIdx}>
                  {cols.map((_, cIdx) => (
                    <td key={cIdx}>
                      <div className="skeleton" style={{ width: "70%", height: 16 }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="alert alert-error" style={{ margin: "16px 0" }}>
        {state.error}
      </div>
    );
  }

  const rows = state.data || [];

  return (
    <div className="table-container">
      {toolbarActions && <div className="table-toolbar">{toolbarActions}</div>}
      <div className="table-scroll-area">
        <table className="modern-table">
          <thead>
            <tr>
              {cols.map((c, idx) => (
                <th key={idx}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length}>
                  <div className="empty-state-box">
                    <div className="empty-state-icon">
                      <Inbox size={26} />
                    </div>
                    <div className="empty-state-title">{emptyText}</div>
                    <div className="empty-state-desc">No records found.</div>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map(renderRow)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
