import { ListBox } from '../components/ListBox.jsx';
import { formatDate } from '../source.js';

export function PointsPage({ workspace }) {
  return <div className="columns points-columns">
    <section className="panel stack gap-12">
      <h2 className="section-title">Community help score</h2>
      <p className="points-total">{workspace.summary?.totalPoints ?? ''}</p>
      <p className="body">Exact duplicates do not earn points.</p>
      <p className="body">Low-confidence reports earn reduced points. Rejected and withdrawn reports lose their points; valid reopening or verification restores them.</p>
    </section>
    <section className="panel stack gap-14">
      <h2 className="section-title">Ledger</h2>
      <ListBox label="Ledger" items={workspace.points} getKey={entry => entry.id} busy={workspace.loading}>
        {entry => <div className="ledger-row"><p className="extra-bold">{entry.points}</p>
          <div className="stack gap-3"><p className="strong">{entry.reason}</p><p className="caption">{formatDate(entry.createdAt)}</p></div>
        </div>}
      </ListBox>
    </section>
  </div>;
}
