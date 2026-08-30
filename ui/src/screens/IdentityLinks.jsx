import React, { useState, useMemo } from "react";
import {
  Link2,
  Plus,
  Trash2,
  X,
  User,
  Search,
  Filter,
  Check,
  Globe,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Field from "../components/Field";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
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
    const linkedIds = existingLinks.map((l) => l.conversation_id);
    return conversations.filter((c) => {
      if (f.integration_id && c.integration_id !== f.integration_id) return false;
      if (linkedIds.includes(c.id)) return false;
      return (
        c.title?.toLowerCase().includes(s) ||
        c.external_id?.toLowerCase().includes(s)
      );
    });
  }, [conversations, search, existingLinks, f.integration_id]);

  async function save() {
    if (!f.identity_id.trim() || f.conversation_ids.length === 0) {
      setErr("Please provide an Identity Contact Name and select at least one conversation.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      for (const convId of f.conversation_ids) {
        await apiPost("/identity-links", {
          identity_id: f.identity_id.trim(),
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
      setF({ ...f, conversation_ids: f.conversation_ids.filter((x) => x !== id) });
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
        <Alert type="error" onClose={() => setErr("")} style={{ marginBottom: 16 }}>
          {err}
        </Alert>
      )}

      <Field label="Contact Identity Name" required hint="e.g. John Doe, Sarah Tech">
        <input
          list="identity-suggestions"
          type="text"
          value={f.identity_id}
          onChange={(e) => setF({ ...f, identity_id: e.target.value })}
          placeholder="Enter or select contact name…"
          disabled={!!initialIdentity}
        />
        <datalist id="identity-suggestions">
          {identities.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
      </Field>

      <div className="grid-2" style={{ marginBottom: 14 }}>
        <Field label="Filter by Integration">
          <select
            value={f.integration_id}
            onChange={(e) => setF({ ...f, integration_id: e.target.value })}
          >
            <option value="">All Integrations</option>
            {integrations.map((i) => (
              <option key={i.id} value={i.id}>
                {i.platform} · {i.account}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Search Conversations">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or ID…"
          />
        </Field>
      </div>

      <div className="flex-row-between" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {filteredConvs.length} available · <strong>{f.conversation_ids.length}</strong> selected
        </span>
        {filteredConvs.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={toggleAll}
          >
            {f.conversation_ids.length === filteredConvs.length ? "Deselect All" : "Select All Filtered"}
          </button>
        )}
      </div>

      <div
        style={{
          maxHeight: 240,
          overflowY: "auto",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          background: "rgba(0,0,0,0.2)",
          marginBottom: 20,
        }}
      >
        {filteredConvs.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No unlinked conversations found matching criteria.
          </div>
        ) : (
          filteredConvs.map((c) => {
            const isChecked = f.conversation_ids.includes(c.id);
            return (
              <div
                key={c.id}
                onClick={() => toggleConv(c.id)}
                style={{
                  padding: "10px 14px",
                  cursor: "pointer",
                  background: isChecked ? "rgba(99, 102, 241, 0.12)" : "transparent",
                  borderBottom: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <input type="checkbox" checked={isChecked} readOnly style={{ cursor: "pointer" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-main)" }}>
                    {c.title || "Untitled Conversation"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 8 }}>
                    <Badge color={platformColor(c.platform)}>{c.platform}</Badge>
                    <span className="mono">{c.external_id}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="modal-footer-bar" style={{ padding: "20px 0 0", background: "none", borderTop: "1px solid var(--border)" }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving && <Spinner />}
          {initialIdentity ? "Add Channels to Identity" : "Create Unified Identity"}
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
  const [unlinkConfirm, setUnlinkConfirm] = useState(null);
  const [deleteIdentityConfirm, setDeleteIdentityConfirm] = useState(null);

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

  async function handleUnlink() {
    if (!unlinkConfirm) return;
    try {
      await apiDel("/identity-links/" + unlinkConfirm.id);
      toast("Conversation unlinked from identity");
      setUnlinkConfirm(null);
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function handleDeleteIdentity() {
    if (!deleteIdentityConfirm) return;
    try {
      for (const l of deleteIdentityConfirm.links) {
        await apiDel("/identity-links/" + l.id);
      }
      toast(`Identity "${deleteIdentityConfirm.identity_id}" deleted`);
      setDeleteIdentityConfirm(null);
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Page Header ── */}
      <div className="flex-row-between">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link2 size={24} color="var(--primary)" />
            <span>Unified Cross-Platform Identities</span>
          </h1>
          <p className="card-subtitle">
            Link contacts across Telegram, WhatsApp, and SMS into unified personas with shared aggregate memory.
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
          <Plus size={16} />
          <span>New Identity</span>
        </button>
      </div>

      {/* ── Identity Cards ── */}
      {s.loading ? (
        <div className="grid-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="glass-card" style={{ height: 180 }}>
              <div className="skeleton" style={{ width: "40%", height: 22, marginBottom: 16 }} />
              <div className="skeleton" style={{ width: "90%", height: 36, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: "70%", height: 36 }} />
            </div>
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="glass-card" style={{ padding: "56px 24px", textAlign: "center" }}>
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <Link2 size={28} />
            </div>
            <div className="empty-state-title">No unified identities linked yet</div>
            <div className="empty-state-desc">
              Link conversations across different messaging platforms to a single person so GhostReply remembers your shared context regardless of which channel they use.
            </div>
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => {
                setEditIdentity(null);
                setModal(true);
              }}
            >
              <Plus size={14} /> Link First Contact
            </button>
          </div>
        </div>
      ) : (
        <div className="grid-2">
          {grouped.map((g) => (
            <div key={g.identity_id} className="glass-card glass-card-interactive" style={{ padding: 20, marginBottom: 0 }}>
              <div className="flex-row-between" style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "var(--radius-full)",
                      background: "linear-gradient(135deg, #6366f1 0%, #38bdf8 100%)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    {g.identity_id[0].toUpperCase()}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, color: "var(--text-main)" }}>{g.identity_id}</h3>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {g.links.length} connected messaging {g.links.length === 1 ? "channel" : "channels"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      setEditIdentity(g.identity_id);
                      setModal(true);
                    }}
                    title="Add More Channels"
                  >
                    <Plus size={13} />
                    <span>Add</span>
                  </button>
                  <button
                    className="btn btn-danger btn-xs"
                    onClick={() => setDeleteIdentityConfirm(g)}
                    title="Delete Identity"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Linked Channel Pills */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {g.links.map((l) => (
                  <div
                    key={l.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      background: "rgba(0, 0, 0, 0.2)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <Badge color={platformColor(l.platform)}>{l.platform}</Badge>
                      <div className="truncate-text">
                        <strong style={{ fontSize: 13, color: "var(--text-main)" }}>
                          {l.title || "Untitled"}
                        </strong>
                        <div className="mono" style={{ fontSize: 11, color: "var(--text-subtle)" }}>
                          {l.account} · {l.external_id}
                        </div>
                      </div>
                    </div>

                    <button
                      className="btn btn-ghost btn-icon-only btn-xs"
                      onClick={() => setUnlinkConfirm(l)}
                      title="Unlink this channel"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Link Modal ── */}
      {modal && (
        <Modal
          title={editIdentity ? `Add Channels to "${editIdentity}"` : "Create Unified Contact Identity"}
          subtitle="Aggregate cross-platform conversational memory for a person"
          onClose={() => setModal(false)}
          wide
        >
          <LinkForm
            initialIdentity={editIdentity || ""}
            conversations={convS.data || []}
            integrations={intS.data || []}
            existingLinks={s.data || []}
            onSave={() => {
              setModal(false);
              toast("Identity updated successfully");
              reload();
            }}
            onCancel={() => setModal(false)}
          />
        </Modal>
      )}

      {/* ── Confirm Unlink ── */}
      <ConfirmDialog
        isOpen={!!unlinkConfirm}
        title="Unlink Conversation Channel"
        message={`Are you sure you want to unlink "${unlinkConfirm?.title || unlinkConfirm?.external_id}" from this identity? Its memory will no longer be shared with other channels for this person.`}
        confirmText="Unlink Channel"
        onConfirm={handleUnlink}
        onCancel={() => setUnlinkConfirm(null)}
      />

      {/* ── Confirm Delete Identity ── */}
      <ConfirmDialog
        isOpen={!!deleteIdentityConfirm}
        title="Delete Entire Contact Identity"
        message={`Are you sure you want to delete the unified identity "${deleteIdentityConfirm?.identity_id}" and unlink all ${deleteIdentityConfirm?.links?.length} channels?`}
        confirmText="Delete Identity"
        onConfirm={handleDeleteIdentity}
        onCancel={() => setDeleteIdentityConfirm(null)}
      />
    </div>
  );
}
