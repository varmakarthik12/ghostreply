import React from "react";
import {
  LayoutDashboard,
  Plug,
  MessageSquare,
  Send,
  Sparkles,
  Bot,
  FileText,
  Activity,
  Link2,
  Settings,
  FlaskConical,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
  Ghost,
} from "lucide-react";
import { useAppVersion } from "../lib/version";

const NAV_SECTIONS = [
  {
    title: "Overview",
    items: [
      { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { id: "test", icon: FlaskConical, label: "Chat Test", badge: "AI" },
    ],
  },
  {
    title: "Operations",
    items: [
      { id: "integrations", icon: Plug, label: "Integrations" },
      { id: "conversations", icon: MessageSquare, label: "Conversations" },
      { id: "messages", icon: Send, label: "Messages" },
      { id: "summaries", icon: FileText, label: "Summaries" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { id: "prompts", icon: Sparkles, label: "System Prompts" },
      { id: "models", icon: Bot, label: "Model Configs" },
      { id: "links", icon: Link2, label: "Unified Identities" },
    ],
  },
  {
    title: "System",
    items: [
      { id: "logs", icon: Activity, label: "Activity Logs" },
      { id: "settings", icon: Settings, label: "Settings" },
    ],
  },
];

export default function Sidebar({
  screen,
  onNavigate,
  tokenPrefix,
  onLogout,
  isOpen,
  onClose,
  collapsed = false,
  onToggleCollapse,
}) {
  const version = useAppVersion();

  return (
    <aside className={`app-sidebar${isOpen ? " open" : ""}${collapsed ? " collapsed" : ""}`}>
      {/* ── Brand / Header ── */}
      <div className="sidebar-brand">
        <div className="brand-title">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "var(--radius-md)",
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              boxShadow: "0 0 15px -2px var(--primary-glow)",
              flexShrink: 0,
            }}
          >
            <Ghost size={20} />
          </div>
          {!collapsed && (
            <>
              <span>GhostReply</span>
              <span className="brand-badge">{version}</span>
            </>
          )}
        </div>

        <button
          className="btn btn-ghost btn-icon-only btn-sm sidebar-close-btn"
          onClick={onClose}
          title="Close menu"
          aria-label="Close navigation sidebar"
        >
          <X size={20} />
        </button>
      </div>

      {/* ── Navigation Sections ── */}
      <div className="sidebar-nav-scroll">
        {NAV_SECTIONS.map((sec) => (
          <div key={sec.title} className="nav-group">
            {!collapsed && <div className="nav-section-title">{sec.title}</div>}
            {sec.items.map((item) => {
              const Icon = item.icon;
              const isActive = screen === item.id;
              return (
                <button
                  key={item.id}
                  className={`nav-link-btn${isActive ? " active" : ""}`}
                  onClick={() => onNavigate(item.id)}
                  title={collapsed ? item.label : undefined}
                >
                  <div className="nav-icon">
                    <Icon size={18} />
                  </div>
                  {!collapsed && (
                    <>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.badge && <span className="nav-counter-pill">{item.badge}</span>}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Sidebar Footer ── */}
      <div className="sidebar-footer-card">
        {!collapsed && tokenPrefix && (
          <div style={{ marginBottom: 10, fontSize: 12, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 11, color: "var(--text-subtle)", marginBottom: 2 }}>Connected Token</div>
            <code>{tokenPrefix}…</code>
          </div>
        )}
        <button
          className="btn btn-secondary btn-sm"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={onLogout}
          title="Change token or switch accounts"
        >
          <LogOut size={14} />
          {!collapsed && <span>Change Token</span>}
        </button>
      </div>
    </aside>
  );
}
