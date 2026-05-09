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

function LinkForm({ onSave, onCancel, existingLinks, conversations, integrations, initialIdentity = "" }) {
  const [f, setF] = useState({
    identity_id: initialIdentity,
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
    // Filter out conversations already linked to ANY identity
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
          disabled={!!initialIdentity}
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
          {saving ? <Spinner /> : null} {initialIdentity ? 'Add to Identity' : 'Create Identity'}
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
  const [editIdentity, setEditIdentity] = useState(null);

  const grouped = useMemo(() => {
    const data = s.data || [];
    const groups = {};
    data.forEach((l) => {
      if (!groups[l.identity_id]) groups[l.identity_id] = [];
      groups[l.identity_id].push(l);
    });
    return Object.keys(groups).map((id) => ({
      identity_id: id,
      links: groups[id],
    }));
  }, [s.data]);

  async function unlink(linkId) {
    if (!window.confirm("Unlink this conversation?")) return;
    try {
      await apiDel("/identity-links/" + linkId);
      toast("Unlinked");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function deleteIdentity(identityId, links) {
    if (!window.confirm(`Delete entire identity "${identityId}" and all its ${links.length} links?`)) return;
    try {
      for (const l of links) {
        await apiDel("/identity-links/" + l.id);
      }
      toast("Identity Deleted");
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
            Manage shared memory across different platforms for your contacts.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditIdentity(null);
            setModal(true);
          }}
          disabled={convS.loading || intS.loading}
        >
          + New Identity
        </button>
      </div>

      <LoadTable
        state={{ ...s, data: grouped }}
        cols={["Identity Name", "Linked Conversations", "Actions"]}
        emptyText="No linked identities yet"
        renderRow={(g) => (
          <tr key={g.identity_id}>
            <td style={{ verticalAlign: 'top', paddingTop: 16 }}>
              <Badge color="accent" lg>{g.identity_id}</Badge>
            </td>
            <td>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
                {g.links.map(l => (
                  <div key={l.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 12, 
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8
                  }}>
                    <Badge color={platformColor(l.platform)}>{l.platform}</Badge>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{l.title || "Untitled"}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{l.account} · {l.external_id}</div>
                    </div>
                    <button className="btn btn-sm" onClick={() => unlink(l.id)} title="Unlink">✕</button>
                  </div>
                ))}
              </div>
            </td>
            <td style={{ verticalAlign: 'top', paddingTop: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setEditIdentity(g.identity_id);
                    setModal(true);
                  }}
                >
                  Add More
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => deleteIdentity(g.identity_id, g.links)}
                >
                  Delete Identity
                </button>
              </div>
            </td>
          </tr>
        )}
      />

      {modal && (
        <Modal title={editIdentity ? `Manage "${editIdentity}"` : "Create New Identity"} onClose={() => setModal(false)}>
          <LinkForm
            initialIdentity={editIdentity || ""}
            conversations={convS.data || []}
            integrations={intS.data || []}
            existingLinks={s.data || []}
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
