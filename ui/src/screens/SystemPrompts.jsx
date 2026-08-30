import React, { useState } from "react";
import {
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Check,
  LayoutGrid,
  List,
  Layers,
  HelpCircle,
  Code,
  Sliders,
} from "lucide-react";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Field from "../components/Field";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Spinner from "../components/Spinner";
import { apiDel, apiGet, apiPost, apiPut } from "../lib/api";
import { useResource } from "../lib/hooks";
import { toast } from "../lib/toast";
import { scopeColor, shortId, copyToClipboard } from "../lib/utils";

const PERSONA_TEMPLATES = [
  {
    title: "Casual & Authentic",
    desc: "Natural, lowercase texting style without revealing AI nature.",
    text: `You are Alex, a 28-year-old friend texting on mobile.
- Keep replies brief, natural, and conversational (1-3 sentences).
- Use casual phrasing, occasional lowercase, and common abbreviations (tbh, idr, haha, lol).
- Never reveal or mention that you are an AI or language model.
- Answer questions directly like a real person.`,
  },
  {
    title: "Professional Executive",
    desc: "Concise, articulate, and action-oriented tone.",
    text: `You are an executive assistant acting on behalf of the user.
- Communicate with utmost clarity, professional polish, and brevity.
- Focus on action items, direct answers, and next steps.
- Maintain a respectful, confident, and polite tone at all times.`,
  },
  {
    title: "Support Specialist",
    desc: "Helpful, empathetic, and solution-focused customer support.",
    text: `You are a friendly customer success specialist.
- Greet customers warmly and acknowledge their questions with empathy.
- Provide step-by-step guidance and confirm if their issue has been resolved.
- Maintain a warm, encouraging, and patient tone.`,
  },
  {
    title: "Humorous & Witty",
    desc: "Playful banter, clever jokes, and lively texting personality.",
    text: `You are a witty, charismatic friend who loves lighthearted banter and clever comebacks.
- Match the user's energy and joke around when appropriate.
- Keep replies punchy, humorous, and entertaining.`,
  },
];

