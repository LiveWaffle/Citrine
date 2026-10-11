export function Header({ title, search, setSearch, navigate, onRefresh, busy }) {
  return <header className="header">
    <h1 className="page-title">{title}</h1>
    <input type="text" aria-label="Search reports" placeholder="Search reports"
      value={search} onChange={event => setSearch(event.target.value)} />
    <button type="button" className="secondary" onClick={onRefresh} disabled={busy}>Refresh</button>
    <button type="button" className="primary" onClick={() => navigate('submit')}>Submit Report</button>
  </header>;
}
