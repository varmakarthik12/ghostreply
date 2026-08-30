import React, { useState, useEffect, useRef } from "react";
import {
  Search,
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
  Plus,
  RotateCw,
  LogOut,
  X,
} from "lucide-react";

export default function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  onLogout,
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const ACTIONS = [
    // Navigation
    { id: "dashboard", label: "Dashboard", category: "Navigation", icon: LayoutDashboard, keywords: "home stats metrics" },
    { id: "integrations", label: "Integrations", category: "Navigation", icon: Plug, keywords: "platform telegram whatsapp bot webhook" },
    { id: "conversations", label: "Conversations", category: "Navigation", icon: MessageSquare, keywords: "chats threads contacts" },
    { id: "messages", label: "Messages", category: "Navigation", icon: Send, keywords: "history audit logs feed" },
    { id: "prompts", label: "System Prompts", category: "Navigation", icon: Sparkles, keywords: "personas instructions prompts" },
    { id: "models", label: "Model Configs", category: "Navigation", icon: Bot, keywords: "llm ollama gpt gemini temperature thinking" },
    { id: "summaries", label: "Summaries", category: "Navigation", icon: FileText, keywords: "memory background long term knowledge" },
    { id: "logs", label: "Activity Logs", category: "Navigation", icon: Activity, keywords: "operations audit status latency debug" },
    { id: "links", label: "Unified Identities", category: "Navigation", icon: Link2, keywords: "identity cross platform memory contacts" },
    { id: "settings", label: "Settings", category: "Navigation", icon: Settings, keywords: "configuration config debug token timezone" },
    { id: "test", label: "Chat Test (Playground)", category: "Navigation", icon: FlaskConical, keywords: "test playground simulate ai reply" },
    
    // Quick Shortcuts
    { id: "act_test", label: "Open Chat Playground", category: "Quick Actions", icon: FlaskConical, action: () => onNavigate("test") },
    { id: "act_integrations_new", label: "Add New Integration", category: "Quick Actions", icon: Plus, action: () => onNavigate("integrations") },
    { id: "act_prompts_new", label: "Create Persona Prompt", category: "Quick Actions", icon: Plus, action: () => onNavigate("prompts") },
    { id: "act_logout", label: "Change Auth Token / Log Out", category: "System", icon: LogOut, action: onLogout },
  ];

  const filtered = ACTIONS.filter((item) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.keywords && item.keywords.toLowerCase().includes(q))
    );
  });

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === "Enter" && filtered.length > 0) {
        e.preventDefault();
        execute(filtered[selectedIndex]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filtered, selectedIndex]);

  const execute = (item) => {
    if (!item) return;
    onClose();
    if (item.action) {
      item.action();
    } else {
      onNavigate(item.id);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog command-palette-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: 0 }}
      >
        <div className="command-search-input">
          <Search size={18} color="var(--primary)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search screens…"
          />
          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon-only btn-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="command-list">
          {filtered.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No commands or screens matching "{query}"
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  className={`command-item${isSelected ? " selected" : ""}`}
                  onClick={() => execute(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="command-icon" style={{ display: "flex", color: isSelected ? "var(--primary)" : "var(--text-muted)" }}>
                      <Icon size={16} />
                    </div>
                    <span>{item.label}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border)",
            background: "rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <div style={{ display: "flex", gap: 12 }}>
            <span><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Select</span>
            <span><kbd>ESC</kbd> Close</span>
          </div>
          <span>GhostReply v1.0</span>
        </div>
      </div>
    </div>
  );
}
