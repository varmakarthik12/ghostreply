import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
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

export default function App() {
  const [screen, setScreen] = useState("dashboard");
  const [viewMsgConv, setViewMsgConv] = useState(null);
  const [setupDone, setSetupDone] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tokenPrefix, setTokenPrefix] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      setChecking(false);
      return;
    }
    fetch("/api/integrations", { headers: { Authorization: "Bearer " + t } })
      .then((r) => {
        if (r.status !== 401) setSetupDone(true);
        else clearToken();
        setChecking(false);
      })
      .catch(() => setChecking(false));
    fetch("/health")
      .then((r) => r.json())
      .then((h) => setTokenPrefix(h.token_prefix || ""))
      .catch(() => {});

    // Router
    const handlePopState = () => {
      const path = window.location.pathname.replace(/^\//, "") || "dashboard";
      setScreen(path);
    };
    window.addEventListener("popstate", handlePopState);
    handlePopState();
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function handleConnect() {
    setSetupDone(true);
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
    setIsSidebarOpen(false); // Close sidebar on navigate (mobile)
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
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          width: "100%",
          gap: 12,
        }}
      >
        <Spinner lg /> <span style={{ color: "var(--muted)" }}>Loading…</span>
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
        return <Dashboard />;
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
      case "links":
        return <IdentityLinks />;
      case "settings":
        return <Settings />;
      case "test":
        return <ChatTest />;
      default:
        return <Dashboard />;
    }
  }

  return (
    <>
      <ToastContainer />
      <header className="mobile-header">
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>
          👻 GhostReply
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setIsSidebarOpen(true)}
        >
          Menu
        </button>
      </header>
      <div
        className={`sidebar-overlay${isSidebarOpen ? " visible" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
      />
      <Sidebar
        screen={screen}
        onNavigate={navigate}
        tokenPrefix={tokenPrefix}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <main className="main">{renderScreen()}</main>
    </>
  );
}
