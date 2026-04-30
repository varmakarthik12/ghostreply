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

  function intLabel(id) {
    const i = (intS.data || []).find(x => x.id === id);
    return i ? `${i.platform} · ${i.account}` : shortId(id);
  }

  async function del(id) {
    if (!window.confirm('Delete conversation and all its messages?')) return;
    try { await apiDel('/conversations/' + id); toast('Deleted'); reload(); }
    catch (e) { toast(e.message, 'error'); }
  }

  return (
    <div>
      <div className="row">
        <h2 style={{ margin: 0 }}>💬 Conversations</h2>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 220, marginLeft: 'auto' }}>
          <option value="">All integrations</option>
          {(intS.data || []).map(i => <option key={i.id} value={i.id}>{i.platform} · {i.account}</option>)}
        </select>
      </div>
      <LoadTable
        state={s}
        cols={['Title', 'External ID', 'Integration', 'Created', 'Actions']}
        emptyText="No conversations"
        renderRow={r => (
          <tr key={r.id}>
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
