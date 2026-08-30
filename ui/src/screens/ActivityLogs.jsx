import React, { useEffect, useState, useMemo } from "react";
import {
  Activity,
  RefreshCw,
  XCircle,
  Eye,
  Filter,
  Clock,
  Zap,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Copy,
  Check,
  Cpu,
  Layers,
  Sparkles,
} from "lucide-react";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Drawer from "../components/Drawer";
import Modal from "../components/Modal";
import Spinner from "../components/Spinner";
import { apiGet, apiPost } from "../lib/api";
import { toast } from "../lib/toast";
import { fmtDate, fmtTime, shortId, copyToClipboard } from "../lib/utils";

function parseMeta(metadata) {
  if (!metadata) return null;
  try {
    return typeof metadata === "object" ? metadata : JSON.parse(metadata);
  } catch (e) {
    return null;
  }
}

export default function ActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    type: "",
    status: "",
    conversation_id: "",
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(3);
  const [selectedLog, setSelectedLog] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, [filters]);

  useEffect(() => {
    if (!autoRefresh) return;
    const intervalId = setInterval(() => {
      fetchLogs(true);
    }, refreshInterval * 1000);
    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, filters]);

  async function fetchLogs(background = false) {
    if (!background) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.type) params.append("type", filters.type);
      if (filters.status) params.append("status", filters.status);
      if (filters.conversation_id) params.append("conversation_id", filters.conversation_id);

      const data = await apiGet("/activity-logs?" + params.toString());
      setLogs(data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!background) setLoading(false);
    }
  }

  async function handleCancel(id) {
    setCancellingId(id);
    try {
      await apiPost(`/activity-logs/${id}/cancel`);
      toast("Operation cancelled successfully");
      fetchLogs();
      if (selectedLog?.id === id) {
        setSelectedLog((prev) => ({ ...prev, status: "cancelled" }));
      }
    } catch (err) {
      toast("Failed to cancel operation: " + err.message, "error");
    } finally {
      setCancellingId(null);
    }
  }

  const formatDuration = (log) => {
    if (!log.completed_at || log.status === "pending" || log.status === "in_progress") return "—";
    const start = new Date(log.created_at);
    const end = new Date(log.completed_at);
    const ms = end - start;
    if (ms < 0) return "0s";
    return (ms / 1000).toFixed(2) + "s";
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "success":
        return <Badge color="green" dot>Success</Badge>;
      case "failure":
        return <Badge color="red" dot>Failure</Badge>;
      case "pending":
        return <Badge color="yellow" dot>Pending</Badge>;
      case "in_progress":
        return <Badge color="blue" dot>In Progress</Badge>;
      case "cancelled":
        return <Badge color="gray">Cancelled</Badge>;
      default:
        return <Badge color="gray">{status}</Badge>;
    }
  };

  const handleCopyPayload = (text) => {
    copyToClipboard(text);
    setCopied(true);
    toast("Log payload copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // Analytics Metrics calculations
  const { totalCount, successCount, failCount, runningCount, successRate, totalTokensUsed, avgTokens } = useMemo(() => {
    const total = logs.length;
    const success = logs.filter((l) => l.status === "success").length;
    const fail = logs.filter((l) => l.status === "failure").length;
    const running = logs.filter((l) => l.status === "in_progress" || l.status === "pending").length;
    const rate = total > 0 ? Math.round((success / total) * 100) : 100;

    let tokenSum = 0;
    let tokenCount = 0;
    logs.forEach((l) => {
      const meta = parseMeta(l.metadata);
      if (meta?.total_tokens) {
        tokenSum += meta.total_tokens;
        tokenCount++;
      }
    });

    const avg = tokenCount > 0 ? Math.round(tokenSum / tokenCount) : 0;
    return {
      totalCount: total,
      successCount: success,
      failCount: fail,
      runningCount: running,
      successRate: rate,
      totalTokensUsed: tokenSum,
      avgTokens: avg,
    };
  }, [logs]);

  const columns = [
    {
      header: "Timestamp",
      key: "created_at",
      width: 150,
      render: (r) => (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {fmtDate(r.created_at)}
        </span>
      ),
    },
    {
      header: "Conversation",
      key: "conversation_title",
      render: (r) => (
        <div>
          <strong style={{ color: "var(--text-main)", display: "block" }}>
            {r.conversation_title || "Conversation"}
          </strong>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-subtle)" }}>
            {r.conversation_id ? shortId(r.conversation_id) : "—"}
          </span>
        </div>
      ),
    },
    {
      header: "Type & Op",
      key: "type",
      width: 130,
      render: (r) => (
        <div>
          <Badge color={r.type === "engine" ? "primary" : "purple"}>
            {r.type.toUpperCase()}
          </Badge>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {r.request_type || "auto-reply"}
          </div>
        </div>
      ),
    },
    {
      header: "Status",
      key: "status",
      width: 120,
      render: (r) => getStatusBadge(r.status),
    },
    {
      header: "Tokens (Prompt / Compl / Total)",
      key: "tokens",
      width: 220,
      render: (r) => {
        const meta = parseMeta(r.metadata);
        if (!meta || (!meta.total_tokens && !meta.prompt_tokens)) {
          return <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>—</span>;
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--primary)",
                  background: "var(--primary-subtle)",
                  padding: "2px 6px",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {meta.total_tokens?.toLocaleString() ?? "—"} total tokens
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 6 }}>
              <span>Prompt: <strong>{meta.prompt_tokens?.toLocaleString() ?? 0}</strong></span>
              <span>·</span>
              <span>Compl: <strong>{meta.completion_tokens?.toLocaleString() ?? 0}</strong></span>
            </div>
          </div>
        );
      },
    },
    {
      header: "Execution & LLM Latency",
      key: "latency",
      width: 150,
      render: (r) => {
        const meta = parseMeta(r.metadata);
        const totalDur = formatDuration(r);
        return (
          <div>
            <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-main)" }}>
              Total: {totalDur}
            </div>
            {meta?.duration_ms !== undefined && (
              <div className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
                LLM: {(meta.duration_ms / 1000).toFixed(2)}s ({meta.duration_ms}ms)
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: "Details / Error",
      key: "error_msg",
      render: (r) => {
        if (r.error_msg) {
          return (
            <span style={{ color: "var(--danger)", fontSize: 12, fontWeight: 500 }}>
              {r.error_msg}
            </span>
          );
        }
        return <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>Normal completion</span>;
      },
    },
    {
      header: "Actions",
      cellStyle: { textAlign: "right" },
      width: 90,
      render: (r) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => setSelectedLog(r)}
            title="Inspect Full JSON Payload"
          >
            <Eye size={12} />
            <span>JSON</span>
          </button>
          {(r.status === "pending" || r.status === "in_progress") && (
            <button
              className="btn btn-danger btn-xs"
              onClick={() => handleCancel(r.id)}
              disabled={cancellingId === r.id}
              title="Cancel execution"
            >
              {cancellingId === r.id ? <Spinner /> : <XCircle size={12} />}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Page Header ── */}
      <div className="flex-row-between">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Activity size={24} color="var(--primary)" />
            <span>Activity Logs & Operation Monitor</span>
          </h1>
          <p className="card-subtitle">
            Real-time execution trace with inline token consumption metrics, LLM latency, and error states.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className={`btn btn-sm ${autoRefresh ? "btn-secondary" : "btn-ghost"}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? "Pause live stream" : "Resume live stream"}
          >
            {autoRefresh ? <Pause size={13} color="var(--success)" /> : <Play size={13} />}
            <span>{autoRefresh ? `Auto-Refresh (${refreshInterval}s)` : "Paused"}</span>
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchLogs()}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Analytics Bar ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <div className="glass-card" style={{ padding: "12px 16px", marginBottom: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Success Rate
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: successRate >= 90 ? "var(--success)" : "var(--warning)", marginTop: 4 }}>
            {successRate}%
          </div>
        </div>

        <div className="glass-card" style={{ padding: "12px 16px", marginBottom: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Total Tokens
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--primary)", marginTop: 4 }}>
            {totalTokensUsed.toLocaleString()}
          </div>
        </div>

        <div className="glass-card" style={{ padding: "12px 16px", marginBottom: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Avg Tokens / Op
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-main)", marginTop: 4 }}>
            {avgTokens.toLocaleString()}
          </div>
        </div>

        <div className="glass-card" style={{ padding: "12px 16px", marginBottom: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Active Tasks
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: runningCount > 0 ? "var(--warning)" : "var(--text-muted)", marginTop: 4 }}>
            {runningCount}
          </div>
        </div>
      </div>

      {/* ── Filter Toolbar ── */}
      <div className="glass-card" style={{ padding: "14px 18px", marginBottom: 0 }}>
        <div className="flex-row-between">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flex: 1 }}>
            <Filter size={15} color="var(--text-subtle)" />

            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              style={{ width: "auto", minWidth: 140, height: 36, fontSize: 12 }}
            >
              <option value="">All Types</option>
              <option value="engine">Engine (Chat)</option>
              <option value="summary">Summary</option>
            </select>

            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              style={{ width: "auto", minWidth: 140, height: 36, fontSize: 12 }}
            >
              <option value="">All Statuses</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="in_progress">In Progress</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Poll interval:</span>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              style={{ width: "auto", padding: "4px 24px 4px 8px", fontSize: 12 }}
            >
              <option value="2">2s</option>
              <option value="3">3s</option>
              <option value="5">5s</option>
              <option value="10">10s</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Data Table with Inline Tokens & Timings ── */}
      <DataTable
        columns={columns}
        data={logs}
        loading={loading}
        error={error}
        onRowClick={(row) => setSelectedLog(row)}
        searchPlaceholder="Search logs by error, operation, or title…"
        searchKeys={["conversation_title", "error_msg", "request_type", "type"]}
        emptyTitle="No activity logs recorded"
        emptyDescription="Logs will be captured automatically as incoming requests arrive."
      />

      {/* ── Optional Log Inspector Drawer (for full raw JSON copy) ── */}
      <Drawer
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Operation Trace JSON Details"
        subtitle={`ID: ${selectedLog?.id || "—"}`}
        wide
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
            {(selectedLog?.status === "in_progress" || selectedLog?.status === "pending") && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleCancel(selectedLog.id)}
                disabled={cancellingId === selectedLog.id}
              >
                {cancellingId === selectedLog.id ? <Spinner /> : <XCircle size={14} />}
                <span>Cancel Operation</span>
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => setSelectedLog(null)}>
              Close Inspector
            </button>
          </div>
        }
      >
        {selectedLog && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Overview Card */}
            <div className="glass-card" style={{ padding: 16, marginBottom: 0 }}>
              <div className="flex-row-between" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge color={selectedLog.type === "engine" ? "primary" : "purple"}>
                    {selectedLog.type.toUpperCase()}
                  </Badge>
                  {getStatusBadge(selectedLog.status)}
                </div>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {fmtDate(selectedLog.created_at)}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                <div className="flex-row-between">
                  <span style={{ color: "var(--text-muted)" }}>Conversation:</span>
                  <strong>{selectedLog.conversation_title || selectedLog.conversation_id}</strong>
                </div>
                <div className="flex-row-between">
                  <span style={{ color: "var(--text-muted)" }}>Total Duration:</span>
                  <span className="mono">{formatDuration(selectedLog)}</span>
                </div>
                {parseMeta(selectedLog.metadata)?.duration_ms && (
                  <div className="flex-row-between">
                    <span style={{ color: "var(--text-muted)" }}>LLM Inference Time:</span>
                    <span className="mono">{(parseMeta(selectedLog.metadata).duration_ms / 1000).toFixed(2)}s ({parseMeta(selectedLog.metadata).duration_ms}ms)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Error Banner */}
            {selectedLog.error_msg && (
              <div className="alert alert-error" style={{ marginBottom: 0 }}>
                <div>
                  <strong style={{ display: "block", marginBottom: 2 }}>Error Message</strong>
                  <div>{selectedLog.error_msg}</div>
                </div>
              </div>
            )}

            {/* Metadata JSON */}
            <div className="glass-card" style={{ padding: 16, marginBottom: 0 }}>
              <div className="flex-row-between" style={{ marginBottom: 8 }}>
                <h4 style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Execution Metadata JSON
                </h4>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => handleCopyPayload(selectedLog.metadata || "{}")}
                >
                  {copied ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                  <span>Copy JSON</span>
                </button>
              </div>

              <pre
                style={{
                  background: "rgba(0, 0, 0, 0.35)",
                  padding: 14,
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                  color: "#a5f3fc",
                  fontSize: 12,
                  lineHeight: 1.5,
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(selectedLog.metadata || "{}"), null, 2);
                  } catch {
                    return selectedLog.metadata || "No metadata";
                  }
                })()}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
