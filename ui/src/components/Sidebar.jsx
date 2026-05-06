
const NAV = [
  { id: "dashboard", icon: "🏠", label: "Dashboard" },
  { id: "integrations", icon: "🔌", label: "Integrations" },
  { id: "conversations", icon: "💬", label: "Conversations" },
  { id: "messages", icon: "📨", label: "Messages" },
  { id: "prompts", icon: "🎭", label: "System Prompts" },
  { id: "models", icon: "🤖", label: "Model Configs" },
  { id: "summaries", icon: "📝", label: "Summaries" },
  { id: "logs", icon: "📋", label: "Activity Logs" },
  { id: "links", icon: "🔗", label: "Identity Links" },
  { id: "settings", icon: "⚙️", label: "Settings" },
  { id: "test", icon: "🧪", label: "Chat Test" },
];

export default function Sidebar({
  screen,
  onNavigate,
  tokenPrefix,
  onLogout,
  isOpen,
  onClose,
}) {
  return (
    <div className={`sidebar${isOpen ? " open" : ""}`}>
      <div className="sidebar-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="sidebar-logo" style={{ border: "none", marginBottom: 0, paddingBottom: 8 }}>👻 GhostReply</div>
        <button 
          className="btn btn-secondary btn-sm mobile-only" 
          onClick={onClose}
          style={{ display: "none" }}
        >
          ✕
        </button>
      </div>
      <nav style={{ marginTop: 8 }}>
        {NAV.map((n) => (
          <div
            key={n.id}
            className={`nav-item${screen === n.id ? " active" : ""}`}
            onClick={() => onNavigate(n.id)}
          >
            <span>{n.icon}</span>
            <span>{n.label}</span>
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        {tokenPrefix && (
          <div style={{ marginBottom: 6 }}>
            Token: <code>{tokenPrefix}…</code>
          </div>
        )}
        <button
          className="btn btn-secondary btn-sm"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={onLogout}
        >
          Change Token
        </button>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .mobile-only { display: block !important; }
          .sidebar-logo { border-bottom: none !important; }
        }
      `}</style>
    </div>
  );
}

export { NAV };
