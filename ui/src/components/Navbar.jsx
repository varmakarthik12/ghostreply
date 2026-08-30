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
          className="btn btn-ghost btn-icon-only navbar-mobile-toggle"
          onClick={onOpenSidebar}
          title="Open menu"
        >
          <Menu size={20} />
        </button>

        <div className="breadcrumb-trail">
          <span className="breadcrumb-item desktop-only">GhostReply</span>
          <span className="desktop-only" style={{ color: "var(--text-subtle)" }}>/</span>
          <span className="breadcrumb-item active">{screenTitle || screen}</span>
        </div>
      </div>

      <div className="navbar-right">
        {/* Command Palette Trigger Button */}
        <button
          className="btn btn-secondary btn-sm navbar-search-btn"
          onClick={onOpenCommandPalette}
          title="Search or jump to screen (Ctrl+K)"
        >
          <Search size={14} />
          <span className="desktop-only" style={{ fontSize: 12 }}>Search…</span>
          <kbd className="desktop-only" style={{ fontSize: 10 }}>{isMac ? "⌘K" : "Ctrl+K"}</kbd>
        </button>

        {/* Server Status Pill */}
        <div
          className="navbar-status-pill"
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
          <span className="desktop-only">{serverStatus === "ok" ? "Server Online" : "Disconnected"}</span>
        </div>

        {/* Token snippet & Logout button */}
        {tokenPrefix && (
          <div
            className="navbar-token-badge desktop-only"
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
