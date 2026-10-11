import { ListBox } from './ListBox.jsx';

export function ReportList({ reports, label, onSelect, selectedId, detailed = false, compact = false, busy }) {
  return <ListBox label={label} items={reports} getKey={report => report.id}
    selectedKey={selectedId} onSelect={onSelect} compact={compact} busy={busy}>
    {report => <div className="report-row">
      <div className="stack gap-4">
        <p className="strong">{report.category}</p>
        {report.isDemo && <p className="caption strong">Demo report</p>}
        <p className="caption wrap">{report.contentPreview}</p>
        {detailed && <p className="caption">{report.status}</p>}
      </div>
      <div className="stack gap-4 align-right">
        <p className="strong">{report.riskLevel}</p>
        {detailed && <p className="caption">{report.pointsAwarded}</p>}
      </div>
    </div>}
  </ListBox>;
}
