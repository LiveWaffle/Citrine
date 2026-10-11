import { ReportList } from '../components/ReportList.jsx';
import { SignalList } from '../components/SignalList.jsx';
import { RequestError } from '../components/RequestError.jsx';
import { formatDate, separator } from '../source.js';

export function ReportsPage({ workspace, selection, clearing, user }) {
  const report = selection.selectedReport;
  return <div className="columns reports-columns">
    <section className="panel stack gap-14">
      <h2 className="section-title">Report queue</h2>
      <ReportList label="Report queue" reports={workspace.reports} selectedId={report?.id}
        onSelect={selection.selectReport} detailed busy={workspace.loading} />
    </section>
    <section className="panel report-detail">
      <div className="stack gap-5">
        <h2 className="section-title">{report ? `${report.category}${separator}${report.riskLevel}` : 'No report selected'}</h2>
        <p className="body">{report ? `${report.status}${separator}${formatDate(report.submittedAt)}${separator}${report.shortId}`
          : 'Select a report to inspect its evidence and moderation state.'}</p>
        {report?.isDemo && <p className="caption wrap">Demo report from SMS Spam Collection ({report.sourceExampleId}).
          {' '}Reference copy, not a community submission. No points awarded.</p>}
      </div>
      <div className="inset alt"><p className="body pre-wrap">{report?.contentPreview ?? 'No report loaded.'}</p></div>
      <div className="two-fields">
        <div className="inset alt stack gap-4"><p className="caption">Fingerprint</p><p className="strong wrap">{report?.fingerprintKey ?? '-'}</p></div>
        <div className="inset alt stack gap-4"><p className="caption">Points</p><p className="strong">{report?.pointsAwarded ?? '-'}</p></div>
      </div>
      <SignalList signals={report?.signals ?? []} />
      <div>
        <div className="actions">
          <button type="button" className="secondary"
            disabled={!report || report.ownerId !== user.id || report.status === 'Draft' || selection.busy || clearing}
            onClick={selection.withdraw}>Withdraw</button>
        </div>
        <RequestError error={selection.error} />
      </div>
    </section>
  </div>;
}
