import { useState } from "react";
import Alert from "../components/Alert";
import Field from "../components/Field";
import Spinner from "../components/Spinner";
import { setToken } from "../lib/api";

export default function SetupScreen({ onConnect }) {
  const [token, setTokenInput] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function connect() {
    const t = token.trim();
    if (!t) {
      setErr("Please enter your API token.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/integrations", {
        headers: { Authorization: "Bearer " + t },
      });
      if (res.status === 401) {
        setErr("Invalid token. Copy the full token from the server stdout.");
        setLoading(false);
        return;
      }
      setToken(t);
      onConnect();
    } catch (e) {
      setErr("Cannot reach server: " + e.message);
    }
    setLoading(false);
  }

  return (
    <div className="setup-wrap">
      <div className="setup-card">
        <div style={{ fontSize: 48, marginBottom: 12 }}>👻</div>
        <h1>GhostReply</h1>
        <p>
          Enter your API token to continue.
          <br />
          The token is printed to server stdout on first run.
        </p>
        {err && (
          <Alert type="error" onClose={() => setErr("")}>
            {err}
          </Alert>
        )}
        <Field label="API Token">
          <input
            type="password"
            value={token}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Paste your token here…"
            onKeyDown={(e) => e.key === "Enter" && connect()}
            autoFocus
          />
        </Field>
        <button
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={connect}
          disabled={loading}
        >
          {loading ? (
            <>
              <Spinner /> Verifying…
            </>
          ) : (
            "Connect →"
          )}
        </button>
        <div style={{ marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
          Token is stored in <code>localStorage</code>. Click "Change Token" in
          the sidebar to reset.
        </div>
      </div>
    </div>
  );
}
