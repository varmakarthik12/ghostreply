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
  Eye,
  Columns,
  Maximize2,
} from "lucide-react";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Field from "../components/Field";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Spinner from "../components/Spinner";
import MarkdownView from "../components/MarkdownView";
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
  const [editorTab, setEditorTab] = useState("split"); // "edit" | "preview" | "split"
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
                <option value="global">Global (All Integrations & Conversations)</option>
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

      {/* ── Editor Toolbar & View Switcher ── */}
      <div className="flex-row-between" style={{ marginBottom: 8 }}>
        <label className="form-label" style={{ margin: 0 }}>
          <span>Persona Instructions (System Prompt)</span>
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            <strong>{words}</strong> words · <strong>{chars}</strong> chars · <Badge color="primary">~{estTokens} tokens</Badge>
          </span>

          <div
            style={{
              display: "flex",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 2,
            }}
          >
            <button
              type="button"
              className={`btn btn-xs ${editorTab === "edit" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setEditorTab("edit")}
              title="Edit Raw Markdown"
            >
              <Code size={13} />
              <span>Edit</span>
            </button>
            <button
              type="button"
              className={`btn btn-xs ${editorTab === "split" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setEditorTab("split")}
              title="Side-by-side Live Split"
            >
              <Columns size={13} />
              <span>Split</span>
            </button>
            <button
              type="button"
              className={`btn btn-xs ${editorTab === "preview" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setEditorTab("preview")}
              title="Rendered Markdown Preview"
            >
              <Eye size={13} />
              <span>Preview</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Spacious Studio Editor / Preview Canvas ── */}
      {editorTab === "split" ? (
        <div className="split-editor-grid" style={{ marginBottom: 16 }}>
          <div>
            <textarea
              value={f.text}
              onChange={(e) => setF({ ...f, text: e.target.value })}
              placeholder="You are Alex, a 28-year-old friend texting on mobile. Use casual phrasing..."
              style={{
                height: 460,
                width: "100%",
                fontFamily: '"JetBrains Mono", Consolas, monospace',
                fontSize: 13,
                lineHeight: 1.6,
                padding: "16px 18px",
                resize: "vertical",
              }}
            />
          </div>

          <div
            style={{
              height: 460,
              overflowY: "auto",
              background: "rgba(0, 0, 0, 0.35)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "18px 22px",
            }}
          >
            {f.text.trim() ? (
              <MarkdownView content={f.text} />
            ) : (
              <div style={{ color: "var(--text-subtle)", fontStyle: "italic", fontSize: 13 }}>
                Live rendered preview will appear here as you type...
              </div>
            )}
          </div>
        </div>
      ) : editorTab === "preview" ? (
        <div
          style={{
            minHeight: 460,
            maxHeight: 600,
            overflowY: "auto",
            background: "rgba(0, 0, 0, 0.35)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "24px 28px",
            marginBottom: 16,
          }}
        >
          {f.text.trim() ? (
            <MarkdownView content={f.text} />
          ) : (
            <div style={{ color: "var(--text-subtle)", fontStyle: "italic", fontSize: 13 }}>
              No system prompt text entered yet.
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <textarea
            value={f.text}
            onChange={(e) => setF({ ...f, text: e.target.value })}
            placeholder="You are Alex, a 28-year-old friend texting on mobile. Use casual phrasing..."
            style={{
              height: 460,
              width: "100%",
              fontFamily: '"JetBrains Mono", Consolas, monospace',
              fontSize: 13.5,
              lineHeight: 1.65,
              padding: "18px 20px",
              resize: "vertical",
            }}
          />
        </div>
      )}

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
        💡 <strong>Pro Tip:</strong> Use Markdown headings (`##`, `###`), bullet points (`-`), and bold tags (`**text**`) to organize persona instructions clearly.
      </div>

      <div className="modal-footer-bar" style={{ padding: "20px 0 0", background: "none", borderTop: "1px solid var(--border)", marginTop: 20 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving && <Spinner />}
          {init?.id ? "Save Persona Changes" : "Create Persona"}
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
  const [copiedId, setCopiedId] = useState(null);
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

  const handleCopyText = (text, id) => {
    copyToClipboard(text);
    setCopiedId(id);
    toast("Persona markdown copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

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
        <div style={{ maxWidth: 520, color: "var(--text-main)", fontStyle: "italic", lineHeight: 1.4 }}>
          "{r.text.slice(0, 120)}{r.text.length > 120 ? "…" : ""}"
        </div>
      ),
    },
    {
      header: "Estimated Tokens",
      key: "tokens",
      width: 140,
      render: (r) => {
        const estTokens = Math.ceil(r.text.length / 4);
        return <Badge color="primary">~{estTokens.toLocaleString()} tokens</Badge>;
      },
    },
    {
      header: "Actions",
      cellStyle: { textAlign: "right" },
      render: (r) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => handleCopyText(r.text, r.id)}
            title="Copy Persona Markdown"
          >
            {copiedId === r.id ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => setModal(r)}
            title="Edit Persona"
          >
            <Edit2 size={13} />
            <span>Edit</span>
          </button>
          <button
            className="btn btn-danger btn-xs"
            onClick={() => setDeleteConfirm(r)}
            title="Delete Persona"
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
            <span>System Prompts & Personas Studio</span>
          </h1>
          <p className="card-subtitle">
            Configure system prompts, backstory personas, texting habits, and linguistic guidelines across scopes.
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
              title="Spacious Cards View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              className={`btn btn-sm ${viewMode === "table" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("table")}
              style={{ borderRadius: "var(--radius-sm)", padding: "4px 8px" }}
              title="Table View"
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
        /* ── Spacious Grid View ── */
        <div>
          {s.loading ? (
            <div className="persona-cards-grid">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="glass-card" style={{ height: 320 }}>
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
            <div className="persona-cards-grid">
              {prompts.map((p) => {
                const words = p.text.trim() ? p.text.trim().split(/\s+/).length : 0;
                const chars = p.text.length;
                const estTokens = Math.ceil(chars / 4);

                return (
                  <div
                    key={p.id}
                    className="glass-card glass-card-interactive"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      padding: 24,
                      marginBottom: 0,
                    }}
                  >
                    <div className="flex-row-between" style={{ marginBottom: 16 }}>
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
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleCopyText(p.text, p.id)}
                          title="Copy Persona Markdown"
                        >
                          {copiedId === p.id ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                        </button>
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => setModal(p)}
                          title="Edit Persona"
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
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

                    {/* Spacious Rendered Markdown Body */}
                    <div
                      style={{
                        background: "rgba(0, 0, 0, 0.3)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                        padding: "18px 22px",
                        flex: 1,
                        minHeight: 200,
                        maxHeight: 520,
                        overflowY: "auto",
                      }}
                    >
                      <MarkdownView content={p.text} />
                    </div>

                    <div className="flex-row-between" style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {words} words · {chars} chars
                      </span>
                      <Badge color="primary">~{estTokens.toLocaleString()} tokens</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Create / Edit Full-Width Modal Studio ── */}
      {modal && (
        <Modal
          title={modal.id ? "Edit System Prompt Persona" : "Create System Prompt Persona"}
          subtitle="Define how GhostReply talks, behaves, and reasons with live Markdown preview"
          onClose={() => setModal(null)}
          fullWidth
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
