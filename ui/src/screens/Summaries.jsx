import React, { useState } from "react";
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
} from "lucide-react";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Spinner from "../components/Spinner";
import { useResource } from "../lib/hooks";
import { apiGet, apiPost, apiDel } from "../lib/api";
import { toast } from "../lib/toast";
import { fmtDate, fmtRelative, shortId, copyToClipboard } from "../lib/utils";

export default function Summaries() {
  const [convS] = useResource(() => apiGet("/conversations"), []);
  const [convId, setConvId] = useState("");
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
  const summaries = s.data || [];

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

      {/* ── Filter & Trigger Toolbar ── */}
      <div className="glass-card" style={{ padding: "14px 18px", marginBottom: 0 }}>
        <div className="flex-row-between">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
            <Filter size={15} color="var(--text-subtle)" />
            <select
              value={convId}
              onChange={(e) => {
                setConvId(e.target.value);
                setSelectedIds([]);
              }}
              style={{ maxWidth: 320, height: 38, fontSize: 13 }}
            >
              <option value="">All Conversations</option>
              {convs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || c.external_id}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-primary btn-sm"
            onClick={handleTrigger}
            disabled={!convId || triggering}
            title={!convId ? "Select a conversation first" : "Run background memory summarizer"}
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
          emptyDescription="Summaries are generated automatically when message thresholds are reached or triggered manually."
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
                  Select a conversation and click "Trigger Memory Consolidation" to generate the first long-term memory summary.
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
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: "var(--text-main)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {item.text}
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
                fontSize: 14,
                lineHeight: 1.7,
                color: "var(--text-main)",
                whiteSpace: "pre-wrap",
                maxHeight: "60vh",
                overflowY: "auto",
                fontFamily: "inherit",
              }}
            >
              {detailsModal.text}
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
