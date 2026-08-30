import { useState } from "react";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Field from "../components/Field";
import LoadTable from "../components/LoadTable";
import Modal from "../components/Modal";
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
  "gemma-3n-e4b-it",
  "gemma-3-4b-it",
  "gemma-3-12b-it",
  "gemma-3-27b-it",
  "mistral",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-3.5-turbo",
  "gemini-2.0-flash",
];

// Thinking level presets
const THINKING_LEVEL_OPTIONS = [
  { value: "none",   label: "None (disabled)",   budget: 0   },
  { value: "low",    label: "Low  (~512 tokens)", budget: 512 },
  { value: "medium", label: "Medium (~2K tokens)",budget: 2048},
  { value: "high",   label: "High  (~8K tokens)", budget: 8192},
  { value: "custom", label: "Custom budget…",      budget: null},
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
  // Determine thinking level UI state
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
          chat:    parseModelSetting(parsed.chat),
          summary: parseModelSetting(parsed.summary),
          image:   parseModelSetting(parsed.image),
          voice:   parseModelSetting(parsed.voice),
          video:   parseModelSetting(parsed.video),
          request_delay:   parsed.request_delay   || 0,
          request_timeout: parsed.request_timeout || 0,
        };
      } else if (parsed.model) {
        // Legacy model JSON format
        return {
          chat:    parseModelSetting({ model: parsed.model || "", url: "", api_key: "", context_size: parsed.context_size || 0 }),
          summary: parseModelSetting({ model: parsed.summary_model || "" }),
          image:   parseModelSetting({ model: parsed.image_model || parsed.vision_model || "" }),
          voice:   parseModelSetting({ model: parsed.voice_model || "" }),
          video:   parseModelSetting({ model: parsed.video_model || "" }),
          request_delay:   parsed.request_delay   || 0,
          request_timeout: parsed.request_timeout || 0,
        };
      }
    }
  } catch (e) {}
  return {
    chat:    parseModelSetting({ model: val || "" }),
    summary: parseModelSetting(null),
    image:   parseModelSetting(null),
    voice:   parseModelSetting(null),
    video:   parseModelSetting(null),
    request_delay:   0,
    request_timeout: 0,
  };
};

/** Encode a ModelSetting back to a plain object for JSON storage */
const encodeModelSetting = (s) => {
  const thinking_level =
    s.thinking_level === "custom"
      ? s._custom_thinking_budget || "high"
      : s.thinking_level || "high";
  return {
    model:              s.model || "",
    url:                s.url || "",
    api_key:            s.api_key || "",
    context_size:       parseInt(s.context_size) || 0,
    temperature:        parseFloat(s.temperature) || SAMPLING_DEFAULTS.temperature,
    top_p:              parseFloat(s.top_p)       || SAMPLING_DEFAULTS.top_p,
    top_k:              parseInt(s.top_k)         || SAMPLING_DEFAULTS.top_k,
    min_p:              parseFloat(s.min_p)       || SAMPLING_DEFAULTS.min_p,
    repetition_penalty: parseFloat(s.repetition_penalty) || SAMPLING_DEFAULTS.repetition_penalty,
    thinking_level,
  };
};

// ─── Thinking Level Selector ─────────────────────────────────────────────────
function ThinkingLevelField({ value, customBudget, onChange, onCustomBudgetChange }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <Field label="🧠 Thinking Level" style={{ flex: 1, minWidth: 160 }}>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {THINKING_LEVEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>
      {value === "custom" && (
        <Field label="Budget (tokens)" style={{ width: 140 }}>
          <input
            type="number"
            min="0"
            value={customBudget}
            onChange={(e) => onCustomBudgetChange(e.target.value)}
            placeholder="e.g. 4096"
          />
        </Field>
      )}
    </div>
  );
}

