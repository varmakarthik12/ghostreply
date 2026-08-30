import React, { useState } from "react";
import {
  Plug,
  Plus,
  LayoutGrid,
  List,
  Copy,
  Check,
  Edit2,
  Trash2,
  Globe,
  Radio,
  Key,
  Layers,
  ExternalLink,
} from "lucide-react";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Field from "../components/Field";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Spinner from "../components/Spinner";
import { apiDel, apiGet, apiPost, apiPut } from "../lib/api";
import { useResource } from "../lib/hooks";
import { toast } from "../lib/toast";
import { platformColor, shortId, copyToClipboard } from "../lib/utils";

const PLATFORM_PRESETS = [
  { id: "telegram", name: "Telegram", placeholder: "Telegram Bot Token", hint: "From @BotFather" },
  { id: "whatsapp", name: "WhatsApp", placeholder: "Cloud API Token / Webhook Token", hint: "From Meta Developers" },
  { id: "discord", name: "Discord", placeholder: "Bot Token / Webhook URL", hint: "From Discord Developer Portal" },
  { id: "slack", name: "Slack", placeholder: "Bot User OAuth Token (xoxb-…)", hint: "From api.slack.com" },
  { id: "sms", name: "SMS / Twilio", placeholder: "Twilio Auth Token / Sid", hint: "From Twilio Console" },
  { id: "webhook", name: "Custom Webhook", placeholder: "Custom auth bearer token (optional)", hint: "Generic HTTP integration" },
];

