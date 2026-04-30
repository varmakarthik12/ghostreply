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
import { platformColor, shortId } from "../lib/utils";

function IntegrationForm({ init, onSave, onCancel }) {
  const [f, setF] = useState({
    platform: "",
    account: "",
    token: "",
    webhook_url: "",
    active: 1,
    ...init,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!f.platform || !f.account) {
      setErr("Platform and Account are required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      if (init?.id) await apiPut("/integrations/" + init.id, f);
      else await apiPost("/integrations", f);
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
      <Field label="Platform *">
        <input
          value={f.platform}
          onChange={(e) => setF({ ...f, platform: e.target.value })}
          placeholder="telegram, whatsapp, sms…"
        />
      </Field>
      <Field label="Account Label *">
        <input
          value={f.account}
          onChange={(e) => setF({ ...f, account: e.target.value })}
          placeholder="My Telegram Bot"
        />
      </Field>
      <Field label="Token">
        <input
          value={f.token}
          onChange={(e) => setF({ ...f, token: e.target.value })}
          placeholder="Platform API token (optional)"
        />
      </Field>
      <Field label="Webhook URL">
        <input
          value={f.webhook_url}
          onChange={(e) => setF({ ...f, webhook_url: e.target.value })}
          placeholder="https://… (optional)"
        />
      </Field>
      {init?.id && (
        <Field label="Active">
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={!!f.active}
              onChange={(e) => setF({ ...f, active: e.target.checked ? 1 : 0 })}
            />
            <span>Enabled</span>
          </label>
        </Field>
      )}
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

export default function Integrations() {
  const [s, reload] = useResource(() => apiGet("/integrations"), []);
  const [modal, setModal] = useState(null);

  async function del(id) {
    if (!window.confirm("Delete this integration?")) return;
    try {
      await apiDel("/integrations/" + id);
      toast("Deleted");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      <div className="row">
        <h2 style={{ margin: 0 }}>🔌 Integrations</h2>
        <button
          className="btn btn-primary"
          style={{ marginLeft: "auto" }}
          onClick={() => setModal({})}
        >
          + Add Integration
        </button>
      </div>
      <LoadTable
        state={s}
        cols={["Platform", "Account", "Status", "Token", "ID", "Actions"]}
        emptyText="No integrations yet"
        renderRow={(r) => (
          <tr key={r.id}>
            <td>
              <Badge color={platformColor(r.platform)}>{r.platform}</Badge>
            </td>
            <td>{r.account}</td>
            <td>
              <Badge color={r.active ? "green" : "red"}>
                {r.active ? "Active" : "Inactive"}
              </Badge>
            </td>
            <td className="mono truncate">
              {r.token ? r.token.slice(0, 16) + "…" : "—"}
            </td>
            <td
              className="mono"
              style={{ fontSize: 11, color: "var(--muted)" }}
            >
              {shortId(r.id)}
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
          title={modal.id ? "Edit Integration" : "Add Integration"}
          onClose={() => setModal(null)}
        >
          <IntegrationForm
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
