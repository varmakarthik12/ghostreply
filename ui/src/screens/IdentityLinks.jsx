import { useState } from "react";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Field from "../components/Field";
import LoadTable from "../components/LoadTable";
import Modal from "../components/Modal";
import Spinner from "../components/Spinner";
import { apiDel, apiGet, apiPost } from "../lib/api";
import { useResource } from "../lib/hooks";
import { toast } from "../lib/toast";
import { platformColor, shortId } from "../lib/utils";

function LinkForm({ onSave, onCancel }) {
  const [f, setF] = useState({
    host_user_id: "",
    platform: "",
    platform_user_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!f.host_user_id || !f.platform || !f.platform_user_id) {
      setErr("All fields are required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await apiPost("/identity-links", f);
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
      <Field label="Host User ID *">
        <input
          value={f.host_user_id}
          onChange={(e) => setF({ ...f, host_user_id: e.target.value })}
          placeholder="alex_main"
        />
      </Field>
      <Field label="Platform *">
        <input
          value={f.platform}
          onChange={(e) => setF({ ...f, platform: e.target.value })}
          placeholder="telegram, whatsapp…"
        />
      </Field>
      <Field label="Platform User ID *">
        <input
          value={f.platform_user_id}
          onChange={(e) => setF({ ...f, platform_user_id: e.target.value })}
          placeholder="@alexsmith or +1234567890"
        />
      </Field>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner /> : null} Add
        </button>
      </div>
    </>
  );
}

export default function IdentityLinks() {
  const [s, reload] = useResource(() => apiGet("/identity-links"), []);
  const [modal, setModal] = useState(false);

  async function del(id) {
    if (!window.confirm("Delete identity link?")) return;
    try {
      await apiDel("/identity-links/" + id);
      toast("Deleted");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      <div className="row">
        <h2 style={{ margin: 0 }}>🔗 Identity Links</h2>
        <button
          className="btn btn-primary"
          style={{ marginLeft: "auto" }}
          onClick={() => setModal(true)}
        >
          + Add Link
        </button>
      </div>
      <LoadTable
        state={s}
        cols={["Host User ID", "Platform", "Platform User ID", "ID", "Action"]}
        emptyText="No identity links"
        renderRow={(r) => (
          <tr key={r.id}>
            <td>
              <code>{r.host_user_id}</code>
            </td>
            <td>
              <Badge color={platformColor(r.platform)}>{r.platform}</Badge>
            </td>
            <td className="mono">{r.platform_user_id}</td>
            <td
              className="mono"
              style={{ fontSize: 11, color: "var(--muted)" }}
            >
              {shortId(r.id)}
            </td>
            <td>
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
        <Modal title="Add Identity Link" onClose={() => setModal(false)}>
          <LinkForm
            onSave={() => {
              setModal(false);
              toast("Saved");
              reload();
            }}
            onCancel={() => setModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}
