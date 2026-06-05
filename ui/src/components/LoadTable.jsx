import Spinner from "./Spinner";

export default function LoadTable({
  state,
  cols,
  renderRow,
  emptyIcon = "📭",
  emptyText = "No data",
}) {
  if (state.loading)
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {cols.map((c, idx) => (
                <th key={idx}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="empty-row">
              <td colSpan={cols.length}>
                <Spinner />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );

  if (state.error)
    return <div className="alert alert-error">{state.error}</div>;

  const rows = state.data || [];
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {cols.map((c, idx) => (
              <th key={idx}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={cols.length}>
                {emptyIcon} {emptyText}
              </td>
            </tr>
          ) : (
            rows.map(renderRow)
          )}
        </tbody>
      </table>
    </div>
  );
}
