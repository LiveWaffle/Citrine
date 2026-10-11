import { useState } from 'react';
import { isAbortError } from '../api.js';
import { RequestError } from '../components/RequestError.jsx';
import { formatDate } from '../source.js';

export function AccountPage({ auth }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await auth.changePassword({ currentPassword, newPassword });
      setSaved(true);
    } catch (error) {
      if (!isAbortError(error)) setError(error);
    } finally {
      setCurrentPassword('');
      setNewPassword('');
      setBusy(false);
    }
  }

  return <div className="columns senior-columns">
    <section className="panel stack gap-16">
      <h2 className="section-title">Account</h2>
      <dl className="detail-fields">
        <dt>Username</dt><dd>{auth.user.username}</dd>
        <dt>Role</dt><dd>{auth.user.role}</dd>
        <dt>Status</dt><dd>{auth.user.status}</dd>
        <dt>Created</dt><dd>{formatDate(auth.user.createdAt)}</dd>
      </dl>
      <button type="button" className="secondary align-start" onClick={auth.logout} disabled={auth.busy || busy}>Sign out</button>
    </section>
    <section className="panel stack gap-16">
      <h2 className="section-title">Change password</h2>
      <form onSubmit={submit}>
        <fieldset disabled={busy || auth.busy} className="stack gap-16">
          <input type="text" name="username" autoComplete="username" value={auth.user.username} readOnly hidden />
          <label className="stack gap-6"><span className="caption strong">Current password</span>
            <input type="password" autoComplete="current-password" required maxLength={128}
              value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
          <label className="stack gap-6"><span className="caption strong">New password</span>
            <input type="password" autoComplete="new-password" required minLength={12} maxLength={128}
              aria-describedby="new-password-help" value={newPassword}
              onChange={event => { setNewPassword(event.target.value); setSaved(false); }} /></label>
          <p id="new-password-help" className="caption">12-128 characters.</p>
          <button type="submit" className="primary align-start">{busy ? 'Saving...' : 'Change password'}</button>
        </fieldset>
      </form>
      <RequestError error={error} />
      {saved && <p className="body" role="status">Password changed.</p>}
    </section>
  </div>;
}
