import { useState } from 'react';
import Badge from '../components/Badge';
import LoadTable from '../components/LoadTable';
import { useResource } from '../lib/hooks';
import { apiGet, apiDel } from '../lib/api';
import { toast } from '../lib/toast';
import { fmtDate, shortId } from '../lib/utils';

export default function Conversations({ onViewMessages }) {
  const [intS]  = useResource(() => apiGet('/integrations'), []);
  const [filter, setFilter] = useState('');
  const url = filter ? '/conversations?integration_id=' + filter : '/conversations';
  const [s, reload] = useResource(() => apiGet(url), [url]);
  const [selectedIds, setSelectedIds] = useState([]);

  function intLabel(id) {
    const i = (intS.data || []).find(x => x.id === id);
    return i ? `${i.platform} · ${i.account}` : shortId(id);
  }

  async function del(id) {
    if (!window.confirm('Delete conversation and all its messages?')) return;
    try { await apiDel('/conversations/' + id); toast('Deleted'); reload(); }
    catch (e) { toast(e.message, 'error'); }
  }

  async function bulkDelete() {
    if (!window.confirm(`Delete ${selectedIds.length} conversations and all their messages?`)) return;
    let count = 0;
    for (const id of selectedIds) {
      try {
        await apiDel('/conversations/' + id);
        count++;
      } catch (e) {
        toast(`Failed to delete ${id}: ${e.message}`, 'error');
      }
    }
    toast(`Deleted ${count} conversations`);
    setSelectedIds([]);
    reload();
  }

  function toggle(id) {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(x => x !== id));
    else setSelectedIds([...selectedIds, id]);
  }

  function toggleAll() {
    const ids = (s.data || []).map(r => r.id);
    if (selectedIds.length === ids.length) setSelectedIds([]);
    else setSelectedIds(ids);
  }

  return (
    <div>
      <div className="row">
        <h2 style={{ margin: 0 }}>💬 Conversations</h2>
        {selectedIds.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={bulkDelete} style={{ marginLeft: 16 }}>
            Delete Selected ({selectedIds.length})
          </button>
        )}
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 220, marginLeft: 'auto' }}>
          <option value="">All integrations</option>
          {(intS.data || []).map(i => <option key={i.id} value={i.id}>{i.platform} · {i.account}</option>)}
        </select>
      </div>
      <LoadTable
        state={s}
        cols={[
          <input
            type="checkbox"
            checked={selectedIds.length > 0 && selectedIds.length === (s.data || []).length}
            onChange={toggleAll}
          />,
          'Title', 'External ID', 'Integration', 'Created', 'Actions'
        ]}
        emptyText="No conversations"
        renderRow={r => (
          <tr key={r.id}>
            <td>
              <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggle(r.id)} />
            </td>
            <td>{r.title || '—'}</td>
            <td className="mono" style={{ fontSize: 12 }}>{r.external_id}</td>
            <td style={{ fontSize: 12, color: 'var(--muted)' }}>{intLabel(r.integration_id)}</td>
            <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(r.created_at)}</td>
            <td>
              <button className="btn btn-accent btn-sm" onClick={() => onViewMessages(r)}>Messages</button>{' '}
              <button className="btn btn-danger btn-sm" onClick={() => del(r.id)}>Delete</button>
            </td>
          </tr>
        )}
      />
    </div>
  );
}
