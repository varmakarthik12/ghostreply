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
    } else if (preset === "precise") {
      onUpdate("temperature", 0.3);
      onUpdate("top_p", 0.7);
      onUpdate("repetition_penalty", 1.05);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => setOpen(!open)}
        style={{ color: "var(--text-muted)", padding: "4px 0", gap: 6 }}
      >
        <Sliders size={13} />
        <span>{open ? "Hide" : "Configure"} Advanced Sampling Parameters</span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: 16,
            marginTop: 8,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* Preset Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Presets:</span>
            <button type="button" className="btn btn-xs btn-secondary" onClick={() => applyPreset("creative")}>
              🎨 Creative
            </button>
            <button type="button" className="btn btn-xs btn-secondary" onClick={() => applyPreset("balanced")}>
              ⚖️ Balanced
            </button>
            <button type="button" className="btn btn-xs btn-secondary" onClick={() => applyPreset("precise")}>
              🎯 Strict
            </button>
          </div>

          <div className="grid-2">
            <Field label={`Temperature: ${setting.temperature ?? SAMPLING_DEFAULTS.temperature}`}>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={setting.temperature ?? SAMPLING_DEFAULTS.temperature}
                onChange={(e) => onUpdate("temperature", parseFloat(e.target.value))}
              />
            </Field>

            <Field label={`Top P: ${setting.top_p ?? SAMPLING_DEFAULTS.top_p}`}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={setting.top_p ?? SAMPLING_DEFAULTS.top_p}
                onChange={(e) => onUpdate("top_p", parseFloat(e.target.value))}
              />
            </Field>

            <Field label={`Repetition Penalty: ${setting.repetition_penalty ?? SAMPLING_DEFAULTS.repetition_penalty}`}>
              <input
                type="range"
                min="1"
                max="2"
                step="0.05"
                value={setting.repetition_penalty ?? SAMPLING_DEFAULTS.repetition_penalty}
                onChange={(e) => onUpdate("repetition_penalty", parseFloat(e.target.value))}
              />
            </Field>

            <Field label={`Top K: ${setting.top_k ?? SAMPLING_DEFAULTS.top_k}`}>
              <input
                type="number"
                min="0"
                value={setting.top_k ?? SAMPLING_DEFAULTS.top_k}
                onChange={(e) => onUpdate("top_k", parseInt(e.target.value) || 0)}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelForm({ init, integrations, ollamaModels, onSave, onCancel }) {
  const initialValues = parseValue(init?.value);

  const [f, setF] = useState({
    scope: "global",
    scope_id: "",
    chat: initialValues.chat,
    summary: initialValues.summary,
    image: initialValues.image,
    voice: initialValues.voice,
    video: initialValues.video,
    request_delay: initialValues.request_delay,
    request_timeout: initialValues.request_timeout,
    ...init,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const updateSetting = (type, field, val) => {
    setF((prev) => ({
      ...prev,
      [type]: {
        ...(prev[type] || emptyModelSetting()),
        [field]: val,
      },
    }));
  };

  async function save() {
    if (!f.chat || !f.chat.model.trim()) {
      setErr("Primary Chat Model name is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const payload = {
        ...f,
        value: JSON.stringify({
          chat: encodeModelSetting(f.chat),
          summary: encodeModelSetting(f.summary),
          image: encodeModelSetting(f.image),
          voice: encodeModelSetting(f.voice),
          video: encodeModelSetting(f.video),
          request_delay: parseInt(f.request_delay) || 0,
          request_timeout: parseInt(f.request_timeout) || 0,
        }),
      };
      delete payload.chat;
      delete payload.summary;
      delete payload.image;
      delete payload.voice;
      delete payload.video;
      delete payload.request_delay;
      delete payload.request_timeout;

      if (init?.id) await apiPut("/model-configs/" + init.id, payload);
      else await apiPost("/model-configs", payload);
      onSave();
    } catch (e) {
      setErr(e.message);
    }
    setSaving(false);
  }

  const renderCapabilityCard = (type, title, Icon, isRequired = false, placeholder = "") => {
    const s = f[type] || emptyModelSetting();
    return (
      <div className="glass-card" style={{ padding: 18, marginBottom: 14 }} key={type}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ padding: 6, borderRadius: "var(--radius-sm)", background: "var(--primary-subtle)", color: "var(--primary)" }}>
            <Icon size={18} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: 14 }}>
              {title} {isRequired && <span style={{ color: "var(--danger)" }}>*</span>}
            </h4>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {isRequired ? "Core model used for generating messaging replies" : "Optional override (falls back to Chat model if empty)"}
            </div>
          </div>
        </div>

        <div className="grid-2">
          <Field label="Model Name" required={isRequired}>
            <input
              list="models-datalist"
              type="text"
              value={s.model}
              onChange={(e) => updateSetting(type, "model", e.target.value)}
              placeholder={placeholder}
            />
          </Field>

          <Field label="Custom Host URL" hint="Leave empty to use global default">
            <input
              type="text"
              value={s.url}
              onChange={(e) => updateSetting(type, "url", e.target.value)}
              placeholder="e.g. http://localhost:11434"
            />
          </Field>

          <Field label="API Key" hint="Leave empty for local Ollama">
            <input
              type="password"
              value={s.api_key}
              onChange={(e) => updateSetting(type, "api_key", e.target.value)}
              placeholder="sk-… (optional)"
            />
          </Field>

          <Field label="Context Size (tokens)" hint="0 for model default">
            <input
              type="number"
              min="0"
              value={s.context_size || ""}
              onChange={(e) => updateSetting(type, "context_size", e.target.value)}
              placeholder="e.g. 32768"
            />
          </Field>
        </div>

        {/* Reasoning / Thinking Level */}
        <div style={{ marginTop: 12 }}>
          <div className="grid-2">
            <Field label="🧠 Reasoning / Thinking Level" hint="For DeepSeek-R1 / reasoning models">
              <select
                value={s.thinking_level || "high"}
                onChange={(e) => updateSetting(type, "thinking_level", e.target.value)}
              >
                {THINKING_LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            {s.thinking_level === "custom" && (
              <Field label="Custom Token Budget">
                <input
                  type="number"
                  min="0"
                  value={s._custom_thinking_budget}
                  onChange={(e) => updateSetting(type, "_custom_thinking_budget", e.target.value)}
                  placeholder="e.g. 4096"
                />
              </Field>
            )}
          </div>
        </div>

        <SamplingSliders setting={s} onUpdate={(k, v) => updateSetting(type, k, v)} />
      </div>
    );
  };

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
              <option value="global">Global (Default for all)</option>
              <option value="integration">Integration Override</option>
              <option value="conversation">Conversation Override</option>
            </select>
          </Field>

          {f.scope === "integration" && (
            <Field label="Integration" required>
              <select
                value={f.scope_id}
                onChange={(e) => setF({ ...f, scope_id: e.target.value })}
              >
                <option value="">— Select Integration —</option>
                {integrations.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.platform} · {i.account}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {f.scope === "conversation" && (
            <Field label="Conversation UUID" required>
              <input
                type="text"
                value={f.scope_id}
                onChange={(e) => setF({ ...f, scope_id: e.target.value })}
                placeholder="Conversation UUID"
              />
            </Field>
          )}
        </div>
      )}

      <datalist id="models-datalist">
        {[...new Set([...(ollamaModels || []), ...MODEL_SUGGESTIONS])].map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {renderCapabilityCard("chat", "Chat Engine (Primary)", Bot, true, "llama3.2")}
      {renderCapabilityCard("summary", "Summarization Worker", FileText, false, "mistral")}
      {renderCapabilityCard("image", "Image / Vision Analysis", ImageIcon, false, "gpt-4o-mini")}
      {renderCapabilityCard("voice", "Voice / Audio Transcription", Mic, false, "whisper-1")}
      {renderCapabilityCard("video", "Video Clip Analysis", VideoIcon, false, "qwen2.5-vl:7b")}

      <div className="grid-2" style={{ marginTop: 16 }}>
        <Field label="Pre-Reply Artificial Delay (seconds)" hint="Human-like typing delay">
          <input
            type="number"
            min="0"
            value={f.request_delay}
            onChange={(e) => setF({ ...f, request_delay: e.target.value })}
            placeholder="0"
          />
        </Field>

        <Field label="Request Timeout (seconds)" hint="Default: 300s">
          <input
            type="number"
            min="0"
            value={f.request_timeout}
            onChange={(e) => setF({ ...f, request_timeout: e.target.value })}
            placeholder="300"
          />
        </Field>
      </div>

      <div className="modal-footer-bar" style={{ padding: "20px 0 0", background: "none", borderTop: "1px solid var(--border)", marginTop: 20 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving && <Spinner />}
          {init?.id ? "Save Model Config" : "Create Model Config"}
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

        <button className="btn btn-primary" onClick={() => setModal({})}>
          <Plus size={16} />
          <span>Add Model Config</span>
        </button>
      </div>

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
