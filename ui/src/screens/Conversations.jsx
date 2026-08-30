import React, { useState } from "react";
import {
  MessageSquare,
  Trash2,
  Send,
  Sparkles,
  ExternalLink,
  ChevronRight,
  User,
  Clock,
  Layers,
  FileText,
  Filter,
} from "lucide-react";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Drawer from "../components/Drawer";
import ConfirmDialog from "../components/ConfirmDialog";
import Spinner from "../components/Spinner";
import { useResource } from "../lib/hooks";
import { apiGet, apiDel, apiPost } from "../lib/api";
import { toast } from "../lib/toast";
import { fmtDate, fmtRelative, shortId, platformColor } from "../lib/utils";

export default function Conversations({ onViewMessages }) {
  const [intS] = useResource(() => apiGet("/integrations"), []);
  const [selectedIntegration, setSelectedIntegration] = useState("");
  const url = selectedIntegration
    ? "/conversations?integration_id=" + selectedIntegration
    : "/conversations";
  const [s, reload] = useResource(() => apiGet(url), [url]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeDrawerConv, setActiveDrawerConv] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [triggeringSummary, setTriggeringSummary] = useState(false);

  const integrations = intS.data || [];
  const intMap = Object.fromEntries(integrations.map((i) => [i.id, i]));

  function getIntegrationLabel(id) {
    const i = intMap[id];
    return i ? `${i.platform} · ${i.account}` : shortId(id);
  }

  async function handleDeleteSingle() {
    if (!deleteConfirm) return;
    try {
      await apiDel("/conversations/" + deleteConfirm.id);
      toast("Conversation deleted");
      if (activeDrawerConv?.id === deleteConfirm.id) setActiveDrawerConv(null);
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
        await apiDel("/conversations/" + id);
        count++;
      } catch (e) {
        toast(`Failed to delete ${id}: ${e.message}`, "error");
      }
    }
    toast(`Deleted ${count} conversations`);
    setSelectedIds([]);
    setBulkDeleteOpen(false);
    reload();
  }

  async function handleTriggerSummary(convId) {
    setTriggeringSummary(true);
    try {
      await apiPost("/summaries", { conversation_id: convId });
      toast("Summary operation triggered in background");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setTriggeringSummary(false);
    }
  }

  const columns = [
    {
      header: "Recipient / Title",
      key: "title",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "var(--radius-full)",
              background: "var(--bg-surface-elevated)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--primary)",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {(r.title || r.external_id || "?")[0].toUpperCase()}
          </div>
          <div>
            <strong style={{ color: "var(--text-main)", display: "block" }}>
              {r.title || "Untitled Conversation"}
            </strong>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-subtle)" }}>
              ID: {r.external_id}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: "Integration",
      key: "integration_id",
      render: (r) => {
        const intObj = intMap[r.integration_id];
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {intObj && (
              <Badge color={platformColor(intObj.platform)}>
                {intObj.platform}
              </Badge>
            )}
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {intObj?.account || shortId(r.integration_id)}
            </span>
          </div>
        );
      },
    },
    {
      header: "Created",
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
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-primary btn-xs"
            onClick={() => onViewMessages(r)}
            title="Open Interactive Messages Studio"
          >
            <Send size={12} />
            <span>Messages</span>
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => setActiveDrawerConv(r)}
            title="Inspect Details"
          >
            <ChevronRight size={14} />
          </button>
          <button
            className="btn btn-danger btn-xs"
            onClick={() => setDeleteConfirm(r)}
            title="Delete Conversation"
          >
            <Trash2 size={12} />
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
            <MessageSquare size={24} color="var(--primary)" />
            <span>Active Conversations</span>
          </h1>
          <p className="card-subtitle">
            All recipient threads across platforms with memory tracking and auto-reply logs.
          </p>
        </div>

        {selectedIds.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 size={14} />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Data Table with Integrated Filters ── */}
      <DataTable
        columns={columns}
        data={s.data || []}
        loading={s.loading}
        error={s.error}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        searchPlaceholder="Search conversations by name, external ID, or title…"
        searchKeys={["title", "external_id"]}
        onRowClick={(row) => setActiveDrawerConv(row)}
        filterControls={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Filter size={14} color="var(--text-subtle)" />
            <select
              value={selectedIntegration}
              onChange={(e) => setSelectedIntegration(e.target.value)}
              style={{ width: "auto", minWidth: 180, height: 36, padding: "6px 28px 6px 10px", fontSize: 12 }}
            >
              <option value="">All Integrations</option>
              {integrations.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.platform} · {i.account}
                </option>
              ))}
            </select>
          </div>
        }
        emptyTitle="No conversations found"
        emptyDescription={
          selectedIntegration
            ? "No conversations have been recorded for this integration yet."
            : "Conversations will appear automatically as incoming messages arrive."
        }
      />

      {/* ── Slide-Over Detail Drawer ── */}
      <Drawer
        isOpen={!!activeDrawerConv}
        onClose={() => setActiveDrawerConv(null)}
        title={activeDrawerConv?.title || "Conversation Details"}
        subtitle={`External ID: ${activeDrawerConv?.external_id || "—"}`}
        wide
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleTriggerSummary(activeDrawerConv?.id)}
              disabled={triggeringSummary}
            >
              {triggeringSummary ? <Spinner /> : <Sparkles size={14} color="var(--purple)" />}
              <span>Trigger Summary</span>
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                const conv = activeDrawerConv;
                setActiveDrawerConv(null);
                onViewMessages(conv);
              }}
            >
              <Send size={14} />
              <span>Open in Messages Studio</span>
            </button>
          </div>
        }
      >
        {activeDrawerConv && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Summary Card */}
            <div className="glass-card" style={{ padding: 16, marginBottom: 0 }}>
              <h4 style={{ fontSize: 13, marginBottom: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Metadata Overview
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                <div className="flex-row-between">
                  <span style={{ color: "var(--text-muted)" }}>Platform / Account:</span>
                  <span>{getIntegrationLabel(activeDrawerConv.integration_id)}</span>
                </div>
                <div className="flex-row-between">
                  <span style={{ color: "var(--text-muted)" }}>External Recipient ID:</span>
                  <code className="mono">{activeDrawerConv.external_id}</code>
                </div>
                <div className="flex-row-between">
                  <span style={{ color: "var(--text-muted)" }}>Internal UUID:</span>
                  <code className="mono">{activeDrawerConv.id}</code>
                </div>
                <div className="flex-row-between">
                  <span style={{ color: "var(--text-muted)" }}>First Tracked:</span>
                  <span>{fmtDate(activeDrawerConv.created_at)}</span>
                </div>
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="glass-card" style={{ padding: 16, marginBottom: 0 }}>
              <h4 style={{ fontSize: 13, marginBottom: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Conversation Actions
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  style={{ justifyContent: "flex-start", gap: 10 }}
                  onClick={() => {
                    const conv = activeDrawerConv;
                    setActiveDrawerConv(null);
                    onViewMessages(conv);
                  }}
                >
                  <Send size={16} color="var(--primary)" />
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600 }}>Interactive Chat Stream</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>View bubbles, media attachments, and history</div>
                  </div>
                </button>

                <button
                  className="btn btn-secondary"
                  style={{ justifyContent: "flex-start", gap: 10 }}
                  onClick={() => handleTriggerSummary(activeDrawerConv.id)}
                  disabled={triggeringSummary}
                >
                  <FileText size={16} color="var(--purple)" />
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600 }}>Consolidate Memory Now</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Trigger LLM background summarization worker</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── Confirm Single Delete ── */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Conversation"
        message={`Are you sure you want to delete conversation "${deleteConfirm?.title || deleteConfirm?.external_id}"? All message history, summaries, and activity logs for this conversation will be permanently deleted.`}
        confirmText="Delete Conversation"
        onConfirm={handleDeleteSingle}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* ── Confirm Bulk Delete ── */}
      <ConfirmDialog
        isOpen={bulkDeleteOpen}
        title="Delete Multiple Conversations"
        message={`Are you sure you want to delete ${selectedIds.length} selected conversations and all their associated message history?`}
        confirmText={`Delete ${selectedIds.length} Conversations`}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </div>
  );
}
