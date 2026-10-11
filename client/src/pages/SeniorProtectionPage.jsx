import { ReportList } from '../components/ReportList.jsx';
import { seniorEmptyText } from '../source.js';
import { RequestError } from '../components/RequestError.jsx';

export function SeniorProtectionPage({ workspace, selection }) {
  return <div className="columns senior-columns">
    <section className="panel stack gap-12">
      <h2 className="section-title">Protection note</h2>
      <p className="body">If money, codes, or remote access are involved, stop and verify with a trusted person first.</p>
      <div className="inset alt"><p className="body pre-wrap">{selection.seniorNote ?? seniorEmptyText}</p></div>
      <RequestError error={selection.error} />
    </section>
    <section className="panel stack gap-14">
      <h2 className="section-title">Flagged reports</h2>
      <ReportList label="Flagged reports" reports={workspace.seniorReports} selectedId={selection.seniorReportId}
        onSelect={selection.selectSenior} busy={workspace.loading} />
    </section>
  </div>;
}
