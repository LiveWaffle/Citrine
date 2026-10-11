import { categories, confidenceLevels, separator } from '../source.js';
import { SignalList } from '../components/SignalList.jsx';
import { RequestError } from '../components/RequestError.jsx';

export function SubmitPage({ submission: form, clearing }) {
  const analysis = form.analysis;
  const riskText = analysis ? `${analysis.riskLevel}${separator}${analysis.category}`
    : form.message === 'saved' ? 'Report saved' : form.message === 'empty' ? 'Add content to analyze' : 'No analysis yet';
  const preview = analysis ? analysis.contentPreview
    : form.message === 'saved' ? 'Saved with redaction applied.'
      : form.message === 'empty' ? 'Nothing to preview yet.' : 'Analysis will show the saved preview here.';

  return <div className="columns submit-columns">
    <form className="panel" onSubmit={form.save}>
      <fieldset className="stack gap-14" disabled={form.busy || clearing}>
        <div className="stack gap-6">
          <h2 className="section-title">Suspicious content</h2>
          <p className="body">Remove names, addresses, account numbers, and codes before submitting.</p>
        </div>
        <div className="two-fields">
          <label className="stack gap-6">
            <span className="caption strong">Category</span>
            <select value={form.category} onChange={event => form.changeCategory(event.target.value)}>
              {categories.map(category => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label className="stack gap-6">
            <span className="caption strong">Confidence</span>
            <select value={form.confidenceLevel} onChange={event => form.setConfidenceLevel(event.target.value)}>
              {confidenceLevels.map(level => <option key={level}>{level}</option>)}
            </select>
          </label>
        </div>
        <textarea aria-label="Suspicious content" value={form.content}
          onChange={event => form.changeContent(event.target.value)}
          placeholder="Paste suspicious text, a link, a phone number, or payment request" />
        <div className="stack gap-12">
          <div className="stack gap-8">
            <label className="checkbox-label"><input type="checkbox" checked={form.containsPersonalInfo}
              onChange={event => form.setContainsPersonalInfo(event.target.checked)} />This report contains personal information</label>
            <label className="checkbox-label"><input type="checkbox" checked={form.privacyReviewed}
              onChange={event => form.setPrivacyReviewed(event.target.checked)} />I reviewed this report for private details</label>
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => form.clear()}>Clear</button>
            <button type="button" className="secondary" onClick={form.analyze}>Analyze</button>
            <button type="submit" className="primary" disabled={!form.canSave}>Save Report</button>
          </div>
        </div>
      </fieldset>
      <RequestError error={form.error} />
    </form>
    <section className="panel analysis-panel" aria-busy={form.busy}>
      <h2 className="section-title">Analysis</h2>
      <div className="inset alt stack gap-8" aria-live="polite">
        <div className="risk-heading"><p className="strong">{riskText}</p><p className="strong">{analysis?.riskScore ?? 0}/100</p></div>
        <progress aria-label="Analysis" value={analysis?.riskScore ?? 0} max="100" />
        <p className="caption">{analysis?.duplicateNotice ?? ''}</p>
        <p className="caption">{analysis?.seniorNotice ?? ''}</p>
      </div>
      <div className="inset alt stack gap-8">
        <h3 className="strong">Redacted preview</h3><p className="body pre-wrap">{preview}</p>
      </div>
      <div className="inset alt stack gap-10">
        <h3 className="strong">Signals</h3><SignalList signals={analysis?.signals ?? []} />
      </div>
    </section>
  </div>;
}
