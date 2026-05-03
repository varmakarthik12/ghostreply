import { useState } from "react";
import Badge from "../components/Badge";
import LoadTable from "../components/LoadTable";
import { apiDel, apiGet } from "../lib/api";
import { useResource } from "../lib/hooks";
import { toast } from "../lib/toast";
import { fmtDate } from "../lib/utils";

export default function Messages({ initialConv }) {
  const [convS] = useResource(() => apiGet("/conversations"), []);
  const [convId, setConvId] = useState(initialConv?.id || "");
  const url = convId ? "/messages?conversation_id=" + convId : null;
  const [s, reload] = useResource(
    () => (url ? apiGet(url) : Promise.resolve([])),
    [url],
  );
  const [selectedIds, setSelectedIds] = useState([]);

  async function del(id) {
    if (!window.confirm("Delete message?")) return;
    try {
      await apiDel("/messages/" + id);
      toast("Deleted");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function bulkDelete() {
    if (!window.confirm(`Delete ${selectedIds.length} messages?`)) return;
    let count = 0;
    for (const id of selectedIds) {
      try {
        await apiDel("/messages/" + id);
        count++;
      } catch (e) {
        toast(`Failed to delete ${id}: ${e.message}`, "error");
      }
    }
    toast(`Deleted ${count} messages`);
    setSelectedIds([]);
    reload();
  }

  function toggle(id) {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter((x) => x !== id));
    else setSelectedIds([...selectedIds, id]);
  }

  function toggleAll() {
    const ids = (s.data || []).map((r) => r.id);
    if (selectedIds.length === ids.length) setSelectedIds([]);
    else setSelectedIds(ids);
  }

  return (
    <div>
      <div className="row">
        <h2 style={{ margin: 0 }}>📨 Messages</h2>
        {selectedIds.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={bulkDelete} style={{ marginLeft: 16 }}>
            Delete Selected ({selectedIds.length})
          </button>
        )}
        <select
          value={convId}
          onChange={(e) => setConvId(e.target.value)}
          style={{ width: 280, marginLeft: "auto" }}
        >
          <option value="">— Select conversation —</option>
          {(convS.data || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.title || c.external_id}
            </option>
          ))}
        </select>
      </div>
      {!convId ? (
        <div
          className="card"
          style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}
        >
          Select a conversation to view messages
        </div>
      ) : (
        <LoadTable
          state={s}
          cols={[
            <input
              type="checkbox"
              checked={selectedIds.length > 0 && selectedIds.length === (s.data || []).length}
              onChange={toggleAll}
            />,
            "Dir",
            "Content",
            "Timestamp",
            "Action",
          ]}
          emptyText="No messages"
          renderRow={(r) => (
            <tr
              key={r.id}
              style={r.is_outbound ? { background: "#1a2a3a22" } : {}}
            >
              <td>
                <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggle(r.id)} />
              </td>
              <td>
                {r.is_outbound ? (
                  <Badge color="blue">↑ Sent</Badge>
                ) : (
                  <Badge color="gray">↓ Recv</Badge>
                )}
              </td>
              <td style={{ maxWidth: 400, wordBreak: "break-word" }}>
                {r.content}
              </td>
              <td
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {fmtDate(r.timestamp)}
              </td>
              <td>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => del(r.id)}
                >
                  Del
                </button>
              </td>
            </tr>
          )}
        />
      )}
    </div>
  );
}
