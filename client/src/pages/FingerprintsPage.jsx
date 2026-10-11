import { ListBox } from '../components/ListBox.jsx';

export function FingerprintsPage({ workspace }) {
  return <section className="panel stack gap-14">
    <div className="stack gap-5">
      <h2 className="section-title">Fingerprints</h2>
      <p className="body">Reusable patterns are built from scam traits, not victim identity.</p>
    </div>
    <ListBox label="Fingerprints" items={workspace.fingerprints} getKey={fingerprint => fingerprint.key} busy={workspace.loading}>
      {fingerprint => <div className="report-row">
        <div className="stack gap-4"><p className="strong">{fingerprint.category}</p><p className="caption">{fingerprint.key}</p></div>
        <div className="stack gap-4 align-right"><p className="strong">{fingerprint.highestRiskLevel}</p><p className="caption">{fingerprint.seenCount}</p></div>
      </div>}
    </ListBox>
  </section>;
}
