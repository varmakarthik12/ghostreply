import React, { useState } from "react";
import {
  Bot,
  Plus,
  Edit2,
  Trash2,
  Cpu,
  Sliders,
  Sparkles,
  FileText,
  Image as ImageIcon,
  Mic,
  Video as VideoIcon,
  Clock,
  ChevronDown,
  ChevronUp,
  Brain,
  Zap,
  LayoutGrid,
  List,
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

const MODEL_SUGGESTIONS = [
  "llama3.2",
  "llama3.1",
  "gemma3:4b",
  "gemma3:12b",
  "gemma-3-4b-it",
  "mistral",
  "gpt-4o",
  "gpt-4o-mini",
  "gemini-2.0-flash",
  "deepseek-r1:8b",
  "qwen2.5-coder:7b",
];

const THINKING_LEVEL_OPTIONS = [
  { value: "none", label: "Disabled (0 tokens)" },
  { value: "low", label: "Low (~512 tokens)" },
  { value: "medium", label: "Medium (~2,048 tokens)" },
  { value: "high", label: "High (~8,192 tokens)" },
  { value: "custom", label: "Custom Budget…" },
];

const SAMPLING_DEFAULTS = {
  temperature: 1.15,
  top_p: 0.94,
  top_k: 64,
  min_p: 0.01,
  repetition_penalty: 1.15,
  thinking_level: "high",
};

const emptyModelSetting = () => ({
  model: "",
  url: "",
  api_key: "",
  context_size: 0,
  ...SAMPLING_DEFAULTS,
  _custom_thinking_budget: "",
});

const parseModelSetting = (raw) => {
  const base = emptyModelSetting();
  if (!raw) return base;
  const merged = { ...base, ...raw };
  const knownLevels = ["none", "low", "medium", "high"];
  if (!knownLevels.includes(merged.thinking_level)) {
    merged._custom_thinking_budget = merged.thinking_level || "";
    merged.thinking_level = "custom";
  }
  return merged;
};

const parseValue = (val) => {
  try {
    const parsed = JSON.parse(val);
    if (parsed && typeof parsed === "object") {
      if (parsed.chat || parsed.summary || parsed.image || parsed.voice || parsed.video) {
        return {
          chat: parseModelSetting(parsed.chat),
          summary: parseModelSetting(parsed.summary),
          image: parseModelSetting(parsed.image),
          voice: parseModelSetting(parsed.voice),
          video: parseModelSetting(parsed.video),
          request_delay: parsed.request_delay || 0,
          request_timeout: parsed.request_timeout || 0,
        };
      } else if (parsed.model) {
        return {
          chat: parseModelSetting({ model: parsed.model || "", url: "", api_key: "", context_size: parsed.context_size || 0 }),
          summary: parseModelSetting({ model: parsed.summary_model || "" }),
          image: parseModelSetting({ model: parsed.image_model || parsed.vision_model || "" }),
          voice: parseModelSetting({ model: parsed.voice_model || "" }),
          video: parseModelSetting({ model: parsed.video_model || "" }),
          request_delay: parsed.request_delay || 0,
          request_timeout: parsed.request_timeout || 0,
        };
      }
    }
  } catch (e) {}
  return {
    chat: parseModelSetting({ model: val || "" }),
    summary: parseModelSetting(null),
    image: parseModelSetting(null),
    voice: parseModelSetting(null),
    video: parseModelSetting(null),
    request_delay: 0,
    request_timeout: 0,
  };
};

const encodeModelSetting = (s) => {
  const thinking_level =
    s.thinking_level === "custom"
      ? s._custom_thinking_budget || "high"
      : s.thinking_level || "high";
  return {
    model: s.model || "",
    url: s.url || "",
    api_key: s.api_key || "",
    context_size: parseInt(s.context_size) || 0,
    temperature: parseFloat(s.temperature) ?? SAMPLING_DEFAULTS.temperature,
    top_p: parseFloat(s.top_p) ?? SAMPLING_DEFAULTS.top_p,
    top_k: parseInt(s.top_k) ?? SAMPLING_DEFAULTS.top_k,
    min_p: parseFloat(s.min_p) ?? SAMPLING_DEFAULTS.min_p,
    repetition_penalty: parseFloat(s.repetition_penalty) ?? SAMPLING_DEFAULTS.repetition_penalty,
    thinking_level,
  };
};

function SamplingSliders({ setting, onUpdate }) {
  const [open, setOpen] = useState(false);

  const applyPreset = (preset) => {
    if (preset === "creative") {
      onUpdate("temperature", 1.25);
      onUpdate("top_p", 0.95);
      onUpdate("repetition_penalty", 1.15);
    } else if (preset === "balanced") {
      onUpdate("temperature", 0.8);
      onUpdate("top_p", 0.9);
      onUpdate("repetition_penalty", 1.1);
    } else if (preset === "strict") {
      onUpdate("temperature", 0.2);
      onUpdate("top_p", 0.8);
      onUpdate("repetition_penalty", 1.05);
    }
    toast(`Applied "${preset}" preset`);
  };

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => setOpen(!open)}
        style={{ width: "100%", justifyContent: "space-between", color: "var(--text-muted)" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
          <Sliders size={13} color="var(--primary)" />
          <span>Advanced Sampling Parameters & Hyperparameters</span>
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 4 }}>Presets:</span>
            <button type="button" className="btn btn-xs btn-secondary" onClick={() => applyPreset("creative")}>
              🎨 Creative (1.25)
            </button>
            <button type="button" className="btn btn-xs btn-secondary" onClick={() => applyPreset("balanced")}>
              ⚖️ Balanced (0.8)
            </button>
            <button type="button" className="btn btn-xs btn-secondary" onClick={() => applyPreset("strict")}>
              🎯 Strict (0.2)
            </button>
          </div>

          <div className="grid-2">
            <div>
              <div className="flex-row-between" style={{ marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Temperature</label>
                <span className="mono" style={{ fontSize: 12, color: "var(--primary)" }}>
                  {setting.temperature}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={setting.temperature}
                onChange={(e) => onUpdate("temperature", parseFloat(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <div className="flex-row-between" style={{ marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Top P (Nucleus Sampling)</label>
                <span className="mono" style={{ fontSize: 12, color: "var(--primary)" }}>
                  {setting.top_p}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={setting.top_p}
                onChange={(e) => onUpdate("top_p", parseFloat(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <div className="flex-row-between" style={{ marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Repetition Penalty</label>
                <span className="mono" style={{ fontSize: 12, color: "var(--primary)" }}>
                  {setting.repetition_penalty}
                </span>
              </div>
              <input
                type="range"
                min="0.9"
                max="2"
                step="0.05"
                value={setting.repetition_penalty}
                onChange={(e) => onUpdate("repetition_penalty", parseFloat(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <div className="flex-row-between" style={{ marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Top K</label>
                <span className="mono" style={{ fontSize: 12, color: "var(--primary)" }}>
                  {setting.top_k}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="128"
                step="1"
                value={setting.top_k}
                onChange={(e) => onUpdate("top_k", parseInt(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CapabilitySection({ icon: Icon, title, desc, setting, onUpdate, suggestions }) {
  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "16px 20px",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-md)",
            background: "rgba(99, 102, 241, 0.12)",
            color: "var(--primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={16} />
        </div>
        <div>
          <strong style={{ fontSize: 14, color: "var(--text-main)" }}>{title}</strong>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{desc}</p>
        </div>
      </div>

      <div className="grid-2">
        <Field label="Model Name / Identifier" hint="e.g. llama3.2, gpt-4o, whisper-1">
          <input
            type="text"
            list={`suggestions-${title}`}
            value={setting.model}
            onChange={(e) => onUpdate("model", e.target.value)}
            placeholder="Inherit system default"
          />
          <datalist id={`suggestions-${title}`}>
            {suggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>

        <Field label="Reasoning / Thinking Level" hint="Extended CoT reasoning budget">
          <select
            value={setting.thinking_level}
            onChange={(e) => onUpdate("thinking_level", e.target.value)}
          >
            {THINKING_LEVEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid-3" style={{ marginTop: 10 }}>
        <Field label="Custom Base URL (Optional)" hint="e.g. http://localhost:11434">
          <input
            type="text"
            value={setting.url}
            onChange={(e) => onUpdate("url", e.target.value)}
            placeholder="Inherit server default"
          />
        </Field>

        <Field label="API Key (Optional)" hint="Bearer token if remote">
          <input
            type="password"
            value={setting.api_key}
            onChange={(e) => onUpdate("api_key", e.target.value)}
            placeholder="sk-..."
          />
        </Field>

        <Field label="Context Size (num_ctx)" hint="0 for model default">
          <input
            type="number"
            value={setting.context_size || ""}
            onChange={(e) => onUpdate("context_size", parseInt(e.target.value) || 0)}
            placeholder="e.g. 32768"
          />
        </Field>
      </div>

      <SamplingSliders setting={setting} onUpdate={onUpdate} />
    </div>
  );
}

function ModelForm({ init, integrations, ollamaModels, onSave, onCancel }) {
  const [scope, setScope] = useState(init?.scope || "global");
  const [scopeId, setScopeId] = useState(init?.scope_id || "");
  const [cfg, setCfg] = useState(() => parseValue(init?.value));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const updateCapability = (cap, field, val) => {
    setCfg((prev) => ({
      ...prev,
      [cap]: {
        ...prev[cap],
        [field]: val,
      },
    }));
  };

  const suggestions = Array.from(new Set([...MODEL_SUGGESTIONS, ...ollamaModels]));

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const payloadValue = JSON.stringify({
        chat: encodeModelSetting(cfg.chat),
        summary: encodeModelSetting(cfg.summary),
        image: encodeModelSetting(cfg.image),
        voice: encodeModelSetting(cfg.voice),
        video: encodeModelSetting(cfg.video),
        request_delay: cfg.request_delay,
        request_timeout: cfg.request_timeout,
      });

      if (init?.id) {
        await apiPut("/model-configs/" + init.id, { value: payloadValue });
      } else {
        await apiPost("/model-configs", {
          scope,
          scope_id: scopeId,
          value: payloadValue,
        });
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
        <div style={{ marginBottom: 16 }}>
          <div className="grid-2">
            <Field label="Scope Level" required hint="Where these model overrides apply">
              <select
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value);
                  setScopeId("");
                }}
              >
                <option value="global">Global (System Wide)</option>
                <option value="integration">Specific Integration (e.g. WhatsApp / Telegram)</option>
                <option value="conversation">Specific Conversation</option>
              </select>
            </Field>

            {scope === "integration" && (
              <Field label="Target Integration" required>
                <select value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                  <option value="">— Select Integration —</option>
                  {integrations.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.platform} · {i.account}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {scope === "conversation" && (
              <Field label="Conversation UUID" required>
                <input
                  type="text"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  placeholder="Paste conversation UUID"
                />
              </Field>
            )}
          </div>
        </div>
      )}

      {/* ── Capability Cards ── */}
      <CapabilitySection
        icon={Bot}
        title="Chat & Response Generation Engine"
        desc="Primary engine used for crafting automated replies and conversation turns."
        setting={cfg.chat}
        onUpdate={(f, v) => updateCapability("chat", f, v)}
        suggestions={suggestions}
      />

      <CapabilitySection
        icon={FileText}
        title="Long-Term Memory & Summarizer"
        desc="Background engine for compressing old turns into persistent memory profiles."
        setting={cfg.summary}
        onUpdate={(f, v) => updateCapability("summary", f, v)}
        suggestions={suggestions}
      />

      <CapabilitySection
        icon={ImageIcon}
        title="Vision & Image Analysis Engine"
        desc="Multimodal visual model for inspecting user photos and snaps."
        setting={cfg.image}
        onUpdate={(f, v) => updateCapability("image", f, v)}
        suggestions={suggestions}
      />

      <CapabilitySection
        icon={Mic}
        title="Voice & Audio Transcription Engine"
        desc="Dedicated speech model (e.g. Whisper-1) or multimodal audio model."
        setting={cfg.voice}
        onUpdate={(f, v) => updateCapability("voice", f, v)}
        suggestions={suggestions}
      />

      <CapabilitySection
        icon={VideoIcon}
        title="Video & Animation Analysis Engine"
        desc="Video model for analyzing video clips and animations."
        setting={cfg.video}
        onUpdate={(f, v) => updateCapability("video", f, v)}
        suggestions={suggestions}
      />

      <div className="modal-footer-bar">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner /> : <Cpu size={14} />}
          <span>{init?.id ? "Update Configuration" : "Create Configuration"}</span>
        </button>
      </div>
    </>
  );
}

export default function ModelConfigs() {
  const [s, reload] = useResource(() => apiGet("/model-configs"), []);
  const [intS] = useResource(() => apiGet("/integrations"), []);
  const [ollamaS] = useResource(() => apiGet("/ollama/models"), []);
  const [modal, setModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewMode, setViewMode] = useState("cards"); // cards | table

  const integrations = intS.data || [];
  const ollamaModels = ollamaS.data || [];

  async function handleDelete() {
    if (!deleteConfirm) return;
    try {
      await apiDel("/model-configs/" + deleteConfirm.id);
      toast("Model config deleted");
      setDeleteConfirm(null);
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  const columns = [
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
      header: "Configured Models & Sampling",
      key: "value",
      render: (r) => {
        const cfg = parseValue(r.value);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600, color: "var(--text-main)" }}>💬 Chat:</span>
              <code>{cfg.chat.model || "Default"}</code>
              {cfg.chat.thinking_level && cfg.chat.thinking_level !== "none" && (
                <Badge color="purple">🧠 {cfg.chat.thinking_level}</Badge>
              )}
            </div>

            {cfg.summary.model && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                📝 Summary: <code>{cfg.summary.model}</code>
              </div>
            )}
            {cfg.image.model && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                🖼️ Image: <code>{cfg.image.model}</code>
              </div>
            )}
            {cfg.voice.model && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                🎙️ Voice: <code>{cfg.voice.model}</code>
              </div>
            )}
            {cfg.video.model && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                🎥 Video: <code>{cfg.video.model}</code>
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: "Actions",
      cellStyle: { textAlign: "right" },
      render: (r) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => setModal(r)}
            title="Edit Model Config"
          >
            <Edit2 size={13} />
          </button>
          <button
            className="btn btn-danger btn-xs"
            onClick={() => setDeleteConfirm(r)}
            title="Delete Model Config"
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
            <Bot size={24} color="var(--primary)" />
            <span>Model Configurations</span>
          </h1>
          <p className="card-subtitle">
            Configure LLMs, local Ollama models, reasoning budgets, and multimodal vision/audio engines.
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
              className={`btn btn-sm ${viewMode === "cards" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("cards")}
              style={{ borderRadius: "var(--radius-sm)", padding: "4px 8px" }}
              title="Card Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              className={`btn btn-sm ${viewMode === "table" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("table")}
              style={{ borderRadius: "var(--radius-sm)", padding: "4px 8px" }}
              title="Table View"
            >
              <List size={15} />
            </button>
          </div>

          <button className="btn btn-primary" onClick={() => setModal({})}>
            <Plus size={16} />
            <span>Add Model Config</span>
          </button>
        </div>
      </div>

      {viewMode === "table" ? (
        <DataTable
          columns={columns}
          data={s.data || []}
          loading={s.loading}
          error={s.error}
          searchPlaceholder="Search model configs…"
          searchKeys={["scope", "scope_id"]}
          emptyTitle="No custom model configs"
          emptyDescription="System will use default local Ollama model (llama3.2) unless overridden."
          emptyAction={
            <button className="btn btn-primary btn-sm" onClick={() => setModal({})}>
              <Plus size={14} /> Add Model Override
            </button>
          }
        />
      ) : (
        /* ── Grid View ── */
        <div>
          {s.loading ? (
            <div className="grid-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="glass-card" style={{ height: 220 }}>
                  <div className="skeleton" style={{ width: "30%", height: 20, marginBottom: 16 }} />
                  <div className="skeleton" style={{ width: "100%", height: 16, marginBottom: 8 }} />
                  <div className="skeleton" style={{ width: "80%", height: 16 }} />
                </div>
              ))}
            </div>
          ) : (s.data || []).length === 0 ? (
            <div className="glass-card" style={{ padding: "56px 24px", textAlign: "center" }}>
              <div className="empty-state-box">
                <div className="empty-state-icon">
                  <Bot size={28} />
                </div>
                <div className="empty-state-title">No custom model configurations</div>
                <div className="empty-state-desc">
                  GhostReply will use default local model configurations unless specific model overrides are configured.
                </div>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setModal({})}>
                  <Plus size={14} /> Create Configuration
                </button>
              </div>
            </div>
          ) : (
            <div className="grid-2">
              {(s.data || []).map((r) => {
                const cfg = parseValue(r.value);
                return (
                  <div key={r.id} className="glass-card glass-card-interactive" style={{ padding: 20, marginBottom: 0 }}>
                    <div className="flex-row-between" style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge color={scopeColor(r.scope)} lg>
                          {r.scope}
                        </Badge>
                        {r.scope_id && (
                          <span className="mono" style={{ fontSize: 11, color: "var(--text-subtle)" }}>
                            ID: {shortId(r.scope_id)}
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => setModal(r)}
                          title="Edit Configuration"
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          className="btn btn-danger btn-xs"
                          onClick={() => setDeleteConfirm(r)}
                          title="Delete Configuration"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {/* Chat Engine */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          background: "rgba(255, 255, 255, 0.03)",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Bot size={15} color="var(--primary)" />
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-main)" }}>Chat Engine:</span>
                          <code style={{ fontSize: 12 }}>{cfg.chat.model || "Default"}</code>
                        </div>
                        {cfg.chat.thinking_level && cfg.chat.thinking_level !== "none" && (
                          <Badge color="purple">🧠 {cfg.chat.thinking_level}</Badge>
                        )}
                      </div>

                      {/* Multimodal Engines */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12 }}>
                        {cfg.summary.model && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 4, border: "1px solid var(--border-subtle)" }}>
                            <FileText size={12} color="var(--primary)" />
                            <span>Summary: <code>{cfg.summary.model}</code></span>
                          </div>
                        )}
                        {cfg.image.model && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 4, border: "1px solid var(--border-subtle)" }}>
                            <ImageIcon size={12} color="var(--accent)" />
                            <span>Vision: <code>{cfg.image.model}</code></span>
                          </div>
                        )}
                        {cfg.voice.model && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 4, border: "1px solid var(--border-subtle)" }}>
                            <Mic size={12} color="var(--success)" />
                            <span>Voice: <code>{cfg.voice.model}</code></span>
                          </div>
                        )}
                        {cfg.video.model && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 4, border: "1px solid var(--border-subtle)" }}>
                            <VideoIcon size={12} color="var(--purple)" />
                            <span>Video: <code>{cfg.video.model}</code></span>
                          </div>
                        )}
                      </div>

                      {/* Sampling Tags */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        <span style={{ padding: "2px 6px", background: "rgba(255,255,255,0.04)", borderRadius: 4 }}>
                          Temp: <strong style={{ color: "var(--text-main)" }}>{cfg.chat.temperature}</strong>
                        </span>
                        <span style={{ padding: "2px 6px", background: "rgba(255,255,255,0.04)", borderRadius: 4 }}>
                          TopP: <strong style={{ color: "var(--text-main)" }}>{cfg.chat.top_p}</strong>
                        </span>
                        <span style={{ padding: "2px 6px", background: "rgba(255,255,255,0.04)", borderRadius: 4 }}>
                          RepPenalty: <strong style={{ color: "var(--text-main)" }}>{cfg.chat.repetition_penalty}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {modal && (
        <Modal
          title={modal.id ? "Edit Model Configuration" : "New Model Configuration"}
          subtitle="Configure Chat, Summary, Vision, Voice, and Sampling parameters"
          onClose={() => setModal(null)}
          wide
        >
          <ModelForm
            init={modal}
            integrations={integrations}
            ollamaModels={ollamaModels}
            onSave={() => {
              setModal(null);
              toast("Model config saved successfully");
              reload();
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Model Configuration"
        message="Are you sure you want to delete this model configuration? Scope will fallback to global or system defaults."
        confirmText="Delete Config"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
