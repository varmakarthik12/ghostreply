import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  FileText,
  Sparkles,
  Trash2,
  Filter,
  Eye,
  Clock,
  MessageSquare,
  Copy,
  Check,
  LayoutGrid,
  List,
  Search,
  ChevronDown,
  X,
} from "lucide-react";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Spinner from "../components/Spinner";
import MarkdownView from "../components/MarkdownView";
import { useResource } from "../lib/hooks";
import { apiGet, apiPost, apiDel } from "../lib/api";
import { toast } from "../lib/toast";
import { fmtDate, fmtRelative, shortId, platformColor, copyToClipboard } from "../lib/utils";

export default function Summaries() {
  const [convS] = useResource(() => apiGet("/conversations"), []);
  const [convId, setConvId] = useState("");
  const [convSearch, setConvSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [triggering, setTriggering] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [detailsModal, setDetailsModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [viewMode, setViewMode] = useState("timeline"); // timeline | table

  const url = convId ? "/summaries?conversation_id=" + convId : "/summaries";
  const [s, reload] = useResource(() => apiGet(url), [url]);

  const convs = convS.data || [];
  const convMap = Object.fromEntries(convs.map((c) => [c.id, c]));
  const activeConv = convs.find((c) => c.id === convId);
  const summaries = s.data || [];

  // Close combobox on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter conversations for the searchable typeahead combobox
  const filteredConversations = useMemo(() => {
    if (!convSearch.trim()) return convs;
    const q = convSearch.toLowerCase();
    return convs.filter((c) => {
      return (
        c.title?.toLowerCase().includes(q) ||
        c.external_id?.toLowerCase().includes(q) ||
        c.platform?.toLowerCase().includes(q)
      );
    });
  }, [convs, convSearch]);

  const handleSelectConversation = (c) => {
    if (c) {
      setConvId(c.id);
      setConvSearch("");
    } else {
      setConvId("");
      setConvSearch("");
    }
    setIsDropdownOpen(false);
    setSelectedIds([]);
  };

  async function handleTrigger() {
    if (!convId) return;
    setTriggering(true);
    try {
      await apiPost("/summaries", { conversation_id: convId });
      toast("Background summarization worker triggered");
      reload();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setTriggering(false);
    }
  }

  async function handleDeleteSingle() {
    if (!deleteConfirm) return;
    try {
      await apiDel("/summaries/" + deleteConfirm.id);
      toast("Summary record deleted");
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
        await apiDel("/summaries/" + id);
        count++;
      } catch (e) {
        toast(`Failed to delete summary: ${e.message}`, "error");
      }
    }
    toast(`Deleted ${count} summaries`);
    setSelectedIds([]);
    setBulkDeleteOpen(false);
    reload();
  }

  const handleCopyText = (text, id) => {
    copyToClipboard(text);
    setCopiedId(id);
    toast("Summary memory text copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const columns = [
    {
      header: "Conversation",
      key: "conversation_id",
      render: (r) => {
        const c = convMap[r.conversation_id];
        return (
          <div>
            <strong style={{ color: "var(--text-main)", display: "block" }}>
              {c?.title || "Conversation"}
            </strong>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-subtle)" }}>
              {c?.external_id || shortId(r.conversation_id)}
            </span>
          </div>
        );
      },
    },
    {
      header: "Consolidated Memory Snippet",
      key: "text",
      render: (r) => (
        <div style={{ maxWidth: 460, color: "var(--text-main)", fontStyle: "italic", lineHeight: 1.4 }}>
          "{r.text.slice(0, 120)}{r.text.length > 120 ? "…" : ""}"
        </div>
      ),
    },
    {
      header: "Generated",
      key: "created_at",
      render: (r) => (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {fmtDate(r.created_at)}
        </span>
      ),
    },
    {
      header: "Actions",
      cellStyle: { textAlign: "right" },
      render: (r) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => setDetailsModal(r)}
            title="View Full Memory"
          >
            <Eye size={13} />
            <span>Read</span>
          </button>
          <button
            className="btn btn-danger btn-xs"
            onClick={() => setDeleteConfirm(r)}
            title="Delete Summary"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Page Header ── */}
      <div className="flex-row-between">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FileText size={24} color="var(--primary)" />
            <span>Long-Term Memory & Summaries</span>
          </h1>
          <p className="card-subtitle">
            Consolidated background memory extracted from historical conversations to maintain long-term context.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {selectedIds.length > 0 && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 size={14} />
              <span>Delete ({selectedIds.length})</span>
            </button>
          )}

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
              className={`btn btn-sm ${viewMode === "timeline" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("timeline")}
              style={{ borderRadius: "var(--radius-sm)", padding: "4px 8px" }}
              title="Timeline Card View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              className={`btn btn-sm ${viewMode === "table" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("table")}
              style={{ borderRadius: "var(--radius-sm)", padding: "4px 8px" }}
              title="Data Table View"
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Searchable Typeahead Conversation Picker Bar ── */}
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
                Filter Conversation:
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
                  placeholder={convS.loading ? "Loading conversations…" : "All Conversations (Type to search…)"}
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
                    title="Show all conversations"
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

            {/* Typeahead Dropdown Menu */}
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
                {/* All Conversations Option */}
                <div
                  onClick={() => handleSelectConversation(null)}
                  style={{
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    background: !convId ? "rgba(99, 102, 241, 0.15)" : "transparent",
                    borderBottom: "1px solid var(--border-subtle)",
                    fontWeight: 600,
                    fontSize: 13,
                    color: "var(--text-main)",
                  }}
                  onMouseEnter={(e) => {
                    if (convId) e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (convId) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span>All Conversations</span>
                  {!convId && <Check size={16} color="var(--primary)" />}
                </div>

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

          <button
            className="btn btn-primary btn-sm"
            onClick={handleTrigger}
            disabled={!convId || triggering}
            title={!convId ? "Select a conversation first to trigger summarization" : "Run background memory summarizer"}
          >
            {triggering ? <Spinner /> : <Sparkles size={14} />}
            <span>Trigger Memory Consolidation</span>
          </button>
        </div>
      </div>

      {/* ── Content View ── */}
      {viewMode === "table" ? (
        <DataTable
          columns={columns}
          data={summaries}
          loading={s.loading}
          error={s.error}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          searchPlaceholder="Search memory summaries by keyword…"
          searchKeys={["text", "conversation_id"]}
          emptyTitle="No background memory summaries"
          emptyDescription={
            convId
              ? "No memory summaries recorded for this conversation yet. Click 'Trigger Memory Consolidation' above."
              : "Summaries are generated automatically when message thresholds are reached or triggered manually."
          }
        />
      ) : (
        /* ── Timeline View ── */
        <div>
          {s.loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="glass-card" style={{ height: 140 }}>
                  <div className="skeleton" style={{ width: "30%", height: 18, marginBottom: 12 }} />
                  <div className="skeleton" style={{ width: "95%", height: 16, marginBottom: 6 }} />
                  <div className="skeleton" style={{ width: "80%", height: 16 }} />
                </div>
              ))}
            </div>
          ) : summaries.length === 0 ? (
            <div className="glass-card" style={{ padding: "56px 24px", textAlign: "center" }}>
              <div className="empty-state-box">
                <div className="empty-state-icon">
                  <FileText size={28} />
                </div>
                <div className="empty-state-title">No memory summaries recorded</div>
                <div className="empty-state-desc">
                  {convId
                    ? "Click 'Trigger Memory Consolidation' above to generate the first long-term memory summary for this conversation."
                    : "Select a conversation above and click 'Trigger Memory Consolidation' to generate a long-term memory summary."}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {summaries.map((item) => {
                const conv = convMap[item.conversation_id];
                return (
                  <div key={item.id} className="glass-card glass-card-interactive" style={{ padding: 18, marginBottom: 0 }}>
                    <div className="flex-row-between" style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "var(--radius-md)",
                            background: "var(--purple-subtle)",
                            color: "var(--purple)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <FileText size={16} />
                        </div>
                        <div>
                          <strong style={{ color: "var(--text-main)", fontSize: 14 }}>
                            {conv?.title || "Conversation"}
                          </strong>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            Generated {fmtDate(item.created_at)} ({fmtRelative(item.created_at)})
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleCopyText(item.text, item.id)}
                          title="Copy Summary"
                        >
                          {copiedId === item.id ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                        </button>
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => setDetailsModal(item)}
                          title="View Full Memory"
                        >
                          <Eye size={13} />
                          <span>Inspect</span>
                        </button>
                        <button
                          className="btn btn-danger btn-xs"
                          onClick={() => setDeleteConfirm(item)}
                          title="Delete Summary"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        background: "rgba(0, 0, 0, 0.2)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-md)",
                        padding: "14px 16px",
                      }}
                    >
                      <MarkdownView content={item.text} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Summary Details Reader Modal ── */}
      {detailsModal && (
        <Modal
          title="Consolidated Memory Details"
          subtitle={`Conversation: ${convMap[detailsModal.conversation_id]?.title || detailsModal.conversation_id}`}
          onClose={() => setDetailsModal(null)}
          wide
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: "var(--radius-md)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <span>Created: <strong>{fmtDate(detailsModal.created_at)}</strong></span>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => handleCopyText(detailsModal.text, "modal")}
              >
                {copiedId === "modal" ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                <span>Copy Text</span>
              </button>
            </div>

            <div
              style={{
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: 20,
                maxHeight: "60vh",
                overflowY: "auto",
              }}
            >
              <MarkdownView content={detailsModal.text} />
            </div>

            <div className="modal-footer-bar" style={{ padding: "16px 0 0", background: "none", borderTop: "1px solid var(--border)" }}>
              <button className="btn btn-primary" onClick={() => setDetailsModal(null)}>
                Close Reader
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Confirm Single Delete ── */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Summary Memory"
        message="Are you sure you want to delete this consolidated memory record? Future auto-replies may lack this historical background."
        confirmText="Delete Summary"
        onConfirm={handleDeleteSingle}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* ── Confirm Bulk Delete ── */}
      <ConfirmDialog
        isOpen={bulkDeleteOpen}
        title="Delete Multiple Summaries"
        message={`Are you sure you want to delete ${selectedIds.length} summaries?`}
        confirmText={`Delete ${selectedIds.length} Summaries`}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </div>
  );
}
