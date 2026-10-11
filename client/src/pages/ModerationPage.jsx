import { useCallback, useState } from 'react';
import { api, isAbortError } from '../api.js';
import { useResource } from '../hooks/useResource.js';
import { ListBox } from '../components/ListBox.jsx';
import { SignalList } from '../components/SignalList.jsx';
import { RequestError } from '../components/RequestError.jsx';
import { formatDate, separator } from '../source.js';

export function ModerationPage({ user, refreshKey, onChange }) {
  const [status, setStatus] = useState('PendingReview');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [allHistory, setAllHistory] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const queue = useResource(useCallback(signal => api.moderationReports(status, search, signal), [status, search, refreshKey]));
  const detail = useResource(useCallback(signal => selectedId ? api.report(selectedId, signal) : Promise.resolve(null), [selectedId, refreshKey]));
  const history = useResource(useCallback(signal => api.moderationActions(allHistory ? null : selectedId, signal), [allHistory, selectedId, refreshKey]));
  const report = detail.data?.id === selectedId ? detail.data : null;
  const canReview = report && report.ownerId !== user.id && reason.trim() && !busy && !detail.loading;

  function select(report) {
    if (busy) return;
    setSelectedId(report.id);
    setAllHistory(false);
    setReason('');
    setError(null);
  }

  async function review(nextStatus) {
    if (!canReview) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateStatus(report.id, { status: nextStatus, reason, expectedStatus: report.status });
      setReason('');
      onChange();
    } catch (error) {
      if (!isAbortError(error)) {
        setError(error);
        if (error.status === 409 || error.status === 404) onChange();
      }
    } finally {
      setBusy(false);
    }
  }

  return <div className="columns reports-columns moderation-page">
    <section className="stack gap-14" aria-busy={queue.loading}>
      <h2 className="section-title">Report queue</h2>
      <label className="stack gap-6"><span className="caption">Status</span>
        <select value={status} disabled={busy} onChange={event => setStatus(event.target.value)}>
          {['PendingReview', 'Verified', 'Rejected', 'Draft', 'Duplicate', 'all'].map(value => <option key={value}>{value}</option>)}
        </select></label>
      <input type="text" aria-label="Search moderation reports" placeholder="Search reports" value={search}
        onChange={event => setSearch(event.target.value)} disabled={busy} />
      <ListBox label="Moderation reports" items={queue.data ?? []} getKey={report => report.id}
        selectedKey={selectedId} onSelect={select} compact busy={queue.loading}>
        {report => <div className="stack gap-4"><p className="strong">{report.category}</p>
          <p className="caption">{report.contentPreview}</p><p className="caption">{report.submittedBy}</p>
          <p className="caption">{report.status}</p></div>}
      </ListBox>
      {!queue.loading && queue.data?.length === 0 && <p className="body">No reports match this queue.</p>}
      <RequestError error={queue.error} />
    </section>
    <section className="stack gap-14" aria-busy={busy || detail.loading}>
      <h2 className="section-title">{report ? `${report.category}${separator}${report.riskLevel}` : 'No report selected'}</h2>
      {report && <>
        <p className="body">{[report.submittedBy, report.status, formatDate(report.submittedAt), report.shortId].filter(Boolean).join(separator)}</p>
        <p className="body pre-wrap">{report.contentPreview}</p>
        <p className="caption wrap">{report.fingerprintKey}</p>
        <SignalList signals={report.signals} />
        {report.ownerId === user.id && <p className="body">Another moderator must review your report.</p>}
      </>}
      <RequestError error={detail.error} />
      <label className="stack gap-6"><span className="caption strong">Reason</span>
        <textarea className="reason-input" value={reason} maxLength={1000} disabled={!report || busy || report.ownerId === user.id}
          onChange={event => setReason(event.target.value)} /></label>
      <div className="actions">
        <button className="secondary" disabled={!canReview || report.status === 'Verified' || report.status === 'Duplicate'} onClick={() => review('Verified')}>Mark Verified</button>
        <button className="secondary" disabled={!canReview || report.status === 'Rejected'} onClick={() => review('Rejected')}>Mark Mistaken</button>
        <button className="secondary" disabled={!canReview || report.status === 'PendingReview' || report.status === 'Duplicate'} onClick={() => review('PendingReview')}>Reopen</button>
      </div>
      <RequestError error={error} />
      <div className="history-heading"><h2 className="section-title">History</h2>
        <button className="secondary" onClick={() => setAllHistory(true)} disabled={allHistory}>All History</button></div>
      {!history.loading && history.data?.length === 0 && <p className="body">No moderation history.</p>}
      <RequestError error={history.error} />
      <div className="stack gap-12" aria-label="Moderation history">
        {(history.data ?? []).map(action => <article className="history-entry stack gap-4" key={action.id}>
          <h3>{action.action}</h3><p className="caption">{action.actorUsername}</p>
          <p className="caption wrap">{action.reportId || action.targetUserId || ''}</p>
          <p className="caption">{[action.previousStatus, action.newStatus].filter(Boolean).join(' -> ')}</p>
          <p className="body pre-wrap">{action.reason}</p>
          <p className="caption">Points change: {action.pointsDelta}</p>
          <p className="caption">{formatDate(action.createdAt)}</p>
        </article>)}
      </div>
    </section>
  </div>;
}
