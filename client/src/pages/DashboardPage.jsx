import { ReportList } from '../components/ReportList.jsx';
import { ScamCharts } from '../components/ScamCharts.jsx';

export function DashboardPage({ workspace, onSelect, active, refreshKey }) {
  const metrics = [
    ['Reports', workspace.summary?.totalReports],
    ['Pending Review', workspace.summary?.pendingReviewCount],
    ['Fingerprints', workspace.summary?.fingerprintCount],
    ['Points', workspace.summary?.totalPoints],
  ];
  return <div className="stack gap-18">
    <div className="metrics">
      {metrics.map(([label, value]) => <section className="panel metric stack gap-8" key={label}>
        <p className="caption">{label}</p><p className="page-title">{value ?? ''}</p>
      </section>)}
    </div>
    <ScamCharts active={active} refreshKey={refreshKey} />
    <div className="columns dashboard-columns">
      <section className="panel stack gap-14">
        <h2 className="section-title">Recent reports</h2>
        <ReportList label="Recent reports" reports={workspace.reports.slice(0, 8)}
          onSelect={onSelect} compact busy={workspace.loading} />
      </section>
      <section className="panel alt stack gap-12">
        <h2 className="section-title">Review principles</h2>
        <p className="body">Community reports are signals, not proof.</p>
        <p className="body">Points reward useful reporting, not accusations.</p>
        <p className="body">Fingerprints should identify scam patterns, not victims.</p>
        <div className="accent-rule" />
        {workspace.summary?.totalReports === 0 && <p className="body">Submit suspicious content to start your workspace.</p>}
      </section>
    </div>
  </div>;
}