function IntegrationForm({ init, onSave, onCancel }) {
  const [f, setF] = useState({
    platform: "",
    account: "",
    token: "",
    endpoint_url: "",
    active: 1,
    ...init,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const applyPreset = (preset) => {
    setF((prev) => ({
      ...prev,
      platform: preset.id,
      account: prev.account || `${preset.name} Account`,
    }));
  };

  async function save() {
    if (!f.platform.trim() || !f.account.trim()) {
      setErr("Platform and Account Label are required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      if (init?.id) await apiPut("/integrations/" + init.id, f);
      else await apiPost("/integrations", f);
      onSave();
    } catch (e) {
      setErr(e.message);
    }
    setSaving(false);
  }

  return (
    <>
      {err && (
        <Alert type="error" onClose={() => setErr("")} style={{ marginBottom: 16 }}>
          {err}
        </Alert>
      )}

      {/* Preset Pills */}
      {!init?.id && (
        <div style={{ marginBottom: 16 }}>
          <label className="form-label" style={{ marginBottom: 8 }}>
            <span>Quick Platform Presets</span>
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PLATFORM_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn btn-xs ${f.platform.toLowerCase() === p.id ? "btn-primary" : "btn-secondary"}`}
                onClick={() => applyPreset(p)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid-2">
        <Field label="Platform" required hint="e.g. telegram, whatsapp, custom">
          <input
            type="text"
            value={f.platform}
            onChange={(e) => setF({ ...f, platform: e.target.value })}
            placeholder="telegram, whatsapp, sms…"
          />
        </Field>

        <Field label="Account Label" required hint="Friendly name for identification">
          <input
            type="text"
            value={f.account}
            onChange={(e) => setF({ ...f, account: e.target.value })}
            placeholder="e.g. Main Support Bot"
          />
        </Field>
      </div>

      <Field label="Platform API Token" hint="Token or secret provided by the platform (optional)">
        <input
          type="password"
          value={f.token}
          onChange={(e) => setF({ ...f, token: e.target.value })}
          placeholder="Platform API or Webhook token"
        />
      </Field>

      <Field label="Outgoing Endpoint URL" hint="Optional callback URL if proxying outbound replies">
        <input
          type="text"
          value={f.endpoint_url}
          onChange={(e) => setF({ ...f, endpoint_url: e.target.value })}
          placeholder="https://api.telegram.org/bot… or custom bridge"
        />
      </Field>

      <div style={{ marginTop: 12, padding: 12, background: "rgba(255,255,255,0.025)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={!!f.active}
            onChange={(e) => setF({ ...f, active: e.target.checked ? 1 : 0 })}
          />
          <span className="toggle-slider" />
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-main)" }}>
            Enable this integration (Active)
          </span>
        </label>
      </div>

      <div className="modal-footer-bar" style={{ padding: "20px 0 0", background: "none", borderTop: "1px solid var(--border)", marginTop: 20 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving && <Spinner />}
          {init?.id ? "Save Changes" : "Create Integration"}
        </button>
      </div>
    </>
  );
}

export default function Integrations() {
  const [s, reload] = useResource(() => apiGet("/integrations"), []);
  const [modal, setModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewMode, setViewMode] = useState("grid"); // grid | table
  const [copiedId, setCopiedId] = useState(null);

  async function handleDelete() {
    if (!deleteConfirm) return;
    try {
      await apiDel("/integrations/" + deleteConfirm.id);
      toast("Integration deleted successfully");
      setDeleteConfirm(null);
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function toggleActive(item) {
    try {
      const nextActive = item.active ? 0 : 1;
      await apiPut("/integrations/" + item.id, { ...item, active: nextActive });
      toast(`Integration ${nextActive ? "activated" : "deactivated"}`);
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  const handleCopyEndpoint = (integrationId) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/api/integrations/${integrationId}/conversations/{external_id}/auto-reply`;
    copyToClipboard(url);
    setCopiedId(integrationId);
    toast("Webhook auto-reply URL copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const integrations = s.data || [];

  const columns = [
    {
      header: "Platform",
      key: "platform",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge color={platformColor(r.platform)} lg>
            {r.platform}
          </Badge>
        </div>
      ),
    },
    {
      header: "Account Label",
      key: "account",
      render: (r) => <strong style={{ color: "var(--text-main)" }}>{r.account}</strong>,
    },
    {
      header: "Status",
      key: "active",
      render: (r) => (
        <button
          className="btn btn-ghost btn-xs"
          onClick={() => toggleActive(r)}
          title="Click to toggle status"
          style={{ padding: "2px 6px" }}
        >
          <Badge color={r.active ? "green" : "red"} dot>
            {r.active ? "Active" : "Inactive"}
          </Badge>
        </button>
      ),
    },
    {
      header: "API Token",
      key: "token",
      render: (r) => (
        <code className="truncate" style={{ maxWidth: 160 }}>
          {r.token ? r.token.slice(0, 12) + "••••" : "—"}
        </code>
      ),
    },
    {
      header: "Integration ID",
      key: "id",
      render: (r) => (
        <span className="mono" style={{ fontSize: 11, color: "var(--text-subtle)" }}>
          {shortId(r.id)}
        </span>
      ),
    },
    {
      header: "Actions",
      cellStyle: { textAlign: "right" },
      render: (r) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleCopyEndpoint(r.id)}
            title="Copy AutoReply Endpoint"
          >
            {copiedId === r.id ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setModal(r)}
            title="Edit Integration"
          >
            <Edit2 size={14} />
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setDeleteConfirm(r)}
            title="Delete Integration"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Header Row ── */}
      <div className="flex-row-between">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Plug size={24} color="var(--primary)" />
            <span>Messaging Integrations</span>
          </h1>
          <p className="card-subtitle">
            Manage your messaging platform connections, webhooks, and bot tokens.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
              className={`btn btn-sm ${viewMode === "grid" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("grid")}
              style={{ borderRadius: "var(--radius-sm)", padding: "4px 8px" }}
              title="Card Grid View"
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

          <button className="btn btn-primary" onClick={() => setModal({})}>
            <Plus size={16} />
            <span>Add Integration</span>
          </button>
        </div>
      </div>

      {/* ── Content View ── */}
      {viewMode === "table" ? (
        <DataTable
          columns={columns}
          data={integrations}
          loading={s.loading}
          error={s.error}
          searchPlaceholder="Search integrations by platform or account…"
          searchKeys={["platform", "account", "id"]}
          emptyTitle="No integrations configured"
          emptyDescription="Connect your first messaging channel like Telegram or WhatsApp to start auto-replying."
          emptyAction={
            <button className="btn btn-primary btn-sm" onClick={() => setModal({})}>
              <Plus size={14} /> Add First Integration
            </button>
          }
        />
      ) : (
        /* ── Grid View ── */
        <div>
          {s.loading ? (
            <div className="grid-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass-card" style={{ height: 180 }}>
                  <div className="skeleton" style={{ width: "40%", height: 20, marginBottom: 16 }} />
                  <div className="skeleton" style={{ width: "80%", height: 16, marginBottom: 8 }} />
                  <div className="skeleton" style={{ width: "60%", height: 16 }} />
                </div>
              ))}
            </div>
          ) : integrations.length === 0 ? (
            <div className="glass-card" style={{ padding: "48px 24px", textAlign: "center" }}>
              <div className="empty-state-box">
                <div className="empty-state-icon">
                  <Plug size={28} />
                </div>
                <div className="empty-state-title">No integrations connected yet</div>
                <div className="empty-state-desc">
                  Connect GhostReply to Telegram, WhatsApp, Discord, or generic Webhooks.
                </div>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setModal({})}>
                  <Plus size={14} /> Add Integration
                </button>
              </div>
            </div>
          ) : (
            <div className="grid-3">
              {integrations.map((item) => (
                <div key={item.id} className="glass-card glass-card-interactive" style={{ display: "flex", flexDirection: "column" }}>
                  <div className="flex-row-between" style={{ marginBottom: 12 }}>
                    <Badge color={platformColor(item.platform)} lg>
                      {item.platform}
                    </Badge>
                    <label className="toggle-switch" title="Toggle active status">
                      <input
                        type="checkbox"
                        checked={!!item.active}
                        onChange={() => toggleActive(item)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>

                  <h3 style={{ fontSize: 16, marginBottom: 4, color: "var(--text-main)" }}>
                    {item.account}
                  </h3>

                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Key size={12} color="var(--text-subtle)" />
                      <span>Token: <code>{item.token ? item.token.slice(0, 10) + "…" : "None"}</code></span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Globe size={12} color="var(--text-subtle)" />
                      <span className="truncate-text">Endpoint: {item.endpoint_url || "Direct bridge"}</span>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: 12,
                      borderTop: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleCopyEndpoint(item.id)}
                      title="Copy Auto-Reply Webhook Endpoint"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {copiedId === item.id ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                      <span>Copy Webhook</span>
                    </button>

                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => setModal(item)}
                        title="Edit Integration"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="btn btn-danger btn-xs"
                        onClick={() => setDeleteConfirm(item)}
                        title="Delete Integration"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Edit / Add Modal ── */}
      {modal && (
        <Modal
          title={modal.id ? `Edit ${modal.platform || "Integration"}` : "Connect New Integration"}
          subtitle="Configure platform credentials and webhook bridge"
          onClose={() => setModal(null)}
          wide
        >
          <IntegrationForm
            init={modal}
            onSave={() => {
              setModal(null);
              toast("Integration saved successfully");
              reload();
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {/* ── Confirm Delete Dialog ── */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Integration"
        message={`Are you sure you want to delete "${deleteConfirm?.account}" (${deleteConfirm?.platform})? All associated webhook configurations will be removed.`}
        confirmText="Delete Integration"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
