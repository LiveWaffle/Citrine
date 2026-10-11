import { useCallback, useState } from 'react';
import { api, isAbortError } from '../api.js';
import { useResource } from '../hooks/useResource.js';
import { ListBox } from '../components/ListBox.jsx';
import { RequestError } from '../components/RequestError.jsx';
import { formatDate } from '../source.js';

export function UsersPage({ auth, refreshKey, onChange }) {
  const users = useResource(useCallback(signal => api.users(signal), [refreshKey]));
  const [selectedId, setSelectedId] = useState(null);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  // Capture the version the administrator actually selected, not a background refresh.
  const [original, setOriginal] = useState(null);
  const selected = users.data?.find(user => user.id === selectedId);

  function select(user) {
    if (busy) return;
    setSelectedId(user.id);
    setOriginal(user);
    setRole(user.role);
    setStatus(user.status);
    setReason('');
    setError(null);
    setNotice('');
  }

  async function save(event) {
    event.preventDefault();
    if (!selected || !original || busy) return;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const updated = await api.updateUser(selected.id, { role, status, reason, expectedRole: original.role, expectedStatus: original.status });
      setOriginal(updated);
      setReason('');
      setNotice('Account access updated.');
      onChange();
      if (selected.id === auth.user.id) await auth.refreshSession();
    } catch (error) {
      if (!isAbortError(error)) {
        setError(error);
        if (error.status === 409) {
          setSelectedId(null);
          setOriginal(null);
          onChange();
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return <div className="columns reports-columns">
    <section className="stack gap-14"><h2 className="section-title">Users</h2>
      <ListBox label="Users" items={users.data ?? []} getKey={user => user.id} selectedKey={selectedId} onSelect={select} busy={users.loading}>
        {user => <div className="stack gap-4"><p className="strong wrap">{user.username}</p>
          <p className="caption">{user.role}</p><p className="caption">{user.status}</p></div>}
      </ListBox><RequestError error={users.error} />
    </section>
    <section className="stack gap-14">
      <h2 className="section-title">{selected?.username ?? 'No user selected'}</h2>
      <p className="body">{formatDate(selected?.createdAt)}</p>
      <form onSubmit={save}><fieldset className="stack gap-14" disabled={!selected || busy}>
        <label className="stack gap-6"><span className="caption strong">Role</span>
          <select value={role} required onChange={event => setRole(event.target.value)}>
            <option value="" disabled></option>{['member', 'moderator', 'admin'].map(value => <option key={value}>{value}</option>)}
          </select></label>
        <label className="stack gap-6"><span className="caption strong">Status</span>
          <select value={status} required onChange={event => setStatus(event.target.value)}>
            <option value="" disabled></option>{['active', 'suspended'].map(value => <option key={value}>{value}</option>)}
          </select></label>
        <label className="stack gap-6"><span className="caption strong">Reason</span>
          <textarea className="reason-input" value={reason} maxLength={1000} required onChange={event => setReason(event.target.value)} /></label>
        <p className="body">Access changes end this user's sessions. The last active administrator cannot be removed.</p>
        <button type="submit" className="primary align-start" disabled={!reason.trim() || (role === original?.role && status === original?.status)}>Save Access</button>
      </fieldset></form>
      <RequestError error={error} />{notice && <p className="body" role="status">{notice}</p>}
    </section>
  </div>;
}
