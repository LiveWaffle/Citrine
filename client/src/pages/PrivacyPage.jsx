import { useState } from 'react';
import { RequestError } from '../components/RequestError.jsx';

export function PrivacyPage({ onClear, busy, error }) {
  const [confirmed, setConfirmed] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!confirmed || busy) return;
    setDeleted(false);
    if (await onClear()) {
      setConfirmed(false);
      setDeleted(true);
    }
  }

  return <section className="panel stack gap-16">
    <h2 className="section-title">Privacy</h2>
    <p className="body">Citrine stores reports on a shared server and uses redacted previews. Your reports are private to your account and authorized moderation staff.</p>
    <p className="body">Delete your reports and points. Your account and moderation audit history will be retained. Other accounts' reports are not affected.</p>
    <form onSubmit={submit} className="stack gap-16">
      <label className="checkbox-label"><input type="checkbox" checked={confirmed} required disabled={busy}
        onChange={event => { setConfirmed(event.target.checked); setDeleted(false); }} />I understand that deleting my reports cannot be undone.</label>
      <button type="submit" className="secondary align-start" disabled={busy || !confirmed}>Delete My Reports</button>
    </form>
    {deleted && <p className="body" role="status">Your reports have been deleted.</p>}
    <RequestError error={error} />
  </section>;
}
