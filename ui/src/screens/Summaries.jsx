import Modal from "../components/Modal";
import { apiDel, apiGet, apiPost } from "../lib/api";
import { useResource } from "../lib/hooks";
import { toast } from "../lib/toast";
import { fmtDate, shortId } from "../lib/utils";

export default function Summaries() {
  const [convS] = useResource(() => apiGet("/conversations"), []);
  const [convId, setConvId] = useState("");
  const [triggering, setTriggering] = useState(false);
  const url = convId ? "/summaries?conversation_id=" + convId : "/summaries";
  const [s, reload] = useResource(() => apiGet(url), [url]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [detailsModal, setDetailsModal] = useState(null);

  const convs = convS.data || [];
  const convMap = Object.fromEntries(convs.map((c) => [c.id, c]));

  async function trigger() {
    if (!convId) return;
    setTriggering(true);
    try {
      await apiPost("/summaries", { conversation_id: convId });
      toast("Summary triggered");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
    setTriggering(false);
  }

  async function del(id) {
    if (!window.confirm("Delete summary?")) return;
    try {
      await apiDel("/summaries/" + id);
      toast("Deleted");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function bulkDelete() {
    if (!window.confirm(`Delete ${selectedIds.length} summaries?`)) return;
    let count = 0;
    for (const id of selectedIds) {
      try {
        await apiDel("/summaries/" + id);
        count++;
      } catch (e) {
        toast(`Failed to delete ${id}: ${e.message}`, "error");
      }
    }
    toast(`Deleted ${count} summaries`);
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
        <h2 style={{ margin: 0 }}>📝 Summaries</h2>
        {selectedIds.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={bulkDelete} style={{ marginLeft: 16 }}>
            Delete Selected ({selectedIds.length})
          </button>
        )}
        <select
          value={convId}
          onChange={(e) => setConvId(e.target.value)}
          style={{ width: 240, marginLeft: "auto" }}
        >
          <option value="">All conversations</option>
          {convs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title || c.external_id}
            </option>
          ))}
        </select>
        <button
          className="btn btn-accent"
          onClick={trigger}
          disabled={!convId || triggering}
        >
          {triggering ? <Spinner /> : null} Trigger Summary
        </button>
      </div>
      <LoadTable
        state={s}
        cols={[
          <input
            type="checkbox"
            checked={selectedIds.length > 0 && selectedIds.length === (s.data || []).length}
            onChange={toggleAll}
          />,
          "Conversation",
          "Preview",
          "Created",
          "Action",
        ]}
        emptyText="No summaries yet"
        renderRow={(r) => (
          <tr key={r.id}>
            <td>
              <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggle(r.id)} />
            </td>
            <td style={{ fontSize: 13 }}>
              {convMap[r.conversation_id]?.title || shortId(r.conversation_id)}
            </td>
            <td
              style={{
                fontStyle: "italic",
                color: "var(--muted)",
                maxWidth: 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.text.slice(0, 100)}
              {r.text.length > 100 ? "…" : ""}
            </td>
            <td
              style={{
                fontSize: 12,
                color: "var(--muted)",
                whiteSpace: "nowrap",
              }}
            >
              {fmtDate(r.created_at)}
            </td>
            <td>
              <button className="btn btn-secondary btn-sm" onClick={() => setDetailsModal(r)}>
                Details
              </button>{" "}
              <button className="btn btn-danger btn-sm" onClick={() => del(r.id)}>
                Delete
              </button>
            </td>
          </tr>
        )}
      />
      {detailsModal && (
        <Modal title="Summary Details" wide onClose={() => setDetailsModal(null)}>
          <div style={{ padding: 16 }}>
            <div style={{ marginBottom: 16, fontSize: 13, color: "var(--muted)" }}>
              Conversation: <b>{convMap[detailsModal.conversation_id]?.title || detailsModal.conversation_id}</b>
              <br />
              Created: {fmtDate(detailsModal.created_at)}
            </div>
            <div
              style={{
                background: "var(--bg-card)",
                padding: 20,
                borderRadius: 8,
                border: "1px solid var(--border)",
                whiteSpace: "pre-wrap",
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                lineHeight: 1.6,
                maxHeight: "70vh",
                overflowY: "auto",
              }}
            >
              {detailsModal.text}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={() => setDetailsModal(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
