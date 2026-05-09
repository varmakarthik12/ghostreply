import { useState, useMemo } from "react";
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

function LinkForm({ onSave, onCancel, existingLinks, conversations, integrations }) {
  const [f, setF] = useState({
    identity_id: "",
    integration_id: "",
    conversation_id: "",
  });
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const identities = useMemo(() => {
    return Array.from(new Set(existingLinks.map((l) => l.identity_id)));
  }, [existingLinks]);

  const filteredConvs = useMemo(() => {
    if (!f.integration_id) return [];
    const s = search.toLowerCase();
    // Filter out conversations already linked
    const linkedIds = existingLinks.map((l) => l.conversation_id);
    return conversations.filter((c) => {
      if (c.integration_id !== f.integration_id) return false;
      if (linkedIds.includes(c.id)) return false;
      return (
        c.title?.toLowerCase().includes(s) ||
        c.external_id?.toLowerCase().includes(s)
      );
    });
  }, [conversations, search, existingLinks, f.integration_id]);

  async function save() {
    if (!f.identity_id || !f.conversation_id) {
      setErr("Please provide an Identity ID and select a conversation.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await apiPost("/identity-links", {
        identity_id: f.identity_id,
        conversation_id: f.conversation_id,
      });
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
      <Field label="Identity Name (e.g. 'John Doe')">
        <input
          list="identity-suggestions"
          value={f.identity_id}
          onChange={(e) => setF({ ...f, identity_id: e.target.value })}
          placeholder="Type to create or select…"
        />
        <datalist id="identity-suggestions">
          {identities.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
      </Field>

      <Field label="Select Integration">
        <select
          value={f.integration_id}
          onChange={(e) =>
            setF({ ...f, integration_id: e.target.value, conversation_id: "" })
          }
        >
          <option value="">Choose an integration…</option>
          {integrations.map((i) => (
            <option key={i.id} value={i.id}>
              {i.platform} · {i.account}
            </option>
          ))}
        </select>
      </Field>

      {f.integration_id && (
        <>
          <Field label="Search Conversation">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by title or external ID…"
            />
          </Field>

          <div
            style={{
              maxHeight: 200,
              overflowY: "auto",
              border: "1px solid var(--border)",
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            {filteredConvs.length === 0 ? (
              <div
                style={{
                  padding: 12,
                  color: "var(--muted)",
                  textAlign: "center",
                }}
              >
                No unlinked conversations in this integration
              </div>
            ) : (
              filteredConvs.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setF({ ...f, conversation_id: c.id })}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    backgroundColor:
                      f.conversation_id === c.id
                        ? "var(--bg-hover)"
                        : "transparent",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <input
                    type="radio"
                    checked={f.conversation_id === c.id}
                    readOnly
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>
                      {c.title || "Untitled"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {c.external_id}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner /> : null} Create Mapping
        </button>
      </div>
    </>
  );
}

export default function IdentityLinks() {
  const [s, reload] = useResource(() => apiGet("/identity-links"), []);
  const [convS] = useResource(() => apiGet("/conversations"), []);
  const [intS] = useResource(() => apiGet("/integrations"), []);
  const [modal, setModal] = useState(false);

  async function del(id) {
    if (!window.confirm("Remove this mapping?")) return;
    try {
      await apiDel("/identity-links/" + id);
      toast("Removed Mapping");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      <div className="row">
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>🔗 Unified Identities</h2>
          <p style={{ margin: "4px 0 0 0", color: "var(--muted)", fontSize: 14 }}>
            Map multiple conversations to a single identity for shared cross-platform memory.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setModal(true)}
          disabled={convS.loading || intS.loading}
        >
          + Link Conversation
        </button>
      </div>

      <LoadTable
        state={s}
        cols={["Identity ID", "Conversation", "Platform", "ID", "Action"]}
        emptyText="No linked identities yet"
        renderRow={(r) => (
          <tr key={r.id}>
            <td>
              <Badge color="accent">{r.identity_id}</Badge>
            </td>
            <td>
              <div style={{ fontWeight: 600 }}>{r.title || "Untitled"}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {r.external_id}
              </div>
            </td>
            <td>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge color={platformColor(r.platform)}>{r.platform}</Badge>
                <span style={{ fontSize: 12 }}>{r.account}</span>
              </div>
            </td>
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
                Unlink
              </button>
            </td>
          </tr>
        )}
      />

      {modal && (
        <Modal title="Link a Conversation" onClose={() => setModal(false)}>
          <LinkForm
            conversations={convS.data || []}
            integrations={intS.data || []}
            existingLinks={s.data || []}
            onSave={() => {
              setModal(false);
              toast("Linked");
              reload();
            }}
            onCancel={() => setModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}
