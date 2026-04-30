import { useState } from "react";
import LoadTable from "../components/LoadTable";
import Spinner from "../components/Spinner";
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

  return (
    <div>
      <div className="row">
        <h2 style={{ margin: 0 }}>📝 Summaries</h2>
        <select
          value={convId}
          onChange={(e) => setConvId(e.target.value)}
          style={{ width: 240, marginLeft: "auto" }}
        >
          <option value="">All conversations</option>
          {(convS.data || []).map((c) => (
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
        cols={["Conv ID", "Preview", "Created", "Action"]}
        emptyText="No summaries yet"
        renderRow={(r) => (
          <tr key={r.id}>
            <td
              className="mono"
              style={{ fontSize: 11, color: "var(--muted)" }}
            >
              {shortId(r.conversation_id)}
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
              <button
                className="btn btn-danger btn-sm"
                onClick={() => del(r.id)}
              >
                Delete
              </button>
            </td>
          </tr>
        )}
      />
    </div>
  );
}
