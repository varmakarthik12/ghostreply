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
  "mistral",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-3.5-turbo",
  "gemini-2.0-flash",
];

const parseValue = (val) => {
  try {
    const parsed = JSON.parse(val);
    if (parsed && typeof parsed === "object") {
      if (parsed.chat || parsed.summary || parsed.image || parsed.voice) {
        return {
          chat: parsed.chat || { model: "", url: "", api_key: "", context_size: 0 },
          summary: parsed.summary || { model: "", url: "", api_key: "", context_size: 0 },
          image: parsed.image || { model: "", url: "", api_key: "", context_size: 0 },
          voice: parsed.voice || { model: "", url: "", api_key: "", context_size: 0 },
          request_delay: parsed.request_delay || 0,
          request_timeout: parsed.request_timeout || 0,
        };
      } else if (parsed.model) {
        // Legacy model JSON format
        return {
          chat: { model: parsed.model || "", url: "", api_key: "", context_size: parsed.context_size || 0 },
          summary: { model: parsed.summary_model || "", url: "", api_key: "", context_size: 0 },
          image: { model: parsed.image_model || parsed.vision_model || "", url: "", api_key: "", context_size: 0 },
          voice: { model: parsed.voice_model || "", url: "", api_key: "", context_size: 0 },
          request_delay: parsed.request_delay || 0,
          request_timeout: parsed.request_timeout || 0,
        };
      }
    }
  } catch (e) {}
  return {
    chat: { model: val || "", url: "", api_key: "", context_size: 0 },
    summary: { model: "", url: "", api_key: "", context_size: 0 },
    image: { model: "", url: "", api_key: "", context_size: 0 },
    voice: { model: "", url: "", api_key: "", context_size: 0 },
    request_delay: 0,
    request_timeout: 0,
  };
};

function ModelForm({ init, integrations, ollamaModels, onSave, onCancel }) {
  const initialValues = parseValue(init?.value);

  const [f, setF] = useState({
    scope: "global",
    scope_id: "",
    chat: initialValues.chat,
    summary: initialValues.summary,
    image: initialValues.image,
    voice: initialValues.voice,
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
        ...(prev[type] || { model: "", url: "", api_key: "", context_size: 0 }),
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
          chat: {
            model: f.chat.model,
            url: f.chat.url || "",
            api_key: f.chat.api_key || "",
            context_size: parseInt(f.chat.context_size) || 0,
          },
          summary: {
            model: f.summary.model || "",
            url: f.summary.url || "",
            api_key: f.summary.api_key || "",
            context_size: parseInt(f.summary.context_size) || 0,
          },
          image: {
            model: f.image.model || "",
            url: f.image.url || "",
            api_key: f.image.api_key || "",
            context_size: parseInt(f.image.context_size) || 0,
          },
          voice: {
            model: f.voice.model || "",
            url: f.voice.url || "",
            api_key: f.voice.api_key || "",
            context_size: parseInt(f.voice.context_size) || 0,
          },
          request_delay: parseInt(f.request_delay) || 0,
          request_timeout: parseInt(f.request_timeout) || 0,
        }),
      };
      // Remove local UI fields from DB payload
      delete payload.chat;
      delete payload.summary;
      delete payload.image;
      delete payload.voice;
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
    const setting = f[type] || { model: "", url: "", api_key: "", context_size: 0 };
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

      {renderModelSection("chat", "💬 Chat (Conversation Model)", true, "llama3.2")}
      {renderModelSection("summary", "📝 Summary Model", false, "Mistral (falls back to Chat if empty)")}
      {renderModelSection("image", "🖼️ Image Model (Vision capabilities)", false, "gpt-4o-mini (falls back to Chat if empty)")}
      {renderModelSection("voice", "🎙️ Voice Model (Audio / Speech capabilities)", false, "whisper-1")}

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
                  return (
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }} key={label}>
                      {label}: <code>{s.model}</code>
                      {s.url && ` (${s.url})`}
                      {s.context_size > 0 && ` [${s.context_size} ctx]`}
                    </div>
                  );
                };
                return (
                  <div>
                    <code>{cfg.chat.model}</code>
                    {cfg.chat.url && <span style={{ fontSize: 10, color: "var(--primary)" }}> ({cfg.chat.url})</span>}
                    {cfg.chat.context_size > 0 && <span style={{ fontSize: 10, color: "var(--muted)" }}> [{cfg.chat.context_size} ctx]</span>}
                    {(cfg.request_delay > 0 || cfg.request_timeout > 0) && (
                      <div style={{ fontSize: 10, color: "var(--primary)", marginTop: 2 }}>
                        ⏱️ {cfg.request_delay}s delay / {cfg.request_timeout || 300}s timeout
                      </div>
                    )}
                    {renderSetting("📝 Summary", cfg.summary)}
                    {renderSetting("🖼️ Image", cfg.image)}
                    {renderSetting("🎙️ Voice", cfg.voice)}
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
