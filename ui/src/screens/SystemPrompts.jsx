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

function PromptForm({ init, integrations, onSave, onCancel }) {
  const [f, setF] = useState({
    scope: "global",
    scope_id: "",
    text: "",
    ...init,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!f.text.trim()) {
      setErr("Text is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      if (init?.id)
        await apiPut("/system-prompts/" + init.id, { text: f.text });
      else await apiPost("/system-prompts", f);
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
      <Field label="Persona Text *">
        <textarea
          value={f.text}
          onChange={(e) => setF({ ...f, text: e.target.value })}
          placeholder={
            "You are Alex, a 28-year-old software engineer.\nYou are casual, use abbreviations, reply briefly.\nDo not reveal you are an AI."
          }
          style={{ minHeight: 200 }}
        />
      </Field>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        💡 Write in first person. Include personality, tone, and topics to
        avoid.
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

export default function SystemPrompts() {
  const [s, reload] = useResource(() => apiGet("/system-prompts"), []);
  const [intS] = useResource(() => apiGet("/integrations"), []);
  const [modal, setModal] = useState(null);
  const ints = intS.data || [];

  async function del(id) {
    if (!window.confirm("Delete this system prompt?")) return;
    try {
      await apiDel("/system-prompts/" + id);
      toast("Deleted");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      <div className="row">
        <h2 style={{ margin: 0 }}>🎭 System Prompts</h2>
        <button
          className="btn btn-primary"
          style={{ marginLeft: "auto" }}
          onClick={() => setModal({})}
        >
          + Add Prompt
        </button>
      </div>
      <LoadTable
        state={s}
        cols={["Scope", "Scope ID", "Preview", "Actions"]}
        emptyText="No system prompts"
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
            <td
              style={{
                fontStyle: "italic",
                color: "var(--muted)",
                maxWidth: 300,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.text.slice(0, 80)}
              {r.text.length > 80 ? "…" : ""}
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
          title={modal.id ? "Edit Prompt" : "Add Prompt"}
          onClose={() => setModal(null)}
          wide
        >
          <PromptForm
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
