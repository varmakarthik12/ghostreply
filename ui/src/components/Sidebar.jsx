
const NAV = [
  { id: "dashboard", icon: "🏠", label: "Dashboard" },
  { id: "integrations", icon: "🔌", label: "Integrations" },
  { id: "conversations", icon: "💬", label: "Conversations" },
  { id: "messages", icon: "📨", label: "Messages" },
  { id: "prompts", icon: "🎭", label: "System Prompts" },
  { id: "models", icon: "🤖", label: "Model Configs" },
  { id: "summaries", icon: "📝", label: "Summaries" },
  { id: "links", icon: "🔗", label: "Identity Links" },
  { id: "settings", icon: "⚙️", label: "Settings" },
  { id: "test", icon: "🧪", label: "Chat Test" },
];

export default function Sidebar({ screen, onNavigate, tokenPrefix, onLogout }) {
  return (
    <div className="sidebar">
      <div className="sidebar-logo">👻 GhostReply</div>
      <nav>
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
    </div>
  );
}

export { NAV };
