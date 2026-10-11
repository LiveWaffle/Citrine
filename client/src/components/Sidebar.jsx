import { isStaff, pages } from '../source.js';

export function Sidebar({ page, navigate, user, onLogout, busy }) {
  return <aside className="sidebar">
    <div className="stack gap-18">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">C</div>
        <div><div className="brand-name">Citrine</div><p className="caption">Track scams. Earn points.</p></div>
      </div>
      <nav className="navigation">
        {pages.filter(item => (!item.staffOnly || isStaff(user)) && (!item.adminOnly || user.role === 'admin')).map(item => <button key={item.id} type="button"
          className={`nav-button${page.id === item.id ? ' active' : ''}`}
          aria-current={page.id === item.id ? 'page' : undefined}
          onClick={() => navigate(item.id)}>{item.label}</button>)}
      </nav>
    </div>
    <footer className="sidebar-footer stack gap-6">
      <p className="strong wrap">{user.username}</p>
      <p className="caption">{user.role}</p>
      <button className="secondary align-start" type="button" onClick={onLogout} disabled={busy}>Sign out</button>
    </footer>
  </aside>;
}
