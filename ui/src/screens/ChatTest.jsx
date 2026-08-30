import { useEffect, useRef, useState } from "react";
import Field from "../components/Field";
import Spinner from "../components/Spinner";
import { apiGet, getToken } from "../lib/api";
import { useResource } from "../lib/hooks";

// ─── helpers ─────────────────────────────────────────────────────────────────

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:<mime>;base64,<data>" – strip the prefix
      const b64 = reader.result.split(",")[1];
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── AttachmentPreview (compact strip shown before sending) ──────────────────

function AttachmentPreview({ file, objectUrl, onClear }) {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {isImage ? (
        <img
          src={objectUrl}
          alt="preview"
          style={{
            height: 48,
            width: 48,
            objectFit: "cover",
            borderRadius: 6,
            border: "1px solid var(--border)",
          }}
        />
      ) : isVideo ? (
        <video
          src={objectUrl}
          controls
          style={{
            height: 48,
            width: 64,
            objectFit: "cover",
            borderRadius: 6,
            border: "1px solid var(--border)",
          }}
        />
      ) : (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 6,
            background: "var(--accent-dim, #1e2a3a)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            border: "1px solid var(--border)",
          }}
        >
          🎙️
        </div>
      )}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {file.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          {file.type} · {(file.size / 1024).toFixed(1)} KB
        </div>
        {!isImage && !isVideo && (
          <audio
            src={objectUrl}
            controls
            style={{ height: 24, marginTop: 4, width: "100%" }}
          />
        )}
      </div>
      <button
        className="btn btn-secondary btn-sm"
        onClick={onClear}
        title="Remove attachment"
        style={{ flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
}

// ─── BubbleAttachment (shown inside a sent bubble) ────────────────────────────

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
          maxWidth: 180,
          maxHeight: 140,
          borderRadius: 6,
          marginBottom: 4,
          border: "1px solid rgba(255,255,255,0.1)",
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
          maxWidth: 220,
          maxHeight: 160,
          borderRadius: 6,
          marginBottom: 4,
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      />
    );
  }
  if (mediaType.startsWith("audio/")) {
    return (
      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginRight: 4 }}>🎙️</span>
        <audio src={src} controls style={{ height: 24, verticalAlign: "middle", maxWidth: 200 }} />
      </div>
    );
  }
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChatTest() {
  const [intS] = useResource(() => apiGet("/integrations"), []);
  const [selInt, setSelInt] = useState("");
  const [chatId, setChatId] = useState("test_user");
  const [senderName, setSenderName] = useState("Teddy");
  const [chatType, setChatType] = useState("individual");
  const [msg, setMsg] = useState("");
  const [bubbles, setBubbles] = useState([]);
  const [sending, setSending] = useState(false);
  const [showJson, setShowJson] = useState(false);

  // ── attachment state ──────────────────────────────────────────────────────
  const [attachFile, setAttachFile] = useState(null);   // File object
  const [attachUrl, setAttachUrl] = useState(null);     // object URL for preview
  const [attachB64, setAttachB64] = useState(null);     // base64 string
  const fileInputRef = useRef(null);

  const bottomRef = useRef(null);
  const intList = intS.data || [];
  const selected = intList.find((i) => i.id === selInt);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles]);

  // Clean up object URL when attachment changes
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

  async function send() {
    const text = msg.trim();
    const hasMedia = !!(attachB64 && attachFile);
    if ((!text && !hasMedia) || !selected || !chatId.trim()) return;

    setSending(true);
    const now = new Date();
    const time_iso = now.toISOString();
    const time_str = now.toLocaleTimeString();
    const msgId = "test_" + now.getTime();

    // Snapshot attachment so the bubble keeps its own copy
    const sentMediaData = attachB64 || null;
    const sentMediaType = attachFile?.type || null;
    const sentText = text || (hasMedia ? `[${attachFile.type.startsWith("image/") ? "Image" : attachFile.type.startsWith("video/") ? "Video Clip" : "Voice Note"}]` : "");

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

    try {
      const t = getToken();
      const endpoint = `/api/integrations/${selected.id}/conversations/${chatId}/auto-reply`;
      const body = {
        content: text,
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

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <h2>🧪 Chat Test</h2>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 12 }}>
          <span className="badge badge-blue">Auto-Reply V2 (Live)</span>
        </div>

        <div className="responsive-grid">
          <Field label="Integration">
            <select value={selInt} onChange={(e) => setSelInt(e.target.value)}>
              <option value="">— select —</option>
              {intList.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.platform} · {i.account}
                </option>
              ))}
            </select>
          </Field>
          <Field label="External ID (Conversation ID)">
            <input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="user123 or snap-uuid"
            />
          </Field>
          <Field label="Sender Name">
            <input
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Teddy"
            />
          </Field>
          <Field label="Chat Type">
            <select value={chatType} onChange={(e) => setChatType(e.target.value)}>
              <option value="individual">Individual</option>
              <option value="group">Group</option>
            </select>
          </Field>
        </div>
        {selected && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
            Target Endpoint:{" "}
            <code>
              /api/integrations/{selected.id}/conversations/{chatId}/auto-reply
            </code>
          </div>
        )}
      </div>

      {/* ── Chat window ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            minHeight: 300,
            maxHeight: 400,
            overflowY: "auto",
            background: "#0d1117",
          }}
        >
          {bubbles.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--muted)",
                padding: 48,
              }}
            >
              Type a message or attach an image / voice note to test multimodal replies
            </div>
          ) : (
            <div className="bubbles">
              {bubbles.map((b) => (
                <div
                  key={b.id}
                  className={b.type === "out" ? "bubble-wrap-out" : "bubble-wrap-in"}
                >
                  <div>
                    <div className={`bubble bubble-${b.type}`}>
                      {/* Show attachment inline for sent bubbles */}
                      {b.type === "out" && (
                        <BubbleAttachment
                          mediaType={b.mediaType}
                          mediaData={b.mediaData}
                        />
                      )}
                      {b.text}
                    </div>
                    <div
                      className="bubble-time"
                      style={{ textAlign: b.type === "out" ? "right" : "left" }}
                    >
                      {b.time}
                    </div>
                    {showJson && b.raw && (
                      <div className="bubble-json">
                        {JSON.stringify(b.raw, null, 2)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="bubble-wrap-in">
                  <div className="bubble bubble-in" style={{ opacity: 0.5 }}>
                    <Spinner /> Waiting for reply…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── Attachment preview strip (shown only when a file is picked) ──── */}
        {attachFile && (
          <AttachmentPreview
            file={attachFile}
            objectUrl={attachUrl}
            onClear={clearAttachment}
          />
        )}

        {/* ── Input row ─────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: 12,
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          {/* Hidden file input – accepts images, audio, and video */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,video/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <button
            className="btn btn-secondary"
            title="Attach image, video clip, or voice note"
            disabled={!selected || sending}
            onClick={() => fileInputRef.current?.click()}
            style={{ flexShrink: 0, fontSize: 18, padding: "4px 10px" }}
          >
            📎
          </button>
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder={
              selected
                ? attachFile
                  ? "Add a caption… (Enter to send)"
                  : "Type a message… (Enter to send)"
                : "Select an integration first"
            }
            disabled={!selected || sending}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-accent"
            onClick={send}
            disabled={!selected || (!msg.trim() && !attachFile) || sending}
          >
            {sending ? <Spinner /> : "Send →"}
          </button>
          <button
            className="btn btn-secondary"
            title="Clear chat"
            onClick={() => { setBubbles([]); clearAttachment(); }}
          >
            🗑
          </button>
        </div>

        {/* ── Footer options ────────────────────────────────────────────────── */}
        <div
          style={{
            padding: "6px 12px 10px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <label
            style={{
              fontSize: 12,
              color: "var(--muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <input
              type="checkbox"
              checked={showJson}
              onChange={(e) => setShowJson(e.target.checked)}
            />
            Show raw JSON response
          </label>
          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
            📎 Attach image, video, or audio to test multimodal analysis
          </span>
        </div>
      </div>
    </div>
  );
}
