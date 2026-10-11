import { useEffect, useState } from 'react';
import { api, isAbortError } from '../api.js';
import { RequestError } from './RequestError.jsx';

function Distribution({ title, rows, total, scope, rank = false }) {
  const counts = rows.map(row => ({ ...row,
    demo: scope === 'user' ? 0 : row.demoCount,
    user: scope === 'demo' ? 0 : row.userCount,
  })).map(row => ({ ...row, count: row.demo + row.user }));
  if (rank) counts.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return <section className="distribution stack gap-14" aria-label={title}>
    <h3 className="section-title">{title}</h3>
    {!total ? <p className="body">No reports in this selection.</p> : <ul className="chart-rows">
      {counts.map(row => <li className="stack gap-4" key={row.label}>
        <div className="chart-label"><span>{row.label}</span><strong>{row.count.toLocaleString()} <span className="caption">({(row.count / total * 100).toFixed(1)}%)</span></strong></div>
        <div className="chart-track" aria-hidden="true">
          <span className="chart-demo" style={{ width: `${row.demo / total * 100}%` }} />
          <span className="chart-user" style={{ width: `${row.user / total * 100}%` }} />
        </div>
        <p className="caption">{row.demo.toLocaleString()} demo / {row.user.toLocaleString()} user</p>
      </li>)}
    </ul>}
  </section>;
}

export function ScamCharts({ active, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [scope, setScope] = useState('all');
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let timer;
    async function load() {
      try {
        const result = await api.analytics(controller.signal);
        if (!controller.signal.aborted) { setData(result); setError(null); }
      } catch (failure) {
        if (!controller.signal.aborted && !isAbortError(failure)) setError(failure);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 15000);
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [active, refreshKey]);
  const total = !data ? 0 : scope === 'demo' ? data.demoCount : scope === 'user' ? data.userCount : data.total;
  return <section className="scam-charts stack gap-18" aria-label="Scam trends">
    <div className="chart-heading">
      <div className="stack gap-4">
        <h2 className="section-title">Scam trends</h2>
        <p className="body">{data ? `${data.demoCount.toLocaleString()} demo examples / ${data.userCount.toLocaleString()} user ${data.userCount === 1 ? 'report' : 'reports'}` : 'Loading report counts...'}</p>
      </div>
      <label className="stack gap-4"><span className="caption">Source</span>
        <select value={scope} onChange={event => setScope(event.target.value)}>
          <option value="all">All reports</option><option value="demo">Demo examples</option><option value="user">User reports</option>
        </select>
      </label>
    </div>
    <div className="chart-legend caption"><span><i className="chart-demo" />Demo examples</span><span><i className="chart-user" />User reports</span></div>
    <RequestError error={error} />
    {error && data && <p className="caption">Showing the last available counts.</p>}
    {data && <div className="chart-columns">
      <Distribution title="Most common types" rows={data.types} total={total} scope={scope} rank />
      <Distribution title="Rule-based risk" rows={data.risks} total={total} scope={scope} />
    </div>}
    <p className="caption">Rule-based categories, not confirmed scam verdicts. Historical examples are a sample, not real-world prevalence.
      {' '}User counts include pending and verified reports across accounts; withdrawn, rejected, and duplicate reports are excluded.</p>
  </section>;
}
