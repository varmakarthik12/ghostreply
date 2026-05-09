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

function ModelForm({ init, integrations, ollamaModels, onSave, onCancel }) {
  const parseValue = (val) => {
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === "object" && parsed.model) {
        return {
          model: parsed.model,
          request_delay: parsed.request_delay || 0,
          request_timeout: parsed.request_timeout || 0,
          summary_model: parsed.summary_model || "",
          context_size: parsed.context_size || 30000,
        };
      }
    } catch (e) {}
    return { model: val || "", request_delay: 0, request_timeout: 0, summary_model: "", context_size: 30000 };
  };

  const initialValues = parseValue(init?.value);

  const [f, setF] = useState({
    scope: "global",
    scope_id: "",
    model: initialValues.model,
    request_delay: initialValues.request_delay,
    request_timeout: initialValues.request_timeout,
    summary_model: initialValues.summary_model,
    context_size: initialValues.context_size,
    ...init,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!f.model.trim()) {
      setErr("Model name is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const payload = {
        ...f,
        value: JSON.stringify({
          model: f.model,
          request_delay: parseInt(f.request_delay) || 0,
          request_timeout: parseInt(f.request_timeout) || 0,
          summary_model: f.summary_model || "",
          context_size: parseInt(f.context_size) || 30000,
        }),
      };
      // Remove local UI fields from DB payload
      delete payload.model;
      delete payload.request_delay;
      delete payload.request_timeout;
      delete payload.summary_model;
      delete payload.context_size;

      if (init?.id) await apiPut("/model-configs/" + init.id, payload);
      else await apiPost("/model-configs", payload);
      onSave();
    } catch (e) {
      setErr(e.message);
    }
    setSaving(false);
  }

  return (
    <>
      {err && (
        <Alert type="error" onClose={() => setErr("")}>
          {err}
        </Alert>
      )}
      {!init?.id && (
        <>
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
        </>
      )}
      <Field label="Model Name *">
        <input
          list="model-list"
          value={f.model}
          onChange={(e) => setF({ ...f, model: e.target.value })}
          placeholder="llama3.2"
        />
        <datalist id="model-list">
          {[...new Set([...(ollamaModels || []), ...MODEL_SUGGESTIONS])].map(
            (m) => (
              <option key={m} value={m} />
            ),
          )}
        </datalist>
      </Field>
      <Field label="Summary Model">
        <input
          list="model-list"
          value={f.summary_model}
          onChange={(e) => setF({ ...f, summary_model: e.target.value })}
          placeholder="Mistral (fallback to main model if empty)"
        />
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          Optional: Use a different model for background summarization to save
          costs or time.
        </div>
      </Field>
      <Field label="Request Delay (seconds)">
        <input
          type="number"
          min="0"
          value={f.request_delay}
          onChange={(e) => setF({ ...f, request_delay: e.target.value })}
          placeholder="0"
        />
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          Wait this many seconds before triggering the LLM to avoid overwhelming
          it.
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
          Maximum time to wait for the LLM response. Use a higher value for slow
          models.
        </div>
      </Field>
      <Field label="Context Window (tokens)">
        <input
          type="number"
          min="0"
          value={f.context_size}
          onChange={(e) => setF({ ...f, context_size: e.target.value })}
          placeholder="30000"
        />
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          Maximum context window size (Ollama: <code>num_ctx</code>). Default: 30,000.
        </div>
      </Field>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        Inheritance: conversation → integration → global → default (llama3.2)
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
    </>
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
        cols={["Scope", "Scope ID", "Model", "Actions"]}
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
                try {
                  const p = JSON.parse(r.value);
                  if (p && p.model) {
                    return (
                      <div>
                        <code>{p.model}</code>
                        {p.request_delay > 0 && (
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--primary)",
                              marginTop: 2,
                            }}
                          >
                            ⏱️ {p.request_delay}s delay / {p.request_timeout || 300}s timeout
                          </div>
                        )}
                        {p.summary_model && (
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--muted)",
                              marginTop: 2,
                            }}
                          >
                            📝 Summary: <code>{p.summary_model}</code>
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--muted)",
                            marginTop: 2,
                          }}
                        >
                          🧠 Context: {p.context_size || 30000} tokens
                        </div>
                      </div>
                    );
                  }
                } catch (e) {}
                return <code>{r.value}</code>;
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
