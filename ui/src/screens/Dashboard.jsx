import { useEffect, useState } from "react";
import Spinner from "../components/Spinner";
import { apiGet } from "../lib/api";

function StatCard({ num, label }) {
  return (
    <div className="stat-card">
      <div className="stat-num">{num ?? <Spinner />}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
    apiGet("/stats")
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <div>
      <h2>🏠 Dashboard</h2>
      <div className="stats-grid">
        <StatCard num={stats?.integrations} label="Integrations" />
        <StatCard num={stats?.conversations} label="Conversations" />
        <StatCard num={stats?.messages} label="Messages" />
      </div>

      <div className="card">
        <h3>Server Status</h3>
        {health ? (
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
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
            <div>
              🔑 Token prefix: <code>{health.token_prefix}…</code>
            </div>
          </div>
        ) : (
          <Spinner lg />
        )}
      </div>

      <div className="card">
        <h3>Quick Start</h3>
        <ol style={{ paddingLeft: 18, lineHeight: 2, color: "var(--muted)" }}>
          <li>
            Add an <strong style={{ color: "var(--text)" }}>Integration</strong>{" "}
            (platform + account name)
          </li>
          <li>
            Go to <strong style={{ color: "var(--text)" }}>Settings</strong> →
            configure your LLM provider URL and API key
          </li>
          <li>
            Set a{" "}
            <strong style={{ color: "var(--text)" }}>System Prompt</strong> —
            the persona to impersonate
          </li>
          <li>
            Send a test message via the{" "}
            <strong style={{ color: "var(--text)" }}>Chat Test</strong> panel
          </li>
        </ol>
      </div>
    </div>
  );
}
