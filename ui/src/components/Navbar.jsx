import React from "react";
import {
  Menu,
  Command,
  Activity,
  Terminal,
  LogOut,
  Sparkles,
  Search,
} from "lucide-react";

export default function Navbar({
  screen,
  screenTitle,
  tokenPrefix,
  onOpenCommandPalette,
  onOpenSidebar,
  onLogout,
  serverStatus = "ok",
}) {
  const isMac = typeof window !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  return (
    <header className="top-navbar">
      <div className="navbar-left">
        <button
          className="btn btn-ghost btn-icon-only mobile-only"
          onClick={onOpenSidebar}
          style={{ display: "none" }}
          title="Open menu"
        >
          <Menu size={20} />
        </button>

        <div className="breadcrumb-trail">
          <span className="breadcrumb-item">GhostReply</span>
          <span style={{ color: "var(--text-subtle)" }}>/</span>
          <span className="breadcrumb-item active">{screenTitle || screen}</span>
        </div>
      </div>

      <div className="navbar-right">
        {/* Command Palette Trigger Button */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={onOpenCommandPalette}
          style={{
            gap: 10,
            padding: "6px 12px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
          }}
          title="Search or jump to screen (Ctrl+K)"
        >
          <Search size={14} />
          <span style={{ fontSize: 12 }}>Search…</span>
          <kbd style={{ fontSize: 10 }}>{isMac ? "⌘K" : "Ctrl+K"}</kbd>
        </button>

        {/* Server Status Pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "4px 10px",
            background: serverStatus === "ok" ? "var(--success-subtle)" : "var(--danger-subtle)",
            border: `1px solid ${serverStatus === "ok" ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.25)"}`,
            borderRadius: "var(--radius-full)",
            fontSize: 11,
            fontWeight: 600,
            color: serverStatus === "ok" ? "var(--success)" : "var(--danger)",
          }}
        >
          <span className={`status-dot ${serverStatus === "ok" ? "green" : "red"} status-dot-pulse`} />
          <span>{serverStatus === "ok" ? "Server Online" : "Server Disconnected"}</span>
        </div>

        {/* Token snippet & Logout button */}
        {tokenPrefix && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 10px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
            }}
          >
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Token:</span>
            <code style={{ fontSize: 11 }}>{tokenPrefix}…</code>
          </div>
        )}

        <button
          className="btn btn-ghost btn-icon-only btn-sm"
          onClick={onLogout}
          title="Log out / Change Token"
          style={{ color: "var(--text-muted)" }}
        >
          <LogOut size={16} />
        </button>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .mobile-only { display: flex !important; }
        }
      `}</style>
    </header>
  );
}
