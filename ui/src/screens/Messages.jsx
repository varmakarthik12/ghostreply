import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Send,
  MessageSquare,
  RefreshCw,
  Trash2,
  Image as ImageIcon,
  Mic,
  Video as VideoIcon,
  Search,
  Filter,
  LayoutGrid,
  List,
  Eye,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Play,
  Pause,
  X,
  Sparkles,
  User,
  ChevronDown,
  Check,
  Globe,
  CornerDownRight,
} from "lucide-react";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Spinner from "../components/Spinner";
import { useResource } from "../lib/hooks";
import { apiGet, apiDel } from "../lib/api";
import { toast } from "../lib/toast";
import { fmtDate, fmtTime, fmtRelative, shortId, platformColor } from "../lib/utils";

export default function Messages({ initialConv }) {
  const [convS] = useResource(() => apiGet("/conversations"), []);
  const [convId, setConvId] = useState(initialConv?.id || "");
  const [convSearch, setConvSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [viewMode, setViewMode] = useState("feed"); // feed | table
  const [directionFilter, setDirectionFilter] = useState("all"); // all | in | out | media
  const [autoPoll, setAutoPoll] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Sync initialConv from props
  useEffect(() => {
    if (initialConv?.id) {
      setConvId(initialConv.id);
    }
  }, [initialConv]);

  const url = convId ? "/messages?conversation_id=" + convId : null;
  const [s, reload] = useResource(
    () => (url ? apiGet(url) : Promise.resolve([])),
    [url]
  );

  const feedBottomRef = useRef(null);

  // Close combobox when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-polling interval
  useEffect(() => {
    if (!convId || !autoPoll) return;
    const interval = setInterval(() => {
      reload();
    }, 2500);
    return () => clearInterval(interval);
  }, [convId, autoPoll, reload]);

  useEffect(() => {
    if (viewMode === "feed" && s.data?.length) {
      feedBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [s.data?.length, viewMode]);

  const conversations = convS.data || [];
  const activeConv = conversations.find((c) => c.id === convId);

  // Filter conversations for the searchable typeahead combobox
  const filteredConversations = useMemo(() => {
    if (!convSearch.trim()) return conversations;
    const q = convSearch.toLowerCase();
    return conversations.filter((c) => {
      return (
        c.title?.toLowerCase().includes(q) ||
        c.external_id?.toLowerCase().includes(q) ||
        c.platform?.toLowerCase().includes(q)
      );
    });
  }, [conversations, convSearch]);

  const handleSelectConversation = (c) => {
    setConvId(c.id);
    setConvSearch("");
    setIsDropdownOpen(false);
    setSelectedIds([]);
  };

  // Delete handlers
  async function handleDeleteSingle() {
    if (!deleteConfirm) return;
    try {
      await apiDel("/messages/" + deleteConfirm.id);
      toast("Message deleted");
      setDeleteConfirm(null);
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function handleBulkDelete() {
    let count = 0;
    for (const id of selectedIds) {
      try {
        await apiDel("/messages/" + id);
        count++;
      } catch (e) {
        toast(`Failed to delete message: ${e.message}`, "error");
      }
    }
    toast(`Deleted ${count} messages`);
    setSelectedIds([]);
    setBulkDeleteOpen(false);
    reload();
  }

  // Filter messages
  const rawMessages = s.data || [];
  const filteredMessages = rawMessages.filter((m) => {
    if (directionFilter === "in" && m.is_outbound) return false;
    if (directionFilter === "out" && !m.is_outbound) return false;
    if (directionFilter === "media" && !m.media_description && !m.MediaDescription) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const contentMatch = m.content?.toLowerCase().includes(q);
      const mediaMatch = (m.media_description || m.MediaDescription)?.toLowerCase().includes(q);
      return contentMatch || mediaMatch;
    }
    return true;
  });

  const tableColumns = [
    {
      header: "Direction",
      key: "is_outbound",
      width: 130,
      render: (r) => (
        <Badge
          color={r.is_outbound ? "primary" : "gray"}
          icon={r.is_outbound ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
        >
          {r.is_outbound ? "Outbound (AI)" : "Inbound (User)"}
        </Badge>
      ),
    },
    {
      header: "Content",
      key: "content",
      render: (r) => (
        <div style={{ wordBreak: "break-word", lineHeight: 1.5, color: "var(--text-main)" }}>
          {r.content || <span style={{ color: "var(--text-subtle)", fontStyle: "italic" }}>[Empty text content]</span>}
        </div>
      ),
    },
    {
      header: "Media Analysis",
      key: "media_description",
      render: (r) => {
        const desc = r.media_description || r.MediaDescription;
        if (!desc) return <span style={{ color: "var(--text-subtle)" }}>—</span>;
        const isVoice = desc.startsWith("Voice Note:");
        const isVideo = desc.startsWith("Video Clip:");
        return (
          <div
            style={{
              padding: "6px 10px",
              borderRadius: "var(--radius-sm)",
              background: isVoice ? "rgba(16, 185, 129, 0.08)" : isVideo ? "rgba(168, 85, 247, 0.08)" : "rgba(56, 189, 248, 0.08)",
              border: "1px solid var(--border)",
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600, marginBottom: 2 }}>
              {isVoice ? <Mic size={13} color="var(--success)" /> : isVideo ? <VideoIcon size={13} color="var(--purple)" /> : <ImageIcon size={13} color="var(--accent)" />}
              <span style={{ fontSize: 11 }}>{isVoice ? "Audio Note" : isVideo ? "Video Clip" : "Image Vision"}</span>
            </div>
            <div>{desc.replace(/^(Voice Note:|Video Clip:)\s*/, "")}</div>
          </div>
        );
      },
    },
    {
      header: "Timestamp",
      key: "timestamp",
      width: 170,
      render: (r) => (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {fmtDate(r.timestamp)}
        </span>
      ),
    },
    {
      header: "Actions",
      cellStyle: { textAlign: "right" },
      width: 80,
      render: (r) => (
        <button
          className="btn btn-danger btn-xs"
          onClick={() => setDeleteConfirm(r)}
          title="Delete Message"
        >
          <Trash2 size={12} />
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Header ── */}
      <div className="flex-row-between">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Send size={24} color="var(--primary)" />
            <span>Messages & Conversational Audit</span>
          </h1>
          <p className="card-subtitle">
            Inspect live message streams, multimodal analyses, and assistant replies.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {convId && (
            <>
              {/* Auto Poll Toggle */}
              <button
                className={`btn btn-sm ${autoPoll ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setAutoPoll(!autoPoll)}
                title={autoPoll ? "Pause Live Polling" : "Resume Live Polling"}
              >
                {autoPoll ? <Pause size={13} color="var(--success)" /> : <Play size={13} />}
                <span>{autoPoll ? "Live Polling" : "Paused"}</span>
              </button>

              {/* View Switcher */}
              <div
                style={{
                  display: "flex",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: 3,
                }}
              >
                <button
                  className={`btn btn-sm ${viewMode === "feed" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setViewMode("feed")}
                  style={{ borderRadius: "var(--radius-sm)", padding: "4px 8px" }}
                  title="Chat Stream View"
                >
                  <MessageSquare size={15} />
                </button>
                <button
                  className={`btn btn-sm ${viewMode === "table" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setViewMode("table")}
                  style={{ borderRadius: "var(--radius-sm)", padding: "4px 8px" }}
                  title="Audit Table View"
                >
                  <List size={15} />
                </button>
              </div>

              <button
                className="btn btn-secondary btn-sm"
                onClick={reload}
                title="Manual refresh"
              >
                <RefreshCw size={14} />
              </button>
            </>
          )}

          {selectedIds.length > 0 && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 size={14} />
              <span>Delete ({selectedIds.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Searchable Typeahead Conversation Combobox Bar ── */}
      <div
        className="glass-card"
        style={{
          padding: "14px 18px",
          marginBottom: 0,
          position: "relative",
          zIndex: 500,
          overflow: "visible",
        }}
      >
        <div className="flex-row-between" style={{ gap: 16, flexWrap: "wrap", overflow: "visible" }}>
          {/* Combobox container */}
          <div ref={dropdownRef} style={{ position: "relative", flex: 1, minWidth: 280, maxWidth: 480, overflow: "visible" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-main)", whiteSpace: "nowrap" }}>
                Conversation:
              </span>

              <div
                style={{
                  position: "relative",
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Search
                  size={15}
                  style={{
                    position: "absolute",
                    left: 10,
                    color: "var(--text-muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  type="text"
                  value={isDropdownOpen ? convSearch : activeConv ? `${activeConv.title || activeConv.external_id} (${activeConv.external_id})` : ""}
                  placeholder={convS.loading ? "Loading conversations…" : "Type to search conversations (e.g. Alex, Telegram)…"}
                  onFocus={() => {
                    setIsDropdownOpen(true);
                    setConvSearch("");
                  }}
                  onChange={(e) => {
                    setConvSearch(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  style={{
                    paddingLeft: 34,
                    paddingRight: 32,
                    height: 38,
                    fontSize: 13,
                    width: "100%",
                  }}
                />
                {convId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setConvId("");
                      setConvSearch("");
                      setIsDropdownOpen(false);
                    }}
                    style={{
                      position: "absolute",
                      right: 8,
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: 4,
                      display: "flex",
                    }}
                    title="Clear selection"
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <ChevronDown
                    size={14}
                    style={{
                      position: "absolute",
                      right: 10,
                      color: "var(--text-muted)",
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            </div>

            {/* Typeahead Dropdown List (Floating cleanly above all elements) */}
            {isDropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  maxHeight: 300,
                  overflowY: "auto",
                  background: "#0f172a",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "0 20px 40px -5px rgba(0, 0, 0, 0.75)",
                  backdropFilter: "blur(20px)",
                  zIndex: 9999,
                }}
              >
                {filteredConversations.length === 0 ? (
                  <div style={{ padding: "16px 14px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                    No conversations matching "{convSearch}"
                  </div>
                ) : (
                  filteredConversations.map((c) => {
                    const isSelected = c.id === convId;
                    return (
                      <div
                        key={c.id}
                        onClick={() => handleSelectConversation(c)}
                        style={{
                          padding: "10px 14px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          background: isSelected ? "rgba(99, 102, 241, 0.15)" : "transparent",
                          borderBottom: "1px solid var(--border-subtle)",
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                            <strong style={{ fontSize: 13, color: "var(--text-main)" }}>
                              {c.title || "Untitled Conversation"}
                            </strong>
                            {c.platform && (
                              <Badge color={platformColor(c.platform)}>{c.platform}</Badge>
                            )}
                          </div>
                          <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            ID: {c.external_id}
                          </div>
                        </div>

                        {isSelected && <Check size={16} color="var(--primary)" />}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {activeConv && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Total: <strong>{rawMessages.length}</strong> messages
              </div>
              <Badge color="primary">{activeConv.external_id}</Badge>
            </div>
          )}
        </div>
      </div>

      {/* ── Empty State / Conversation Selector Grid ── */}
      {!convId ? (
        <div className="glass-card" style={{ padding: "40px 24px", textAlign: "center" }}>
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <MessageSquare size={32} />
            </div>
            <div className="empty-state-title">Select a Conversation</div>
            <div className="empty-state-desc">
              Choose an active recipient thread from the search box above or click on one of the conversations below.
            </div>

            {conversations.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 12,
                  marginTop: 24,
                  textAlign: "left",
                  width: "100%",
                }}
              >
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    className="glass-card glass-card-interactive"
                    onClick={() => handleSelectConversation(c)}
                    style={{
                      padding: "14px 16px",
                      cursor: "pointer",
                      marginBottom: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div className="flex-row-between">
                      <strong style={{ fontSize: 13, color: "var(--text-main)" }} className="truncate-text">
                        {c.title || "Untitled Conversation"}
                      </strong>
                      {c.platform && <Badge color={platformColor(c.platform)}>{c.platform}</Badge>}
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      ID: {c.external_id}
                    </div>
                    {c.created_at && (
                      <div style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 2 }}>
                        Created {fmtRelative(c.created_at)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ── Filter Toolbar ── */}
          <div className="flex-row-between" style={{ gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["all", "in", "out", "media"].map((dir) => (
                <button
                  key={dir}
                  className={`btn btn-xs ${directionFilter === dir ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setDirectionFilter(dir)}
                >
                  {dir === "all" && "All Messages"}
                  {dir === "in" && "↓ Inbound Only"}
                  {dir === "out" && "↑ Outbound (AI)"}
                  {dir === "media" && "🖼️ Media Only"}
                </button>
              ))}
            </div>

            <div className="table-search-box" style={{ maxWidth: 260 }}>
              <Search className="table-search-icon" size={14} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search messages…"
                style={{ height: 32, fontSize: 12 }}
              />
              {searchTerm && (
                <button className="table-search-clear" onClick={() => setSearchTerm("")}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* ── View Rendering ── */}
          {viewMode === "feed" ? (
            <div
              className="glass-card"
              style={{
                padding: 0,
                minHeight: 500,
                maxHeight: 680,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                marginBottom: 0,
              }}
            >
              <div className="chat-bubble-stream">
                {filteredMessages.length === 0 ? (
                  <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", padding: 48 }}>
                    No messages match the current filter.
                  </div>
                ) : (
                  filteredMessages.map((m) => {
                    const desc = m.media_description || m.MediaDescription;
                    return (
                      <div
                        key={m.id}
                        className={`chat-row ${m.is_outbound ? "outbound" : "inbound"}`}
                      >
                        <div className={`chat-avatar ${m.is_outbound ? "ai" : "user"}`}>
                          {m.is_outbound ? "AI" : <User size={16} />}
                        </div>

                        <div className="chat-bubble-content">
                          <div className={`chat-bubble ${m.is_outbound ? "outbound" : "inbound"}`}>
                            {desc && (
                              <div
                                style={{
                                  fontSize: 12,
                                  padding: "6px 10px",
                                  borderRadius: 8,
                                  background: m.is_outbound ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.06)",
                                  border: "1px solid rgba(255,255,255,0.1)",
                                  marginBottom: m.content ? 8 : 0,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                {desc.startsWith("Voice Note:") ? <Mic size={14} /> : desc.startsWith("Video Clip:") ? <VideoIcon size={14} /> : <ImageIcon size={14} />}
                                <span>{desc}</span>
                              </div>
                            )}
                            <div>{m.content}</div>
                          </div>
                          <div
                            className="chat-timestamp"
                            style={{ textAlign: m.is_outbound ? "right" : "left" }}
                          >
                            {fmtTime(m.timestamp)} · {fmtDate(m.timestamp)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={feedBottomRef} />
              </div>
            </div>
          ) : (
            <DataTable
              columns={tableColumns}
              data={filteredMessages}
              loading={s.loading}
              error={s.error}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              searchPlaceholder="Filter message records…"
              emptyTitle="No messages found"
              emptyDescription="No messages found matching your criteria."
            />
          )}
        </>
      )}

      {/* ── Single Delete Confirm ── */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Message"
        message="Are you sure you want to permanently delete this message record?"
        confirmText="Delete Message"
        onConfirm={handleDeleteSingle}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* ── Bulk Delete Confirm ── */}
      <ConfirmDialog
        isOpen={bulkDeleteOpen}
        title="Delete Selected Messages"
        message={`Are you sure you want to permanently delete ${selectedIds.length} messages?`}
        confirmText={`Delete ${selectedIds.length} Messages`}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </div>
  );
}
