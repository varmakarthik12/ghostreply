import React, { useEffect, useState } from "react";
import {
  Plug,
  MessageSquare,
  Send,
  FileText,
  Activity,
  Bot,
  Sparkles,
  Server,
  Database,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  FlaskConical,
  Zap,
} from "lucide-react";
import Spinner from "../components/Spinner";
import StatCard from "../components/StatCard";
import Badge from "../components/Badge";
import { apiGet } from "../lib/api";
import { fmtDate, fmtRelative, formatNumber } from "../lib/utils";

export default function Dashboard({ onNavigate }) {
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [sessionStats, setSessionStats] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [allTime, setAllTime] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, [allTime]);

  async function fetchDashboardData(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [h, s, ss, logs] = await Promise.all([
        fetch("/health").then((r) => r.json()).catch(() => null),
        apiGet("/stats").catch(() => null),
        apiGet("/session-stats?all_time=" + allTime).catch(() => []),
        apiGet("/activity-logs?type=&status=&conversation_id=").catch(() => []),
      ]);

      if (h) setHealth(h);
      if (s) setStats(s);
      setSessionStats(ss || []);
      setRecentLogs((logs || []).slice(0, 5));
    } catch (err) {
      console.error("Error loading dashboard:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const getStat = (type, status) => {
    const found = sessionStats.find((s) => s.type === type && s.status === status);
    return found ? found.count : 0;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ── Page Header ── */}
      <div className="flex-row-between">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Activity size={24} color="var(--primary)" />
            <span>Operations Dashboard</span>
          </h1>
          <p className="card-subtitle">
            Real-time monitoring of active messaging bots, autonomous replies, and LLM operations.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 3,
            }}
          >
            <button
              className={`btn btn-sm ${!allTime ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setAllTime(false)}
              style={{ borderRadius: "var(--radius-sm)", padding: "4px 12px" }}
            >
              Current Session
            </button>
            <button
              className={`btn btn-sm ${allTime ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setAllTime(true)}
              style={{ borderRadius: "var(--radius-sm)", padding: "4px 12px" }}
            >
              All-Time
            </button>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            title="Refresh statistics"
          >
            <RefreshCw size={14} className={refreshing ? "spin" : ""} />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* ── Server Status Banner ── */}
      <div className="glass-card" style={{ padding: "16px 20px", marginBottom: 0 }}>
        <div className="flex-row-between">
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className={`status-dot ${health?.status === "ok" ? "green" : "red"} status-dot-pulse`} />
              <strong style={{ fontSize: 13, color: "var(--text-main)" }}>
                {health?.status === "ok" ? "Server Healthy" : "Server Disconnected"}
              </strong>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
              <Database size={14} color={health?.db_ok ? "var(--success)" : "var(--danger)"} />
              <span>Database: <strong>{health?.db_ok ? "SQLite Connected" : "Disconnected"}</strong></span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
              <Bot size={14} color="var(--primary)" />
              <span>LLM Endpoint: <code>{health?.llm_url || "Default"}</code></span>
            </div>
          </div>

          {stats?.session?.started_at && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
              <Clock size={14} />
              <span>Session Started: <strong>{fmtRelative(stats.session.started_at)}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Metric Cards ── */}
      <div className="kpi-grid">
        <StatCard
          label="Active Integrations"
          value={formatNumber(stats?.integrations)}
          subtext="Connected messaging platforms"
          icon={Plug}
          variant="primary"
          onClick={() => onNavigate?.("integrations")}
        />
        <StatCard
          label="Total Conversations"
          value={formatNumber(stats?.conversations)}
          subtext="Active recipient threads"
          icon={MessageSquare}
          variant="success"
          onClick={() => onNavigate?.("conversations")}
        />
        <StatCard
          label="Messages Logged"
          value={formatNumber(stats?.messages)}
          subtext="Inbound & outbound messages"
          icon={Send}
          variant="accent"
          onClick={() => onNavigate?.("messages")}
        />
        <StatCard
          label="Chat Engine Success"
          value={formatNumber(getStat("engine", "success"))}
          subtext={`${allTime ? "All-time" : "Session"} autonomous replies`}
          icon={Sparkles}
          variant="purple"
        />
      </div>

      {/* ── Operations Throughput Section ── */}
      <div className="grid-2">
        {/* Chat Operations */}
        <div className="glass-card" style={{ marginBottom: 0 }}>
          <div className="card-header-row">
            <div className="card-title-group">
              <Zap size={18} color="var(--primary)" />
              <div>
                <h3>Chat Engine Operations</h3>
                <div className="card-subtitle">{allTime ? "All-time throughput" : "Current session metrics"}</div>
              </div>
            </div>
            <Badge color="primary">{allTime ? "All-Time" : "Session"}</Badge>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 16 }}>
            <div style={{ padding: "14px 16px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--success)" }}>Replied</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-main)", marginTop: 4 }}>{formatNumber(getStat("engine", "success"))}</div>
            </div>
            <div style={{ padding: "14px 16px", background: "rgba(244, 63, 94, 0.08)", border: "1px solid rgba(244, 63, 94, 0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--danger)" }}>Failed</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-main)", marginTop: 4 }}>{formatNumber(getStat("engine", "failure"))}</div>
            </div>
            <div style={{ padding: "14px 16px", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--warning)" }}>In Progress</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-main)", marginTop: 4 }}>{formatNumber(getStat("engine", "in_progress") + getStat("engine", "pending"))}</div>
            </div>
            <div style={{ padding: "14px 16px", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>Cancelled</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-main)", marginTop: 4 }}>{formatNumber(getStat("engine", "cancelled"))}</div>
            </div>
          </div>
        </div>

        {/* Summary Operations */}
        <div className="glass-card" style={{ marginBottom: 0 }}>
          <div className="card-header-row">
            <div className="card-title-group">
              <FileText size={18} color="var(--purple)" />
              <div>
                <h3>Memory Summarizations</h3>
                <div className="card-subtitle">Background memory consolidation & pruning</div>
              </div>
            </div>
            <Badge color="purple">{allTime ? "All-Time" : "Session"}</Badge>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 16 }}>
            <div style={{ padding: "14px 16px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--success)" }}>Succeeded</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-main)", marginTop: 4 }}>{formatNumber(getStat("summary", "success"))}</div>
            </div>
            <div style={{ padding: "14px 16px", background: "rgba(244, 63, 94, 0.08)", border: "1px solid rgba(244, 63, 94, 0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--danger)" }}>Failed</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-main)", marginTop: 4 }}>{formatNumber(getStat("summary", "failure"))}</div>
            </div>
            <div style={{ padding: "14px 16px", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--warning)" }}>In Progress</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-main)", marginTop: 4 }}>{formatNumber(getStat("summary", "in_progress") + getStat("summary", "pending"))}</div>
            </div>
            <div style={{ padding: "14px 16px", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>Cancelled</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-main)", marginTop: 4 }}>{formatNumber(getStat("summary", "cancelled"))}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Actions & Recent Activity ── */}
      <div className="grid-2">
        {/* Quick Start Action Hub */}
        <div className="glass-card" style={{ marginBottom: 0 }}>
          <div className="card-header-row">
            <div className="card-title-group">
              <Sparkles size={18} color="var(--accent)" />
              <h3>Quick Actions</h3>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              className="btn btn-secondary"
              style={{ justifyContent: "space-between", padding: "12px 16px" }}
              onClick={() => onNavigate?.("test")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FlaskConical size={16} color="var(--primary)" />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 600, color: "var(--text-main)" }}>Chat Test Playground</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Simulate auto-replies and multimodal messages</div>
                </div>
              </div>
              <ArrowRight size={16} color="var(--text-muted)" />
            </button>

            <button
              className="btn btn-secondary"
              style={{ justifyContent: "space-between", padding: "12px 16px" }}
              onClick={() => onNavigate?.("integrations")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Plug size={16} color="var(--accent)" />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 600, color: "var(--text-main)" }}>Manage Integrations</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Add Telegram, WhatsApp, or Webhooks</div>
                </div>
              </div>
              <ArrowRight size={16} color="var(--text-muted)" />
            </button>

            <button
              className="btn btn-secondary"
              style={{ justifyContent: "space-between", padding: "12px 16px" }}
              onClick={() => onNavigate?.("prompts")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Sparkles size={16} color="var(--purple)" />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 600, color: "var(--text-main)" }}>Configure Personas</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Customize tone, voice, and system prompts</div>
                </div>
              </div>
              <ArrowRight size={16} color="var(--text-muted)" />
            </button>
          </div>
        </div>

        {/* Live Recent Activity */}
        <div className="glass-card" style={{ marginBottom: 0 }}>
          <div className="card-header-row">
            <div className="card-title-group">
              <Activity size={18} color="var(--success)" />
              <h3>Recent Engine Activity</h3>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onNavigate?.("logs")}
              style={{ fontSize: 12 }}
            >
              View all logs →
            </button>
          </div>

          {recentLogs.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No recent activity recorded yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recentLogs.map((log) => {
                const isSuccess = log.status === "success";
                const isFailure = log.status === "failure";
                const isRunning = log.status === "in_progress" || log.status === "pending";
                return (
                  <div
                    key={log.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      background: "rgba(255, 255, 255, 0.025)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span className={`status-dot ${isSuccess ? "green" : isFailure ? "red" : isRunning ? "yellow" : "blue"}`} />
                      <div className="truncate-text">
                        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-main)" }}>
                          {log.conversation_title || log.conversation_id?.slice(0, 8) || "Conversation"}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-subtle)", marginLeft: 6, textTransform: "uppercase" }}>
                          ({log.type})
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <Badge color={isSuccess ? "green" : isFailure ? "red" : isRunning ? "yellow" : "gray"}>
                        {log.status}
                      </Badge>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {fmtRelative(log.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