function PromptForm({ init, integrations, onSave, onCancel }) {
  const [f, setF] = useState({
    scope: "global",
    scope_id: "",
    text: "",
    ...init,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const words = f.text.trim() ? f.text.trim().split(/\s+/).length : 0;
  const chars = f.text.length;
  const estTokens = Math.ceil(chars / 4);

  const applyTemplate = (tpl) => {
    setF((prev) => ({ ...prev, text: tpl.text }));
    toast(`Applied "${tpl.title}" template`);
  };

  async function save() {
    if (!f.text.trim()) {
      setErr("System prompt persona text is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      if (init?.id) {
        await apiPut("/system-prompts/" + init.id, { text: f.text });
      } else {
        await apiPost("/system-prompts", f);
      }
      onSave();
    } catch (e) {
      setErr(e.message);
    }
    setSaving(false);
  }

  return (
    <>
      {err && (
        <Alert type="error" onClose={() => setErr("")} style={{ marginBottom: 16 }}>
          {err}
        </Alert>
      )}

      {/* ── Scope Settings (Only for New) ── */}
      {!init?.id && (
        <div style={{ marginBottom: 16 }}>
          <div className="grid-2">
            <Field label="Scope Level" required hint="Where this persona applies">
              <select
                value={f.scope}
                onChange={(e) => setF({ ...f, scope: e.target.value, scope_id: "" })}
              >
                <option value="global">Global (All Integrations)</option>
                <option value="integration">Specific Integration (e.g. Telegram Bot)</option>
                <option value="conversation">Specific Conversation Thread</option>
              </select>
            </Field>

            {f.scope === "integration" && (
              <Field label="Target Integration" required>
                <select
                  value={f.scope_id}
                  onChange={(e) => setF({ ...f, scope_id: e.target.value })}
                >
                  <option value="">— Select Integration —</option>
                  {integrations.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.platform} · {i.account}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {f.scope === "conversation" && (
              <Field label="Conversation UUID" required>
                <input
                  type="text"
                  value={f.scope_id}
                  onChange={(e) => setF({ ...f, scope_id: e.target.value })}
                  placeholder="Paste conversation UUID"
                />
              </Field>
            )}
          </div>
        </div>
      )}

      {/* ── Pre-built Templates ── */}
      <div style={{ marginBottom: 16 }}>
        <label className="form-label" style={{ marginBottom: 8 }}>
          <span>Insert Persona Template</span>
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PERSONA_TEMPLATES.map((tpl) => (
            <button
              key={tpl.title}
              type="button"
              className="btn btn-xs btn-secondary"
              onClick={() => applyTemplate(tpl)}
              title={tpl.desc}
            >
              <Sparkles size={12} color="var(--primary)" />
              <span>{tpl.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Persona Textarea ── */}
      <Field
        label="Persona Instructions (System Prompt)"
        required
        hint={`${words} words · ${chars} chars · ~${estTokens} tokens`}
      >
        <textarea
          value={f.text}
          onChange={(e) => setF({ ...f, text: e.target.value })}
          placeholder="You are Alex, a 28-year-old software engineer. You are casual, use abbreviations, reply briefly. Do not reveal you are an AI."
          style={{ minHeight: 180, fontFamily: "inherit" }}
        />
      </Field>

      <div
        style={{
          padding: 12,
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          fontSize: 12,
          color: "var(--text-muted)",
          lineHeight: 1.5,
        }}
      >
        💡 <strong>Pro Tip:</strong> Write in the first or second person. Define tone, message length (e.g. 1-2 sentences), slang/vocabulary to use, and topics to avoid.
      </div>

      <div className="modal-footer-bar" style={{ padding: "20px 0 0", background: "none", borderTop: "1px solid var(--border)", marginTop: 20 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving && <Spinner />}
          {init?.id ? "Save Persona" : "Create Persona"}
        </button>
      </div>
    </>
  );
}

export default function SystemPrompts() {
  const [s, reload] = useResource(() => apiGet("/system-prompts"), []);
  const [intS] = useResource(() => apiGet("/integrations"), []);
  const [modal, setModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewMode, setViewMode] = useState("grid"); // grid | table

  const integrations = intS.data || [];
  const prompts = s.data || [];

  async function handleDelete() {
    if (!deleteConfirm) return;
    try {
      await apiDel("/system-prompts/" + deleteConfirm.id);
      toast("Persona prompt deleted");
      setDeleteConfirm(null);
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  const columns = [
    {
      header: "Scope",
      key: "scope",
      render: (r) => <Badge color={scopeColor(r.scope)} lg>{r.scope}</Badge>,
    },
    {
      header: "Scope ID",
      key: "scope_id",
      render: (r) => (
        <span className="mono" style={{ fontSize: 11, color: "var(--text-subtle)" }}>
          {r.scope_id ? shortId(r.scope_id) : "Global Default"}
        </span>
      ),
    },
    {
      header: "Persona Preview",
      key: "text",
      render: (r) => (
        <div style={{ maxWidth: 450, color: "var(--text-main)", fontStyle: "italic", lineHeight: 1.4 }}>
          "{r.text.slice(0, 100)}{r.text.length > 100 ? "…" : ""}"
        </div>
      ),
    },
    {
      header: "Actions",
      cellStyle: { textAlign: "right" },
      render: (r) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => setModal(r)}
            title="Edit Prompt"
          >
            <Edit2 size={13} />
          </button>
          <button
            className="btn btn-danger btn-xs"
            onClick={() => setDeleteConfirm(r)}
            title="Delete Prompt"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Page Header ── */}
      <div className="flex-row-between">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={24} color="var(--primary)" />
            <span>Persona System Prompts</span>
          </h1>
          <p className="card-subtitle">
            Configure how your AI speaks, behaves, and stays in character across conversations.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 3,
            }}
          >
            <button
              className={`btn btn-sm ${viewMode === "grid" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("grid")}
              style={{ borderRadius: "var(--radius-sm)", padding: "4px 8px" }}
              title="Card Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              className={`btn btn-sm ${viewMode === "table" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("table")}
              style={{ borderRadius: "var(--radius-sm)", padding: "4px 8px" }}
              title="Data Table View"
            >
              <List size={15} />
            </button>
          </div>

          <button className="btn btn-primary" onClick={() => setModal({})}>
            <Plus size={16} />
            <span>Create Persona</span>
          </button>
        </div>
      </div>

      {/* ── Content View ── */}
      {viewMode === "table" ? (
        <DataTable
          columns={columns}
          data={prompts}
          loading={s.loading}
          error={s.error}
          searchPlaceholder="Search personas by text or scope…"
          searchKeys={["text", "scope", "scope_id"]}
          emptyTitle="No system prompts defined"
          emptyDescription="Create your first persona system prompt to customize how the assistant replies."
          emptyAction={
            <button className="btn btn-primary btn-sm" onClick={() => setModal({})}>
              <Plus size={14} /> Add Persona Prompt
            </button>
          }
        />
      ) : (
        /* ── Grid View ── */
        <div>
          {s.loading ? (
            <div className="grid-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="glass-card" style={{ height: 200 }}>
                  <div className="skeleton" style={{ width: "30%", height: 20, marginBottom: 16 }} />
                  <div className="skeleton" style={{ width: "100%", height: 16, marginBottom: 8 }} />
                  <div className="skeleton" style={{ width: "80%", height: 16 }} />
                </div>
              ))}
            </div>
          ) : prompts.length === 0 ? (
            <div className="glass-card" style={{ padding: "56px 24px", textAlign: "center" }}>
              <div className="empty-state-box">
                <div className="empty-state-icon">
                  <Sparkles size={28} />
                </div>
                <div className="empty-state-title">No personas configured yet</div>
                <div className="empty-state-desc">
                  Define custom system prompts to instruct the AI on its tone, identity, and texting habits.
                </div>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setModal({})}>
                  <Plus size={14} /> Create Persona
                </button>
              </div>
            </div>
          ) : (
            <div className="grid-2">
              {prompts.map((p) => (
                <div
                  key={p.id}
                  className="glass-card glass-card-interactive"
                  style={{ display: "flex", flexDirection: "column" }}
                >
                  <div className="flex-row-between" style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge color={scopeColor(p.scope)} lg>
                        {p.scope}
                      </Badge>
                      {p.scope_id && (
                        <span className="mono" style={{ fontSize: 11, color: "var(--text-subtle)" }}>
                          ID: {shortId(p.scope_id)}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => setModal(p)}
                        title="Edit Persona"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="btn btn-danger btn-xs"
                        onClick={() => setDeleteConfirm(p)}
                        title="Delete Persona"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(0,0,0,0.25)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      padding: "14px 16px",
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: "var(--text-main)",
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                      flex: 1,
                    }}
                  >
                    {p.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {modal && (
        <Modal
          title={modal.id ? "Edit System Prompt Persona" : "Create System Prompt Persona"}
          subtitle="Define how GhostReply talks, behaves, and reasons"
          onClose={() => setModal(null)}
          wide
        >
          <PromptForm
            init={modal}
            integrations={integrations}
            onSave={() => {
              setModal(null);
              toast("Persona prompt saved successfully");
              reload();
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {/* ── Confirm Delete Dialog ── */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Persona Prompt"
        message={`Are you sure you want to delete this ${deleteConfirm?.scope} system prompt? Fallback global prompts will take effect instead.`}
        confirmText="Delete Prompt"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
