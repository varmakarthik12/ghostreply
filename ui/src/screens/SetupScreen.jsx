import React, { useState } from "react";
import { Ghost, Key, Eye, EyeOff, ArrowRight, ShieldCheck, HelpCircle } from "lucide-react";
import Alert from "../components/Alert";
import Field from "../components/Field";
import Spinner from "../components/Spinner";
import { setToken } from "../lib/api";

export default function SetupScreen({ onConnect }) {
  const [token, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function connect() {
    const t = token.trim();
    if (!t) {
      setErr("Please enter your GhostReply API authentication token.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/integrations", {
        headers: { Authorization: "Bearer " + t },
      });
      if (res.status === 401) {
        setErr("Invalid token. Please copy the complete token printed to the server terminal.");
        setLoading(false);
        return;
      }
      setToken(t);
      onConnect();
    } catch (e) {
      setErr("Unable to reach GhostReply server: " + e.message);
    }
    setLoading(false);
  }

  return (
    <div className="setup-wrap">
      <div className="setup-card">
        {/* Animated Ghost Logo */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "var(--radius-xl)",
            background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            boxShadow: "0 0 35px -5px var(--primary-glow)",
          }}
        >
          <Ghost size={36} />
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-main)", marginBottom: 6 }}>
          GhostReply Console
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
          Autonomous AI messaging agent with infinite cross-platform memory. Enter your authentication token to access the operations dashboard.
        </p>

        {err && (
          <Alert type="error" onClose={() => setErr("")} style={{ marginBottom: 16, textAlign: "left" }}>
            {err}
          </Alert>
        )}

        <div style={{ position: "relative", marginBottom: 20, textAlign: "left" }}>
          <label className="form-label" style={{ marginBottom: 6 }}>
            <span>API Bearer Token</span>
          </label>
          <div style={{ position: "relative" }}>
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste token from server stdout…"
              onKeyDown={(e) => e.key === "Enter" && connect()}
              autoFocus
              style={{ paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: 2,
                display: "flex",
                alignItems: "center",
              }}
              title={showToken ? "Hide token" : "Show token"}
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          className="btn btn-primary btn-lg"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={connect}
          disabled={loading}
        >
          {loading ? (
            <>
              <Spinner />
              <span>Verifying Connection…</span>
            </>
          ) : (
            <>
              <span>Connect to Server</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>

        <div
          style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid var(--border)",
            fontSize: 12,
            color: "var(--text-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <HelpCircle size={14} />
          <span>Token is displayed in your terminal upon running <code>./ghostreply</code></span>
        </div>
      </div>
    </div>
  );
}
