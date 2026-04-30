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
];

function ModelForm({ init, integrations, onSave, onCancel }) {
  const [f, setF] = useState({
    scope: "global",
    scope_id: "",
    value: "",
    ...init,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!f.value.trim()) {
      setErr("Model name is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      if (init?.id)
        await apiPut("/model-configs/" + init.id, { value: f.value });
      else await apiPost("/model-configs", f);
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
          value={f.value}
          onChange={(e) => setF({ ...f, value: e.target.value })}
          placeholder="llama3.2"
        />
        <datalist id="model-list">
          {MODEL_SUGGESTIONS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
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
  const [modal, setModal] = useState(null);
  const ints = intS.data || [];

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
              <code>{r.value}</code>
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
