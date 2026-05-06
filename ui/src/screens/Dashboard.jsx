import { useEffect, useState } from "react";
import Spinner from "../components/Spinner";
import { apiGet } from "../lib/api";

function StatCard({ num, label, sublabel, color }) {
  return (
    <div className="stat-card">
      <div className="stat-num" style={{ color: color || "var(--accent)" }}>{num ?? 0}</div>
      <div className="stat-label">{label}</div>
      {sublabel && <div className="stat-label" style={{ fontSize: 10, opacity: 0.6 }}>{sublabel}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [sessionStats, setSessionStats] = useState([]);
  const [allTime, setAllTime] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
    
    fetchDashboardData();
  }, [allTime]);

  async function fetchDashboardData() {
    setLoadingStats(true);
    try {
      const [s, ss] = await Promise.all([
        apiGet("/stats"),
        apiGet("/session-stats?all_time=" + allTime)
      ]);
      setStats(s);
      setSessionStats(ss || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  }

  const getStat = (type, status) => {
    const found = sessionStats.find(s => s.type === type && s.status === status);
    return found ? found.count : 0;
  };

  const getSucceeded = (type) => getStat(type, "success");
  const getFailed = (type) => getStat(type, "failure");
  const getCancelled = (type) => getStat(type, "cancelled");
  const getInProgress = (type) => getStat(type, "in_progress") + getStat(type, "pending");

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>🏠 Dashboard</h2>
        <div className="row" style={{ margin: 0 }}>
          <button 
            className={`btn btn-sm ${!allTime ? 'btn-accent' : 'btn-secondary'}`}
            onClick={() => setAllTime(false)}
          >
            Current Session
          </button>
          <button 
            className={`btn btn-sm ${allTime ? 'btn-accent' : 'btn-secondary'}`}
            onClick={() => setAllTime(true)}
          >
            All-Time
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard num={stats?.integrations} label="Integrations" />
        <StatCard num={stats?.conversations} label="Conversations" />
        <StatCard num={stats?.messages} label="Messages Total" />
      </div>

      <h3>💬 Message Operations ({allTime ? "All-Time" : "Session"})</h3>
      <div className="stats-grid">
        <StatCard num={getSucceeded("engine")} label="Replied" color="var(--green)" />
        <StatCard num={getFailed("engine")} label="Errored" color="var(--red)" />
        <StatCard num={getCancelled("engine")} label="Cancelled" color="var(--muted)" />
        <StatCard num={getInProgress("engine")} label="In Progress" color="var(--yellow)" />
      </div>

      <h3>📝 Summary Operations ({allTime ? "All-Time" : "Session"})</h3>
      <div className="stats-grid">
        <StatCard num={getSucceeded("summary")} label="Succeeded" color="var(--green)" />
        <StatCard num={getFailed("summary")} label="Errored" color="var(--red)" />
        <StatCard num={getCancelled("summary")} label="Cancelled" color="var(--muted)" />
        <StatCard num={getInProgress("summary")} label="In Progress" color="var(--yellow)" />
      </div>

      <div className="responsive-grid">
        <div className="card">
          <h3>Server Status</h3>
          {health ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <span
                  className={`dot dot-${health.status === "ok" ? "green" : "red"}`}
                />
                Server: <strong>{health.status}</strong>
              </div>
              <div>
                <span className={`dot dot-${health.db_ok ? "green" : "red"}`} />
                Database:{" "}
                <strong>{health.db_ok ? "connected" : "disconnected"}</strong>
              </div>
              <div>
                🤖 LLM: <code>{health.llm_url}</code>
              </div>
              {stats?.session && (
                <div style={{ marginTop: 8, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Current Session Started</div>
                  <div className="mono">{new Date(stats.session.started_at).toLocaleString()}</div>
                </div>
              )}
            </div>
          ) : (
            <Spinner lg />
          )}
        </div>

        <div className="card">
          <h3>Quick Start</h3>
          <ol style={{ paddingLeft: 18, lineHeight: 2, color: "var(--muted)" }}>
            <li>Add an <strong>Integration</strong> (platform + account)</li>
            <li>Configure <strong>Settings</strong> (LLM URL/Key)</li>
            <li>Set a <strong>System Prompt</strong> (Persona)</li>
            <li>Test via <strong>Chat Test</strong> panel</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
