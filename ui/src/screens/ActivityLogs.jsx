import { useEffect, useState } from "react";
import Spinner from "../components/Spinner";
import { apiGet, apiPost } from "../lib/api";

export default function ActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    type: "",
    status: "",
    conversation_id: "",
  });

  useEffect(() => {
    fetchLogs();
  }, [filters]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.type) params.append("type", filters.type);
      if (filters.status) params.append("status", filters.status);
      if (filters.conversation_id)
        params.append("conversation_id", filters.conversation_id);

      const data = await apiGet("/activity-logs?" + params.toString());
      setLogs(data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id) {
    if (!confirm("Are you sure you want to cancel this operation?")) return;
    try {
      await apiPost(`/activity-logs/${id}/cancel`);
      fetchLogs();
    } catch (err) {
      alert("Failed to cancel: " + err.message);
    }
  }

  function getStatusBadge(status) {
    switch (status) {
      case "success":
        return <span className="badge badge-green">Success</span>;
      case "failure":
        return <span className="badge badge-red">Failure</span>;
      case "pending":
        return <span className="badge badge-yellow">Pending</span>;
      case "in_progress":
        return <span className="badge badge-blue">In Progress</span>;
      case "cancelled":
        return <span className="badge badge-gray">Cancelled</span>;
      default:
        return <span className="badge badge-gray">{status}</span>;
    }
  }

  function formatDuration(log) {
    if (!log.completed_at || log.status === "pending" || log.status === "in_progress") return "-";
    const start = new Date(log.created_at);
    const end = new Date(log.completed_at);
    const ms = end - start;
    if (ms < 0) return "0s";
    return (ms / 1000).toFixed(1) + "s";
  }
  function formatLLMDuration(log) {
    if (!log.metadata) return "-";
    try {
      const meta = JSON.parse(log.metadata);
      if (meta.duration_ms !== undefined) {
        return (meta.duration_ms / 1000).toFixed(1) + "s";
      }
    } catch (e) {
      // ignore
    }
    return "-";
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>📋 Activity Logs</h2>
        <button className="btn btn-secondary btn-sm" onClick={fetchLogs} disabled={loading}>
          {loading ? <Spinner /> : "Refresh"}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="responsive-grid" style={{ gap: 12 }}>
          <div className="field">
            <label>Type</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            >
              <option value="">All Types</option>
              <option value="engine">Engine (Chat)</option>
              <option value="summary">Summary</option>
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All Statuses</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Conversation</th>
              <th>Type</th>
              <th>Operation</th>
              <th>Status</th>
              <th>Total Duration</th>
              <th>LLM Duration</th>
              <th>Details</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && !loading ? (
              <tr className="empty-row">
                <td colSpan="9">No activity logs found</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="truncate" title={log.conversation_title}>
                    {log.conversation_title || <span className="mono" style={{opacity:0.5}}>{log.conversation_id.slice(0,8)}</span>}
                  </td>
                  <td className="mono" style={{ fontSize: 11, textTransform: "uppercase" }}>
                    {log.type}
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {log.request_type}
                  </td>
                  <td>{getStatusBadge(log.status)}</td>
                  <td>{formatDuration(log)}</td>
                  <td>{formatLLMDuration(log)}</td>
                  <td style={{ maxWidth: 300 }}>
                    {log.error_msg && (
                      <div className="alert alert-error" style={{ fontSize: 11, padding: "4px 8px", margin: 0 }}>
                        {log.error_msg}
                      </div>
                    )}
                    {log.metadata && !log.error_msg && (
                      <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                        {log.metadata}
                      </div>
                    )}
                  </td>
                  <td>
                    {(log.status === "pending" || log.status === "in_progress") && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleCancel(log.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {loading && logs.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <Spinner lg />
        </div>
      )}
    </div>
  );
}
