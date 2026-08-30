import { useEffect, useState, useMemo } from "react";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import CommandPalette from "./components/CommandPalette";
import Spinner from "./components/Spinner";
import ToastContainer from "./components/ToastContainer";
import { clearToken, getToken } from "./lib/api";
import ChatTest from "./screens/ChatTest";
import Conversations from "./screens/Conversations";
import Dashboard from "./screens/Dashboard";
import IdentityLinks from "./screens/IdentityLinks";
import Integrations from "./screens/Integrations";
import Messages from "./screens/Messages";
import ModelConfigs from "./screens/ModelConfigs";
import Settings from "./screens/Settings";
import SetupScreen from "./screens/SetupScreen";
import Summaries from "./screens/Summaries";
import SystemPrompts from "./screens/SystemPrompts";
import ActivityLogs from "./screens/ActivityLogs";

const SCREEN_TITLES = {
  dashboard: "Operations Dashboard",
  integrations: "Messaging Integrations",
  conversations: "Conversations & Threads",
  messages: "Messages & Audit Logs",
  prompts: "Persona System Prompts",
  models: "Model Configurations",
  summaries: "Long-Term Summaries",
  logs: "Activity Logs & Traces",
  links: "Unified Cross-Platform Identities",
  settings: "Application Settings",
  test: "Chat Test & Multimodal Playground",
};

export default function App() {
  const [screen, setScreen] = useState("dashboard");
  const [viewMsgConv, setViewMsgConv] = useState(null);
  const [setupDone, setSetupDone] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tokenPrefix, setTokenPrefix] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState("ok");

  useEffect(() => {
    const t = getToken();
    if (!t) {
      setChecking(false);
      return;
    }

    fetch("/api/integrations", { headers: { Authorization: "Bearer " + t } })
      .then((r) => {
        if (r.status !== 401) {
          setSetupDone(true);
          setServerStatus("ok");
        } else {
          clearToken();
        }
        setChecking(false);
      })
      .catch(() => {
        setServerStatus("error");
        setChecking(false);
      });

    fetch("/health")
      .then((r) => r.json())
      .then((h) => {
        setTokenPrefix(h.token_prefix || "");
        if (h.status) setServerStatus(h.status === "ok" ? "ok" : "error");
      })
      .catch(() => setServerStatus("error"));

    // Global Command Palette Shortcut (⌘K / Ctrl+K)
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCmdOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // Browser History PopState
    const handlePopState = () => {
      const path = window.location.pathname.replace(/^\//, "") || "dashboard";
      setScreen(path);
    };
    window.addEventListener("popstate", handlePopState);
    handlePopState();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  function handleConnect() {
    setSetupDone(true);
    setServerStatus("ok");
    fetch("/health")
      .then((r) => r.json())
      .then((h) => setTokenPrefix(h.token_prefix || ""))
      .catch(() => {});
  }

  function handleLogout() {
    clearToken();
    setSetupDone(false);
  }

  function navigate(id) {
    const path = id === "dashboard" ? "/" : "/" + id;
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    setScreen(id);
    setIsSidebarOpen(false);
    if (id !== "messages") setViewMsgConv(null);
  }

  function viewMessages(conv) {
    setViewMsgConv(conv);
    if (window.location.pathname !== "/messages") {
      window.history.pushState(null, "", "/messages");
    }
    setScreen("messages");
    setIsSidebarOpen(false);
  }

  if (checking) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          width: "100%",
          gap: 16,
          background: "var(--bg-app)",
        }}
      >
        <Spinner lg />
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Initializing GhostReply…</span>
      </div>
    );
  }

  if (!setupDone) {
    return (
      <>
        <ToastContainer />
        <SetupScreen onConnect={handleConnect} />
      </>
    );
  }

  function renderScreen() {
    switch (screen) {
      case "dashboard":
        return <Dashboard onNavigate={navigate} />;
      case "integrations":
        return <Integrations />;
      case "conversations":
        return <Conversations onViewMessages={viewMessages} />;
      case "messages":
        return <Messages initialConv={viewMsgConv} />;
      case "prompts":
        return <SystemPrompts />;
      case "models":
        return <ModelConfigs />;
      case "summaries":
        return <Summaries />;
      case "logs":
        return <ActivityLogs />;
      case "links":
        return <IdentityLinks />;
      case "settings":
        return <Settings />;
      case "test":
        return <ChatTest />;
      default:
        return <Dashboard onNavigate={navigate} />;
    }
  }

  return (
    <div className="app-layout">
      <ToastContainer />

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCmdOpen}
        onClose={() => setIsCmdOpen(false)}
        onNavigate={navigate}
        onLogout={handleLogout}
      />

      {/* Mobile Backdrop */}
      <div
        className={`sidebar-backdrop${isSidebarOpen ? " open" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Modern Sidebar */}
      <Sidebar
        screen={screen}
        onNavigate={navigate}
        tokenPrefix={tokenPrefix}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Main View Area */}
      <div className="main-content-wrapper">
        <Navbar
          screen={screen}
          screenTitle={SCREEN_TITLES[screen] || screen}
          tokenPrefix={tokenPrefix}
          onOpenCommandPalette={() => setIsCmdOpen(true)}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onLogout={handleLogout}
          serverStatus={serverStatus}
        />
        <main className="main-viewport">{renderScreen()}</main>
      </div>
    </div>
  );
}

