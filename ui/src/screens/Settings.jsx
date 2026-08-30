import React, { useState } from "react";
import {
  Settings as SettingsIcon,
  Sliders,
  Brain,
  ShieldCheck,
  Activity,
  Key,
  Plus,
  Edit2,
  Trash2,
  Globe,
  Clock,
  Zap,
  Save,
  Check,
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
import { scopeColor, shortId } from "../lib/utils";

const CONFIG_KEYS = [
  {
    key: "summary_threshold",
    default: "50",
    group: "memory",
    title: "Message Threshold for Auto-Summarization",
    desc: "Number of unsummarized messages before triggering background memory summarization.",
  },
  {
    key: "token_threshold",
    default: "4000",
    group: "memory",
    title: "Token Threshold for Early Summarization",
    desc: "Token count in history before triggering early background summarization.",
  },
  {
    key: "max_context_messages",
    default: "20",
    group: "memory",
    title: "Recent Context Messages to LLM",
    desc: "Maximum recent messages sent in the active prompt context window per reply.",
  },
  {
    key: "reply_style",
    default: "brief",
    group: "general",
    title: "Default Persona Reply Style",
    desc: "Tone guidance hint: 'brief' for short mobile texting, 'detailed' for descriptive responses.",
  },
  {
    key: "user_location",
    default: "",
    group: "general",
    title: "User / Host Location",
    desc: "Physical city/country (e.g. 'San Francisco, USA', 'London, UK') injected into prompt context.",
  },
  {
    key: "timezone",
    default: "UTC",
    group: "general",
    title: "Target Timezone",
    desc: "Timezone identifier (e.g. America/New_York, Asia/Kolkata, Europe/London).",
  },
  {
    key: "max_consecutive_assistant_messages",
    default: "2",
    group: "protection",
    title: "Max Consecutive Assistant Replies",
    desc: "Prevents the AI from sending more than N replies in a row without user input (0 to disable).",
  },
  {
    key: "stale_reply_threshold_hours",
    default: "0",
    group: "protection",
    title: "Stale Reply Threshold (Hours)",
    desc: "Skip automated replies if the incoming message is older than this (0 to disable).",
  },
  {
    key: "activity_log_keep_days",
    default: "7",
    group: "system",
    title: "Activity Log Retention (Days)",
    desc: "Number of days of operation traces to keep before auto-purging (0 to keep indefinitely).",
  },
  {
    key: "debug_auto_reply",
    default: "false",
    group: "system",
    title: "Verbose Console Logging",
    desc: "Logs full JSON request and response payloads to server stdout for troubleshooting.",
  },
];

function CustomConfigForm({ init, onSave, onCancel }) {
  const [f, setF] = useState({
    scope: "global",
    scope_id: "",
    key: "",
    value: "",
    ...init,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!f.key.trim() || !f.value.trim()) {
      setErr("Both Config Key and Value are required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      if (init?.id) {
        await apiPut("/configs/" + init.id, { key: f.key, value: f.value });
      } else {
        await apiPost("/configs", f);
      }
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

      {!init?.id && (
        <div className="grid-2" style={{ marginBottom: 16 }}>
          <Field label="Scope Level" required>
            <select
              value={f.scope}
              onChange={(e) => setF({ ...f, scope: e.target.value, scope_id: "" })}
            >
              <option value="global">Global</option>
              <option value="integration">Integration Override</option>
              <option value="conversation">Conversation Override</option>
            </select>
          </Field>

          {(f.scope === "integration" || f.scope === "conversation") && (
            <Field label="Target Scope ID" required>
              <input
                type="text"
                value={f.scope_id}
                onChange={(e) => setF({ ...f, scope_id: e.target.value })}
                placeholder="Integration or Conversation UUID"
              />
            </Field>
          )}
        </div>
      )}

      <Field label="Configuration Key" required>
        <input
          list="config-key-suggestions"
          type="text"
          value={f.key}
          onChange={(e) => setF({ ...f, key: e.target.value })}
          placeholder="e.g. max_context_messages"
        />
        <datalist id="config-key-suggestions">
          {CONFIG_KEYS.map((k) => (
            <option key={k.key} value={k.key} />
          ))}
        </datalist>
      </Field>

      <Field label="Configuration Value" required>
        <input
          type="text"
          value={f.value}
          onChange={(e) => setF({ ...f, value: e.target.value })}
          placeholder="Value string or number"
        />
      </Field>

      <div className="modal-footer-bar" style={{ padding: "20px 0 0", background: "none", borderTop: "1px solid var(--border)", marginTop: 20 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving && <Spinner />}
          {init?.id ? "Save Config" : "Create Config"}
        </button>
      </div>
    </>
  );
}

export default function Settings() {
  const [s, reload] = useResource(() => apiGet("/configs"), []);
  const [activeTab, setActiveTab] = useState("general"); // general | memory | protection | system | registry
  const [modal, setModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [savingKey, setSavingKey] = useState(null);

  const configs = s.data || [];

  const getConfig = (key) => {
    return configs.find((c) => c.scope === "global" && c.key === key)?.value;
  };

  const updateGlobalConfig = async (key, value) => {
    setSavingKey(key);
    const existing = configs.find((c) => c.scope === "global" && c.key === key);
    try {
      if (existing) {
        await apiPut("/configs/" + existing.id, { key, value: String(value) });
      } else {
        await apiPost("/configs", { scope: "global", scope_id: "", key, value: String(value) });
      }
      toast(`Saved "${key}"`);
      reload();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingKey(null);
    }
  };

  const autoDetectTimezone = () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        updateGlobalConfig("timezone", tz);
      }
    } catch {
      toast("Could not auto-detect timezone", "error");
    }
  };

  async function handleDeleteConfig() {
    if (!deleteConfirm) return;
    try {
      await apiDel("/configs/" + deleteConfirm.id);
      toast("Configuration override deleted");
      setDeleteConfirm(null);
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  const tableColumns = [
    {
      header: "Scope",
      key: "scope",
      render: (r) => <Badge color={scopeColor(r.scope)} lg>{r.scope}</Badge>,
    },
    {
      header: "Scope ID",
      key: "scope_id",
      render: (r) => (
        <span className="mono" style={{ fontSize: 11, color: "var(--text-subtle)" }}>
          {r.scope_id ? shortId(r.scope_id) : "Global Default"}
        </span>
      ),
    },
    {
      header: "Key",
      key: "key",
      render: (r) => <code style={{ color: "var(--accent)" }}>{r.key}</code>,
    },
    {
      header: "Value",
      key: "value",
      render: (r) => (
        <span className="mono" style={{ fontSize: 13, color: "var(--text-main)" }}>
          {r.key.includes("key") && r.value ? "••••••••" : r.value}
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
            onClick={() => setModal(r)}
            title="Edit Config"
          >
            <Edit2 size={13} />
          </button>
          <button
            className="btn btn-danger btn-xs"
            onClick={() => setDeleteConfirm(r)}
            title="Delete Config"
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
            <SettingsIcon size={24} color="var(--primary)" />
            <span>Application Settings</span>
          </h1>
          <p className="card-subtitle">
            Configure system parameters, memory thresholds, anti-spam guards, and global defaults.
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setModal({})}>
          <Plus size={16} />
          <span>Add Custom Config</span>
        </button>
      </div>

      {/* ── Navigation Tabs ── */}
      <div
        style={{
          display: "flex",
          gap: 6,
          borderBottom: "1px solid var(--border)",
          paddingBottom: 4,
          overflowX: "auto",
        }}
      >
        {[
          { id: "general", label: "General & Persona", icon: Globe },
          { id: "memory", label: "Memory & Context", icon: Brain },
          { id: "protection", label: "Safeguards & Spam", icon: ShieldCheck },
          { id: "system", label: "System & Logs", icon: Activity },
          { id: "registry", label: "Config Registry", icon: Key },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`btn btn-sm ${isActive ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ gap: 8, whiteSpace: "nowrap" }}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab 1: General & Persona ── */}
      {activeTab === "general" && (
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>General & Location Parameters</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
            Default settings injected into AI context to ground responses in your local reality.
          </p>

          <div className="grid-2">
            <Field label="User / Host Location" hint="City, Country">
              <input
                type="text"
                defaultValue={getConfig("user_location") ?? ""}
                onBlur={(e) => updateGlobalConfig("user_location", e.target.value)}
                placeholder="e.g. San Francisco, USA"
              />
            </Field>

            <Field
              label="Timezone Identifier"
              hint={
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={autoDetectTimezone}
                  style={{ color: "var(--primary)", padding: 0 }}
                >
                  ⚡ Auto-Detect
                </button>
              }
            >
              <input
                type="text"
                defaultValue={getConfig("timezone") ?? "UTC"}
                onBlur={(e) => updateGlobalConfig("timezone", e.target.value)}
                placeholder="e.g. America/New_York"
              />
            </Field>

            <Field label="Default Texting Reply Style" hint="Tone guidance">
              <select
                value={getConfig("reply_style") ?? "brief"}
                onChange={(e) => updateGlobalConfig("reply_style", e.target.value)}
              >
                <option value="brief">Brief & Concise (Recommended for chat)</option>
                <option value="detailed">Detailed & Descriptive</option>
              </select>
            </Field>
          </div>
        </div>
      )}

      {/* ── Tab 2: Memory & Context ── */}
      {activeTab === "memory" && (
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>Memory Consolidation & Context Budgets</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
            Configure automatic background summarization thresholds and LLM context window limits.
          </p>

          <div className="grid-2">
            <Field
              label="Message Threshold for Auto-Summarization"
              hint="Unsummarized messages count (Default: 50)"
            >
              <input
                type="number"
                min="5"
                max="500"
                defaultValue={getConfig("summary_threshold") ?? "50"}
                onBlur={(e) => updateGlobalConfig("summary_threshold", e.target.value)}
              />
            </Field>

            <Field
              label="Token Threshold for Early Summarization"
              hint="Token limit trigger (Default: 4000)"
            >
              <input
                type="number"
                min="500"
                max="32000"
                defaultValue={getConfig("token_threshold") ?? "4000"}
                onBlur={(e) => updateGlobalConfig("token_threshold", e.target.value)}
              />
            </Field>

            <Field
              label="Recent Messages Sent to LLM (Context Window)"
              hint="Active message budget per reply (Default: 20)"
            >
              <input
                type="number"
                min="2"
                max="100"
                defaultValue={getConfig("max_context_messages") ?? "20"}
                onBlur={(e) => updateGlobalConfig("max_context_messages", e.target.value)}
              />
            </Field>
          </div>
        </div>
      )}

      {/* ── Tab 3: Safeguards & Spam Protection ── */}
      {activeTab === "protection" && (
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>Spam & Loop Protection Safeguards</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
            Prevent the autonomous engine from infinite conversational loops or answering ancient messages.
          </p>

          <div className="grid-2">
            <Field
              label="Max Consecutive Assistant Replies"
              hint="0 to disable guard (Default: 2)"
            >
              <input
                type="number"
                min="0"
                max="10"
                defaultValue={getConfig("max_consecutive_assistant_messages") ?? "2"}
                onBlur={(e) => updateGlobalConfig("max_consecutive_assistant_messages", e.target.value)}
              />
            </Field>

            <Field
              label="Stale Reply Threshold (Hours)"
              hint="Skip reply if older than N hours (0 to disable)"
            >
              <input
                type="number"
                min="0"
                max="168"
                defaultValue={getConfig("stale_reply_threshold_hours") ?? "0"}
                onBlur={(e) => updateGlobalConfig("stale_reply_threshold_hours", e.target.value)}
              />
            </Field>
          </div>
        </div>
      )}

      {/* ── Tab 4: System & Logs ── */}
      {activeTab === "system" && (
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>System Diagnostics & Log Retention</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
            Manage log retention intervals and developer debugging outputs.
          </p>

          <div className="grid-2">
            <Field
              label="Activity Log Retention (Days)"
              hint="Days to keep operational traces (Default: 7)"
            >
              <input
                type="number"
                min="0"
                max="365"
                defaultValue={getConfig("activity_log_keep_days") ?? "7"}
                onBlur={(e) => updateGlobalConfig("activity_log_keep_days", e.target.value)}
              />
            </Field>

            <div style={{ padding: "16px 20px", background: "rgba(255,255,255,0.025)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={getConfig("debug_auto_reply") === "true"}
                  onChange={(e) => updateGlobalConfig("debug_auto_reply", e.target.checked ? "true" : "false")}
                />
                <span className="toggle-slider" />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-main)", display: "block" }}>
                    Verbose Server Console Logging
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Prints raw JSON request and response payloads to server stdout.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 5: Registry Table ── */}
      {activeTab === "registry" && (
        <DataTable
          columns={tableColumns}
          data={configs}
          loading={s.loading}
          error={s.error}
          searchPlaceholder="Search config registry by key or scope…"
          searchKeys={["key", "value", "scope", "scope_id"]}
          emptyTitle="No custom configs configured"
          emptyDescription="Default values are active."
        />
      )}

      {/* ── Create / Edit Modal ── */}
      {modal && (
        <Modal
          title={modal.id ? "Edit Configuration" : "Add Configuration Key"}
          subtitle="Set global, integration, or conversation-level override"
          onClose={() => setModal(null)}
        >
          <CustomConfigForm
            init={modal}
            onSave={() => {
              setModal(null);
              toast("Config saved successfully");
              reload();
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {/* ── Confirm Delete Dialog ── */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Configuration"
        message={`Are you sure you want to delete configuration override for key "${deleteConfirm?.key}"?`}
        confirmText="Delete Config"
        onConfirm={handleDeleteConfig}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
