import { useEffect, useRef, useState } from "react";
import Field from "../components/Field";
import Spinner from "../components/Spinner";
import { apiGet, getToken } from "../lib/api";
import { useResource } from "../lib/hooks";

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
  const bottomRef = useRef(null);

  const intList = intS.data || [];
  const selected = intList.find((i) => i.id === selInt);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles]);

  async function send() {
    const text = msg.trim();
    if (!text || !selected || !chatId.trim()) return;
    setSending(true);
    setMsg("");
    const now = new Date();
    const time_iso = now.toISOString();
    const time_str = now.toLocaleTimeString();
    const msgId = "test_" + now.getTime();

    setBubbles((b) => [
      ...b,
      {
        id: msgId,
        type: "out",
        text,
        time: time_str,
        time_iso: time_iso,
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
            Target Endpoint: <code>/api/integrations/{selected.id}/conversations/{chatId}/auto-reply</code>
          </div>
        )}
      </div>

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
              Type a message to test the webhook flow
            </div>
          ) : (
            <div className="bubbles">
              {bubbles.map((b) => (
                <div
                  key={b.id}
                  className={
                    b.type === "out" ? "bubble-wrap-out" : "bubble-wrap-in"
                  }
                >
                  <div>
                    <div className={`bubble bubble-${b.type}`}>{b.text}</div>
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
        <div
          style={{
            padding: 12,
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder={
              selected
                ? "Type a message… (Enter to send)"
                : "Select an integration first"
            }
            disabled={!selected || sending}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-accent"
            onClick={send}
            disabled={!selected || !msg.trim() || sending}
          >
            {sending ? <Spinner /> : "Send →"}
          </button>
          <button
            className="btn btn-secondary"
            title="Clear chat"
            onClick={() => setBubbles([])}
          >
            🗑
          </button>
        </div>
        <div
          style={{
            padding: "6px 12px 10px",
            borderTop: "1px solid var(--border)",
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
        </div>
      </div>
    </div>
  );
}
