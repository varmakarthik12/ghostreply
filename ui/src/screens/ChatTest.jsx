import React, { useEffect, useRef, useState } from "react";
import {
  FlaskConical,
  Send,
  Paperclip,
  Trash2,
  Image as ImageIcon,
  Mic,
  Video as VideoIcon,
  Bot,
  User,
  Sliders,
  Code,
  Sparkles,
  Clock,
  Zap,
  Info,
  Check,
  Copy,
  ChevronRight,
  Eye,
  X,
  Layers,
} from "lucide-react";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Field from "../components/Field";
import Drawer from "../components/Drawer";
import Spinner from "../components/Spinner";
import { apiGet, getToken } from "../lib/api";
import { useResource } from "../lib/hooks";
import { toast } from "../lib/toast";
import { copyToClipboard } from "../lib/utils";

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result.split(",")[1];
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AttachmentPreview({ file, objectUrl, onClear }) {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: "rgba(0,0,0,0.3)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {isImage ? (
        <img
          src={objectUrl}
          alt="attachment preview"
          style={{ width: 44, height: 44, objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
        />
      ) : isVideo ? (
        <video
          src={objectUrl}
          style={{ width: 56, height: 44, objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
        />
      ) : (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "var(--radius-sm)",
            background: "var(--success-subtle)",
            color: "var(--success)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Mic size={20} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="truncate-text" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-main)" }}>
          {file.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {file.type} · {(file.size / 1024).toFixed(1)} KB
        </div>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-icon-only btn-xs"
        onClick={onClear}
        title="Remove attachment"
        style={{ color: "var(--text-muted)" }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

function BubbleAttachment({ mediaType, mediaData }) {
  if (!mediaData || !mediaType) return null;
  const src = `data:${mediaType};base64,${mediaData}`;

  if (mediaType.startsWith("image/")) {
    return (
      <img
        src={src}
        alt="attachment"
        style={{
          display: "block",
          maxWidth: 220,
          maxHeight: 160,
          borderRadius: "var(--radius-md)",
          marginBottom: 6,
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      />
    );
  }
  if (mediaType.startsWith("video/")) {
    return (
      <video
        src={src}
        controls
        style={{
          display: "block",
          maxWidth: 240,
          maxHeight: 180,
          borderRadius: "var(--radius-md)",
          marginBottom: 6,
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      />
    );
  }
  if (mediaType.startsWith("audio/")) {
    return (
      <div style={{ marginBottom: 6 }}>
        <audio src={src} controls style={{ height: 28, maxWidth: 220 }} />
      </div>
    );
  }
  return null;
}

const PRESET_PROMPTS = [
  "Hey! What have you been up to today?",
  "Can you recommend a good place for lunch around here?",
  "Did we talk about that project deadline earlier?",
  "What's your plan for the upcoming weekend?",
];

export default function ChatTest() {
  const [intS] = useResource(() => apiGet("/integrations"), []);
  const [selInt, setSelInt] = useState("");
  const [chatId, setChatId] = useState("playground_user");
  const [senderName, setSenderName] = useState("Alex");
  const [chatType, setChatType] = useState("individual");
  const [msg, setMsg] = useState("");
  const [bubbles, setBubbles] = useState([]);
  const [sending, setSending] = useState(false);
  const [inspectorLog, setInspectorLog] = useState(null);

  // Attachments
  const [attachFile, setAttachFile] = useState(null);
  const [attachUrl, setAttachUrl] = useState(null);
  const [attachB64, setAttachB64] = useState(null);
  const fileInputRef = useRef(null);
  const chatBottomRef = useRef(null);

  const intList = intS.data || [];
  const selected = intList.find((i) => i.id === selInt);

  // Auto-select first integration if none selected
  useEffect(() => {
    if (!selInt && intList.length > 0) {
      setSelInt(intList[0].id);
    }
  }, [intList, selInt]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles]);

  useEffect(() => {
    return () => {
      if (attachUrl) URL.revokeObjectURL(attachUrl);
    };
  }, [attachUrl]);

  function clearAttachment() {
    if (attachUrl) URL.revokeObjectURL(attachUrl);
    setAttachFile(null);
    setAttachUrl(null);
    setAttachB64(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAttachFile(file);
    setAttachUrl(url);
    try {
      const b64 = await readFileAsBase64(file);
      setAttachB64(b64);
    } catch {
      setAttachB64(null);
    }
  }

  async function send(customText = null) {
    const textToSend = typeof customText === "string" ? customText : msg.trim();
    const hasMedia = !!(attachB64 && attachFile);
    if ((!textToSend && !hasMedia) || !selected || !chatId.trim()) return;

    setSending(true);
    const now = new Date();
    const time_iso = now.toISOString();
    const time_str = now.toLocaleTimeString();
    const msgId = "test_" + now.getTime();

    const sentMediaData = attachB64 || null;
    const sentMediaType = attachFile?.type || null;
    const sentText = textToSend || (hasMedia ? `[${attachFile.type.startsWith("image/") ? "Image" : attachFile.type.startsWith("video/") ? "Video Clip" : "Voice Note"}]` : "");

    setMsg("");
    clearAttachment();

    setBubbles((b) => [
      ...b,
      {
        id: msgId,
        type: "out",
        text: sentText,
        mediaData: sentMediaData,
        mediaType: sentMediaType,
        time: time_str,
        time_iso,
      },
    ]);

    const startTime = performance.now();

    try {
      const t = getToken();
      const endpoint = `/api/integrations/${selected.id}/conversations/${chatId}/auto-reply`;
      const body = {
        content: textToSend,
        sender_id: chatId.trim(),
        sender_name: senderName.trim(),
        chat_type: chatType,
        message_id: msgId,
        timestamp: time_iso,
        ...(sentMediaData && { media_data: sentMediaData, media_type: sentMediaType }),
        history: bubbles.map((b) => ({
          content: b.text,
          is_outbound: b.type === "in",
          sender_name: b.type === "in" ? "AI" : senderName,
          timestamp: b.time_iso || new Date().toISOString(),
          message_id: b.id.toString(),
        })),
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const latencyMs = Math.round(performance.now() - startTime);

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setBubbles((b) => [
        ...b,
        {
          id: "in_" + Date.now(),
          type: "in",
          text: data.reply,
          time: new Date().toLocaleTimeString(),
          time_iso: data.timestamp || new Date().toISOString(),
          raw: data,
          latencyMs,
        },
      ]);
    } catch (e) {
      setBubbles((b) => [
        ...b,
        {
          id: Date.now() + 1,
          type: "err",
          text: "Error: " + e.message,
          time: new Date().toLocaleTimeString(),
        },
      ]);
    }
    setSending(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Header ── */}
      <div className="flex-row-between">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FlaskConical size={24} color="var(--primary)" />
            <span>Chat Test & Multimodal Playground</span>
          </h1>
          <p className="card-subtitle">
            Simulate incoming user messages, test voice notes/images, and inspect live LLM reasoning.
          </p>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setBubbles([]);
            clearAttachment();
          }}
          disabled={bubbles.length === 0}
        >
          <Trash2 size={14} />
          <span>Clear Chat</span>
        </button>
      </div>

      {/* ── Studio Split-Screen Layout ── */}
      <div className="playground-split-layout">
        {/* ── Left Sidebar Controls ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="glass-card" style={{ padding: 18, marginBottom: 0 }}>
            <h3 style={{ fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <Sliders size={16} color="var(--primary)" />
              <span>Simulation Controls</span>
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Active Integration" required>
                <select value={selInt} onChange={(e) => setSelInt(e.target.value)}>
                  {intList.length === 0 && <option value="">No integrations configured</option>}
                  {intList.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.platform} · {i.account}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Recipient / External ID" required>
                <input
                  type="text"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="e.g. test_user_42"
                />
              </Field>

              <Field label="Sender Name">
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="e.g. Alex"
                />
              </Field>

              <Field label="Chat Type">
                <select value={chatType} onChange={(e) => setChatType(e.target.value)}>
                  <option value="individual">Individual (1-on-1 Direct Message)</option>
                  <option value="group">Group Chat</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Quick Prompts */}
          <div className="glass-card" style={{ padding: 18, marginBottom: 0 }}>
            <h4 style={{ fontSize: 13, marginBottom: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={14} color="var(--accent)" />
              <span>Quick Test Prompts</span>
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {PRESET_PROMPTS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="btn btn-ghost btn-xs"
                  style={{ textAlign: "left", justifyContent: "flex-start", padding: "6px 8px", fontSize: 12 }}
                  onClick={() => send(p)}
                  disabled={!selected || sending}
                >
                  <ChevronRight size={12} style={{ flexShrink: 0 }} />
                  <span className="truncate-text">{p}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right Chat Timeline ── */}
        <div
          className="glass-card"
          style={{
            padding: 0,
            display: "flex",
            flexDirection: "column",
            height: 600,
            overflow: "hidden",
            marginBottom: 0,
          }}
        >
          {/* Timeline Feed Area */}
          <div className="chat-bubble-stream">
            {bubbles.length === 0 ? (
              <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", padding: 48 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
                <strong style={{ display: "block", color: "var(--text-main)", fontSize: 15, marginBottom: 6 }}>
                  AI Chat Playground Ready
                </strong>
                <p style={{ maxWidth: 360, margin: "0 auto", fontSize: 13 }}>
                  Send a text message or attach an image / voice note below to test multimodal reasoning and persona voice.
                </p>
              </div>
            ) : (
              bubbles.map((b) => (
                <div
                  key={b.id}
                  className={`chat-row ${b.type === "out" ? "outbound" : "inbound"}`}
                >
                  <div className={`chat-avatar ${b.type === "out" ? "user" : "ai"}`}>
                    {b.type === "out" ? <User size={16} /> : "AI"}
                  </div>

                  <div>
                    <div className={`chat-bubble ${b.type === "out" ? "outbound" : b.type === "err" ? "error" : "inbound"}`}>
                      {b.type === "out" && (
                        <BubbleAttachment
                          mediaType={b.mediaType}
                          mediaData={b.mediaData}
                        />
                      )}
                      {b.text}
                    </div>

                    <div
                      className="chat-timestamp"
                      style={{
                        textAlign: b.type === "out" ? "right" : "left",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        justifyContent: b.type === "out" ? "flex-end" : "flex-start",
                      }}
                    >
                      <span>{b.time}</span>
                      {b.latencyMs && (
                        <span style={{ color: "var(--primary)" }}>({b.latencyMs}ms)</span>
                      )}
                      {b.raw && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          style={{ padding: "0 4px", height: 16, fontSize: 10 }}
                          onClick={() => setInspectorLog(b)}
                          title="Inspect Response JSON"
                        >
                          <Eye size={10} />
                          <span>Inspect</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            {sending && (
              <div className="chat-row inbound">
                <div className="chat-avatar ai">AI</div>
                <div className="chat-bubble inbound" style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.7 }}>
                  <Spinner />
                  <span>Thinking & formulating reply…</span>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Attachment Preview Strip */}
          {attachFile && (
            <AttachmentPreview
              file={attachFile}
              objectUrl={attachUrl}
              onClear={clearAttachment}
            />
          )}

          {/* Input Box Bar */}
          <div
            style={{
              padding: 14,
              borderTop: "1px solid var(--border)",
              background: "rgba(10, 15, 28, 0.7)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,video/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            <button
              type="button"
              className="btn btn-secondary btn-icon-only"
              onClick={() => fileInputRef.current?.click()}
              title="Attach image, voice note, or video clip"
              disabled={!selected || sending}
            >
              <Paperclip size={16} />
            </button>

            <input
              type="text"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder={
                selected
                  ? attachFile
                    ? "Add a caption… (Press Enter to send)"
                    : "Type a message… (Press Enter to send)"
                  : "Select an integration first"
              }
              disabled={!selected || sending}
              style={{ flex: 1 }}
            />

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => send()}
              disabled={!selected || (!msg.trim() && !attachFile) || sending}
            >
              {sending ? <Spinner /> : <Send size={15} />}
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Inspection Drawer ── */}
      <Drawer
        isOpen={!!inspectorLog}
        onClose={() => setInspectorLog(null)}
        title="Inference Response Inspection"
        subtitle={`Latency: ${inspectorLog?.latencyMs || 0}ms`}
        wide
      >
        {inspectorLog && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="glass-card" style={{ padding: 16, marginBottom: 0 }}>
              <div className="flex-row-between" style={{ marginBottom: 10 }}>
                <h4 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Raw JSON Response
                </h4>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    copyToClipboard(JSON.stringify(inspectorLog.raw, null, 2));
                    toast("JSON copied to clipboard");
                  }}
                >
                  <Copy size={13} />
                  <span>Copy JSON</span>
                </button>
              </div>

              <pre
                style={{
                  background: "rgba(0,0,0,0.35)",
                  padding: 14,
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                  color: "#a5f3fc",
                  fontSize: 12,
                  lineHeight: 1.5,
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(inspectorLog.raw, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
