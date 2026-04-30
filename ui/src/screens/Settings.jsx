import { useEffect, useState } from "react";
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

const CONFIG_KEYS = [
  {
    key: "llm_url",
    default: "http://localhost:11434",
    group: "llm",
    desc: "LLM endpoint (Ollama or any OpenAI-compatible URL)",
  },
  {
    key: "llm_key",
    default: "(empty)",
    group: "llm",
    desc: "API key — leave blank for Ollama",
  },
  {
    key: "summary_threshold",
    default: "50",
    group: "summary",
    desc: "Messages before auto-summarization",
  },
  {
    key: "token_threshold",
    default: "4000",
    group: "summary",
    desc: "Token count before early summarization",
  },
  {
    key: "max_context_messages",
    default: "20",
    group: "summary",
    desc: "Recent messages sent to LLM per request",
  },
  {
    key: "reply_style",
    default: "brief",
    group: "other",
    desc: "Persona hint: brief or detailed",
  },
];

function ConfigForm({ init, onSave, onCancel }) {
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
    if (!f.key || !f.value) {
      setErr("Key and value are required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      if (init?.id)
        await apiPut("/configs/" + init.id, { key: f.key, value: f.value });
      else await apiPost("/configs", f);
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
          {(f.scope === "integration" || f.scope === "conversation") && (
            <Field label="Scope ID">
              <input
                value={f.scope_id}
                onChange={(e) => setF({ ...f, scope_id: e.target.value })}
                placeholder="integration or conversation UUID"
              />
            </Field>
          )}
        </>
      )}
      <Field label="Key *">
        <input
          list="config-keys"
          value={f.key}
          onChange={(e) => setF({ ...f, key: e.target.value })}
          placeholder="llm_url"
        />
        <datalist id="config-keys">
          {CONFIG_KEYS.map((k) => (
            <option key={k.key} value={k.key} />
          ))}
        </datalist>
      </Field>
      <Field label="Value *">
        <input
          value={f.value}
          onChange={(e) => setF({ ...f, value: e.target.value })}
          placeholder="http://localhost:11434"
        />
      </Field>
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

export default function Settings() {
  const [s, reload] = useResource(() => apiGet("/configs"), []);
  const [modal, setModal] = useState(null);

  // LLM quick-config state
  const [llmUrl, setLlmUrl] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [savingLlm, setSavingLlm] = useState(false);

  useEffect(() => {
    if (!s.data) return;
    const url = s.data.find((c) => c.scope === "global" && c.key === "llm_url");
    const key = s.data.find((c) => c.scope === "global" && c.key === "llm_key");
    if (url) setLlmUrl(url.value);
    if (key) setLlmKey(key.value);
  }, [s.data]);

  async function saveLlmConfig() {
    setSavingLlm(true);
    try {
      const upsert = async (key, value) => {
        const existing = (s.data || []).find(
          (c) => c.scope === "global" && c.key === key,
        );
        if (existing) await apiPut("/configs/" + existing.id, { key, value });
        else
          await apiPost("/configs", {
            scope: "global",
            scope_id: "",
            key,
            value,
          });
      };
      await upsert("llm_url", llmUrl || "http://localhost:11434");
      if (llmKey !== "") await upsert("llm_key", llmKey);
      toast("LLM config saved");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
    setSavingLlm(false);
  }

  async function del(id) {
    if (!window.confirm("Delete config?")) return;
    try {
      await apiDel("/configs/" + id);
      toast("Deleted");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      <div className="row">
        <h2 style={{ margin: 0 }}>⚙️ Settings</h2>
        <button
          className="btn btn-primary"
          style={{ marginLeft: "auto" }}
          onClick={() => setModal({})}
        >
          + Add Config
        </button>
      </div>

      {/* LLM provider quick-setup */}
      <div
        className="card"
        style={{ marginBottom: 16, borderColor: "#1f6feb" }}
      >
        <h3>🤖 LLM Provider (Global)</h3>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
          Default LLM endpoint and API key. Override per-integration or
          per-conversation in the table below.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Field label="LLM URL">
            <input
              list="llm-url-hints"
              value={llmUrl}
              onChange={(e) => setLlmUrl(e.target.value)}
              placeholder="http://localhost:11434"
            />
            <datalist id="llm-url-hints">
              <option value="http://localhost:11434" />
              <option value="https://api.openai.com" />
              <option value="https://api.groq.com/openai" />
              <option value="https://openrouter.ai/api" />
            </datalist>
          </Field>
          <Field label="API Key (leave blank for Ollama)">
            <input
              type="password"
              value={llmKey}
              onChange={(e) => setLlmKey(e.target.value)}
              placeholder="sk-… or blank for Ollama"
            />
          </Field>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          💡 Ollama: leave API Key blank. OpenAI / Groq / OpenRouter: set the
          URL and paste the key.
        </div>
        <button
          className="btn btn-accent"
          onClick={saveLlmConfig}
          disabled={savingLlm}
        >
          {savingLlm ? <Spinner /> : null} Save LLM Config
        </button>
      </div>

      {/* Reference table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Config Key Reference</h3>
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Default</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {CONFIG_KEYS.map((k) => (
              <tr key={k.key}>
                <td>
                  <code
                    style={{
                      color:
                        k.group === "llm" ? "var(--purple)" : "var(--accent)",
                    }}
                  >
                    {k.key}
                  </code>
                </td>
                <td className="mono" style={{ color: "var(--muted)" }}>
                  {k.default}
                </td>
                <td style={{ color: "var(--muted)" }}>{k.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LoadTable
        state={s}
        cols={["Scope", "Scope ID", "Key", "Value", "Actions"]}
        emptyText="No configs — defaults are used"
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
              <code style={{ color: "var(--accent)" }}>{r.key}</code>
            </td>
            <td className="mono">
              {r.key === "llm_key" && r.value ? "••••••••" : r.value}
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
          title={modal.id ? "Edit Config" : "Add Config"}
          onClose={() => setModal(null)}
        >
          <ConfigForm
            init={modal}
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
