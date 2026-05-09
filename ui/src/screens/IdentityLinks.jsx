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
    conversation_ids: [],
  });
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const identities = useMemo(() => {
    return Array.from(new Set(existingLinks.map((l) => l.identity_id)));
  }, [existingLinks]);

  const filteredConvs = useMemo(() => {
    const s = search.toLowerCase();
    const linkedIds = existingLinks.map((l) => l.conversation_id);
    return conversations.filter((c) => {
      if (f.integration_id && c.integration_id !== f.integration_id)
        return false;
      if (linkedIds.includes(c.id)) return false;
      return (
        c.title?.toLowerCase().includes(s) ||
        c.external_id?.toLowerCase().includes(s)
      );
    });
  }, [conversations, search, existingLinks, f.integration_id]);

  async function save() {
    if (!f.identity_id || f.conversation_ids.length === 0) {
      setErr("Please provide an Identity ID and select at least one conversation.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      for (const convId of f.conversation_ids) {
        await apiPost("/identity-links", {
          identity_id: f.identity_id,
          conversation_id: convId,
        });
      }
      onSave();
    } catch (e) {
      setErr(e.message);
    }
    setSaving(false);
  }

  function toggleConv(id) {
    if (f.conversation_ids.includes(id)) {
      setF({
        ...f,
        conversation_ids: f.conversation_ids.filter((x) => x !== id),
      });
    } else {
      setF({ ...f, conversation_ids: [...f.conversation_ids, id] });
    }
  }

  function toggleAll() {
    if (f.conversation_ids.length === filteredConvs.length) {
      setF({ ...f, conversation_ids: [] });
    } else {
      setF({ ...f, conversation_ids: filteredConvs.map((c) => c.id) });
    }
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

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Field label="Filter by Integration">
            <select
              value={f.integration_id}
              onChange={(e) =>
                setF({
                  ...f,
                  integration_id: e.target.value,
                })
              }
            >
              <option value="">All Integrations</option>
              {integrations.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.platform} · {i.account}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Search Conversation">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title or ID…"
            />
          </Field>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {filteredConvs.length} available · {f.conversation_ids.length} selected
        </span>
        {filteredConvs.length > 0 && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={toggleAll}
            type="button"
          >
            {f.conversation_ids.length === filteredConvs.length
              ? "Deselect All"
              : "Select All Filtered"}
          </button>
        )}
      </div>

      <div
        style={{
          maxHeight: 250,
          overflowY: "auto",
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        {filteredConvs.length === 0 ? (
          <div
            style={{
              padding: 24,
              color: "var(--muted)",
              textAlign: "center",
            }}
          >
            No unlinked conversations found
          </div>
        ) : (
          filteredConvs.map((c) => (
            <div
              key={c.id}
              onClick={() => toggleConv(c.id)}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                backgroundColor: f.conversation_ids.includes(c.id)
                  ? "var(--bg-hover)"
                  : "transparent",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <input
                type="checkbox"
                checked={f.conversation_ids.includes(c.id)}
                readOnly
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>
                  {c.title || "Untitled"}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--accent)' }}>{c.platform}</span>
                  <span>{c.external_id}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner /> : null} Create {f.conversation_ids.length > 1 ? `${f.conversation_ids.length} Mappings` : 'Mapping'}
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