// ─── Sampling Params Accordion ────────────────────────────────────────────────
function SamplingAccordion({ setting, onUpdate }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--muted)",
          fontSize: 12,
          padding: "4px 0",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span style={{ transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(90deg)" : "none" }}>▶</span>
        {open ? "Hide" : "Show"} Advanced Sampling Params
      </button>
      {open && (
        <div
          style={{
            background: "var(--surface2, rgba(255,255,255,0.04))",
            borderRadius: 8,
            padding: "12px 14px",
            marginTop: 6,
            border: "1px solid var(--border, rgba(255,255,255,0.08))",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            <Field label={`Temperature (${SAMPLING_DEFAULTS.temperature})`}>
              <input
                type="number" step="0.01" min="0" max="2"
                value={setting.temperature ?? SAMPLING_DEFAULTS.temperature}
                onChange={(e) => onUpdate("temperature", e.target.value)}
                placeholder={String(SAMPLING_DEFAULTS.temperature)}
              />
            </Field>
            <Field label={`Top P (${SAMPLING_DEFAULTS.top_p})`}>
              <input
                type="number" step="0.01" min="0" max="1"
                value={setting.top_p ?? SAMPLING_DEFAULTS.top_p}
                onChange={(e) => onUpdate("top_p", e.target.value)}
                placeholder={String(SAMPLING_DEFAULTS.top_p)}
              />
            </Field>
            <Field label={`Top K (${SAMPLING_DEFAULTS.top_k})`}>
              <input
                type="number" step="1" min="0"
                value={setting.top_k ?? SAMPLING_DEFAULTS.top_k}
                onChange={(e) => onUpdate("top_k", e.target.value)}
                placeholder={String(SAMPLING_DEFAULTS.top_k)}
              />
            </Field>
            <Field label={`Min P (${SAMPLING_DEFAULTS.min_p})`}>
              <input
                type="number" step="0.001" min="0" max="1"
                value={setting.min_p ?? SAMPLING_DEFAULTS.min_p}
                onChange={(e) => onUpdate("min_p", e.target.value)}
                placeholder={String(SAMPLING_DEFAULTS.min_p)}
              />
            </Field>
            <Field label={`Repetition Penalty (${SAMPLING_DEFAULTS.repetition_penalty})`}>
              <input
                type="number" step="0.01" min="1" max="2"
                value={setting.repetition_penalty ?? SAMPLING_DEFAULTS.repetition_penalty}
                onChange={(e) => onUpdate("repetition_penalty", e.target.value)}
                placeholder={String(SAMPLING_DEFAULTS.repetition_penalty)}
              />
            </Field>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
            💡 Defaults tuned for thinking &amp; instruction-following models. Higher temperature + repetition penalty keeps replies natural and varied.
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
    chat:    initialValues.chat,
    summary: initialValues.summary,
    image:   initialValues.image,
    voice:   initialValues.voice,
    video:   initialValues.video,
    request_delay:   initialValues.request_delay,
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
      setErr("Chat model name is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const payload = {
        ...f,
        value: JSON.stringify({
          chat:    encodeModelSetting(f.chat),
          summary: encodeModelSetting(f.summary),
          image:   encodeModelSetting(f.image),
          voice:   encodeModelSetting(f.voice),
          video:   encodeModelSetting(f.video),
          request_delay:   parseInt(f.request_delay)   || 0,
          request_timeout: parseInt(f.request_timeout) || 0,
        }),
      };
      // Remove local UI fields from DB payload
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

  const renderModelSection = (type, title, isRequired = false, placeholderModel = "") => {
    const setting = f[type] || emptyModelSetting();
    return (
      <div className="card" style={{ marginBottom: 16, padding: "16px 20px", borderLeft: "4px solid var(--accent)" }} key={type}>
        <h4 style={{ margin: "0 0 12px 0", color: "var(--accent)" }}>
          {title} {isRequired && <span style={{ color: "var(--red)" }}>*</span>}
        </h4>
        <div className="responsive-grid" style={{ gap: 12 }}>
          <Field label="Model Name">
            <input
              list="model-list"
              value={setting.model}
              onChange={(e) => updateSetting(type, "model", e.target.value)}
              placeholder={placeholderModel}
            />
          </Field>
          <Field label="LLM URL (Host & Port)">
            <input
              value={setting.url}
              onChange={(e) => updateSetting(type, "url", e.target.value)}
              placeholder="e.g. http://localhost:11434"
            />
          </Field>
          <Field label="API Key">
            <input
              type="password"
              value={setting.api_key}
              onChange={(e) => updateSetting(type, "api_key", e.target.value)}
              placeholder="Leave blank for local/Ollama"
            />
          </Field>
          <Field label="Context Window (tokens)">
            <input
              type="number"
              min="0"
              value={setting.context_size || ""}
              onChange={(e) => updateSetting(type, "context_size", e.target.value)}
              placeholder="e.g. 30000 (0 for default)"
            />
          </Field>
        </div>

        {/* Thinking Level */}
        <div style={{ marginTop: 12 }}>
          <ThinkingLevelField
            value={setting.thinking_level || "high"}
            customBudget={setting._custom_thinking_budget || ""}
            onChange={(val) => updateSetting(type, "thinking_level", val)}
            onCustomBudgetChange={(val) => updateSetting(type, "_custom_thinking_budget", val)}
          />
        </div>

        {/* Sampling Params accordion */}
        <SamplingAccordion
          setting={setting}
          onUpdate={(field, val) => updateSetting(type, field, val)}
        />
      </div>
    );
  };

  return (
    <div style={{ maxHeight: "calc(90vh - 120px)", overflowY: "auto", paddingRight: 8 }}>
      {err && (
        <Alert type="error" onClose={() => setErr("")}>
          {err}
        </Alert>
      )}
      {!init?.id && (
        <div className="responsive-grid" style={{ gap: 16, marginBottom: 16 }}>
          <Field label="Scope">
            <select
              value={f.scope}
              onChange={(e) =>
                setF({ ...f, scope: e.target.value, scope_id: "" })
              }
            >
              <option value="global">Global</option>
              <option value="integration">Integration</option>
              <option value="conversation">Conversation</option>
            </select>
          </Field>
          {f.scope === "integration" && (
            <Field label="Integration">
              <select
                value={f.scope_id}
                onChange={(e) => setF({ ...f, scope_id: e.target.value })}
              >
                <option value="">— select —</option>
                {integrations.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.platform} · {i.account}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {f.scope === "conversation" && (
            <Field label="Conversation ID">
              <input
                value={f.scope_id}
                onChange={(e) => setF({ ...f, scope_id: e.target.value })}
                placeholder="conversation UUID"
              />
            </Field>
          )}
        </div>
      )}

      <datalist id="model-list">
        {[...new Set([...(ollamaModels || []), ...MODEL_SUGGESTIONS])].map(
          (m) => (
            <option key={m} value={m} />
          ),
        )}
      </datalist>

      {renderModelSection("chat",    "💬 Chat (Conversation Model)",              true,  "llama3.2")}
      {renderModelSection("summary", "📝 Summary Model",                          false, "Mistral (falls back to Chat if empty)")}
      {renderModelSection("image",   "🖼️ Image Model (Vision capabilities)",      false, "gpt-4o-mini (falls back to Chat if empty)")}
      {renderModelSection("voice",   "🎙️ Voice Model (Audio / Speech capabilities)", false, "whisper-1")}
      {renderModelSection("video",   "🎥 Video Model (Video Clip analysis capabilities)", false, "Qwen2.5-VL-7B (falls back to Chat if empty)")}

      <div className="responsive-grid" style={{ gap: 16, marginTop: 16 }}>
        <Field label="Request Delay (seconds)">
          <input
            type="number"
            min="0"
            value={f.request_delay}
            onChange={(e) => setF({ ...f, request_delay: e.target.value })}
            placeholder="0"
          />
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            Wait this many seconds before triggering the LLM.
          </div>
        </Field>
        <Field label="Request Timeout (seconds)">
          <input
            type="number"
            min="0"
            value={f.request_timeout}
            onChange={(e) => setF({ ...f, request_timeout: e.target.value })}
            placeholder="0 (defaults to 300s)"
          />
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            Maximum time to wait for the LLM response.
          </div>
        </Field>
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", margin: "16px 0" }}>
        💡 <strong>Inheritance:</strong> conversation → integration → global → default. Fallback models default to Chat settings.
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner /> : null}
          {init?.id ? "Save" : "Add"}
        </button>
      </div>
    </div>
  );
}

export default function ModelConfigs() {
  const [s, reload] = useResource(() => apiGet("/model-configs"), []);
  const [intS] = useResource(() => apiGet("/integrations"), []);
  const [ollamaS] = useResource(() => apiGet("/ollama/models"), []);
  const [modal, setModal] = useState(null);
  const ints = intS.data || [];
  const ollamaModels = ollamaS.data || [];

  async function del(id) {
    if (!window.confirm("Delete model config?")) return;
    try {
      await apiDel("/model-configs/" + id);
      toast("Deleted");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      <div className="row">
        <h2 style={{ margin: 0 }}>🤖 Model Configs</h2>
        <button
          className="btn btn-primary"
          style={{ marginLeft: "auto" }}
          onClick={() => setModal({})}
        >
          + Add Model
        </button>
      </div>
      <LoadTable
        state={s}
        cols={["Scope", "Scope ID", "Model Settings", "Actions"]}
        emptyText="No model configs — default: llama3.2"
        renderRow={(r) => (
          <tr key={r.id}>
            <td>
              <Badge color={scopeColor(r.scope)}>{r.scope}</Badge>
            </td>
            <td
              className="mono"
              style={{ fontSize: 11, color: "var(--muted)" }}
            >
              {r.scope_id ? shortId(r.scope_id) : "—"}
            </td>
            <td>
              {(() => {
                const cfg = parseValue(r.value);
                const renderSetting = (label, s) => {
                  if (!s || !s.model) return null;
                  const thinkingLabel = s.thinking_level && s.thinking_level !== "none"
                    ? ` 🧠${s.thinking_level}`
                    : "";
                  return (
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }} key={label}>
                      {label}: <code>{s.model}</code>
                      {s.url && ` (${s.url})`}
                      {s.context_size > 0 && ` [${s.context_size} ctx]`}
                      {thinkingLabel && <span style={{ color: "var(--accent)", marginLeft: 4 }}>{thinkingLabel}</span>}
                    </div>
                  );
                };
                const chatThinking = cfg.chat.thinking_level && cfg.chat.thinking_level !== "none"
                  ? ` 🧠 ${cfg.chat.thinking_level}`
                  : "";
                const samplingHint = `t=${cfg.chat.temperature ?? SAMPLING_DEFAULTS.temperature} p=${cfg.chat.top_p ?? SAMPLING_DEFAULTS.top_p} k=${cfg.chat.top_k ?? SAMPLING_DEFAULTS.top_k}`;
                return (
                  <div>
                    <code>{cfg.chat.model}</code>
                    {cfg.chat.url && <span style={{ fontSize: 10, color: "var(--primary)" }}> ({cfg.chat.url})</span>}
                    {cfg.chat.context_size > 0 && <span style={{ fontSize: 10, color: "var(--muted)" }}> [{cfg.chat.context_size} ctx]</span>}
                    {chatThinking && <span style={{ fontSize: 10, color: "var(--accent)", marginLeft: 4 }}>{chatThinking}</span>}
                    {(cfg.request_delay > 0 || cfg.request_timeout > 0) && (
                      <div style={{ fontSize: 10, color: "var(--primary)", marginTop: 2 }}>
                        ⏱️ {cfg.request_delay}s delay / {cfg.request_timeout || 300}s timeout
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, fontFamily: "monospace" }}>
                      {samplingHint}
                    </div>
                    {renderSetting("📝 Summary", cfg.summary)}
                    {renderSetting("🖼️ Image",   cfg.image)}
                    {renderSetting("🎙️ Voice",   cfg.voice)}
                    {renderSetting("🎥 Video",   cfg.video)}
                  </div>
                );
              })()}
            </td>
            <td>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setModal(r)}
              >
                Edit
              </button>{" "}
              <button
                className="btn btn-danger btn-sm"
                onClick={() => del(r.id)}
              >
                Delete
              </button>
            </td>
          </tr>
        )}
      />
      {modal && (
        <Modal
          wide
          title={modal.id ? "Edit Model Config" : "Add Model Config"}
          onClose={() => setModal(null)}
        >
          <ModelForm
            init={modal}
            integrations={ints}
            ollamaModels={ollamaModels}
            onSave={() => {
              setModal(null);
              toast("Saved");
              reload();
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
