import { useCallback, useState } from 'react';
import { api } from '../api.js';
import { useResource } from '../hooks/useResource.js';
import { ListBox } from '../components/ListBox.jsx';
import { SignalList } from '../components/SignalList.jsx';
import { RequestError } from '../components/RequestError.jsx';

const labelText = label => label === 'spam' ? 'Spam' : 'Ham (not spam)';

export function ExamplesPage({ refreshKey }) {
  const [label, setLabel] = useState('spam');
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const resource = useResource(useCallback(signal => api.examples(label, search, page, signal), [label, search, page, refreshKey]));
  const detail = useResource(useCallback(signal => selectedId ? api.example(selectedId, signal) : Promise.resolve(null), [selectedId]));
  const result = resource.data;
  const example = detail.data?.id === selectedId ? detail.data : null;
  const dataset = result?.dataset;
  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  function searchExamples(event) {
    event.preventDefault();
    setPage(1);
    setSelectedId(null);
    setSearch(draftSearch);
  }

  return <div className="stack gap-18 examples-page">
    <div className="stack gap-6">
      <h2 className="section-title">{dataset?.title ?? 'SMS Spam Collection Dataset'}</h2>
      <p className="body">Historical spam labels are not confirmed scam verdicts. Do not follow links or call numbers in these messages.</p>
      {dataset && <p className="caption">{dataset.total.toLocaleString()} messages: {dataset.spamCount.toLocaleString()} spam, {dataset.hamCount.toLocaleString()} ham (not spam).</p>}
    </div>
    <div className="columns reports-columns">
      <section className="stack gap-14" aria-busy={resource.loading}>
        <form className="example-filters" onSubmit={searchExamples}>
          <label className="stack gap-6"><span className="caption strong">Dataset label</span>
            <select value={label} onChange={event => { setLabel(event.target.value); setPage(1); setSelectedId(null); }}>
              <option value="spam">Spam</option><option value="ham">Ham (not spam)</option><option value="all">All messages</option>
            </select></label>
          <label className="stack gap-6"><span className="caption strong">Search examples</span>
            <input type="text" value={draftSearch} maxLength={200} onChange={event => setDraftSearch(event.target.value)} /></label>
          <button type="submit" className="secondary">Search</button>
        </form>
        <ListBox label="SMS examples" items={result?.items ?? []} getKey={row => row.id}
          selectedKey={selectedId} onSelect={row => setSelectedId(row.id)} compact busy={resource.loading}>
          {row => <div className="stack gap-6"><p className="caption strong">{labelText(row.label)} / {row.sourceRow}</p>
            <p className="example-preview body">{row.content}</p></div>}
        </ListBox>
        {!resource.loading && result?.total === 0 && <p className="body">{dataset ? 'No examples match this search.' : 'No examples imported.'}</p>}
        <div className="pagination">
          <button type="button" className="secondary" disabled={!result || result.page <= 1 || resource.loading}
            onClick={() => { setPage(result.page - 1); setSelectedId(null); }}>Previous</button>
          <p className="caption" aria-live="polite">{result ? `Page ${result.page} of ${pageCount} / ${result.total.toLocaleString()} messages` : ''}</p>
          <button type="button" className="secondary" disabled={!result || result.page >= pageCount || resource.loading}
            onClick={() => { setPage(result.page + 1); setSelectedId(null); }}>Next</button>
        </div>
        <RequestError error={resource.error} />
      </section>
      <section className="stack gap-14" aria-busy={detail.loading}>
        <h2 className="section-title">{example ? `Example ${example.sourceRow}` : 'No example selected'}</h2>
        {example && <>
          <p className="caption strong">Dataset label: {labelText(example.label)}</p>
          <p className="pre-wrap example-message">{example.content}</p>
          <h3 className="section-title">Rule-based analysis</h3>
          <p className="body">{example.analysis.riskLevel} / {example.analysis.riskScore}/100</p>
          <SignalList signals={example.analysis.signals} />
        </>}
        <RequestError error={detail.error} />
      </section>
    </div>
    {dataset && <footer className="example-source stack gap-6">
      <p className="caption">{dataset.attribution}</p>
      <p className="caption">{dataset.licenseNote}</p>
      <p className="caption"><a href={dataset.sourceUrl} target="_blank" rel="noreferrer">Kaggle source</a>{' / '}
        <a href={dataset.upstreamUrl} target="_blank" rel="noreferrer">UCI source</a>{' / '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p>
    </footer>}
  </div>;
}
