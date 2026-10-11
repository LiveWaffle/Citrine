import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useNavigation } from './hooks/useNavigation.js';
import { useWorkspace } from './hooks/useWorkspace.js';
import { useSubmission } from './hooks/useSubmission.js';
import { useReportSelection } from './hooks/useReportSelection.js';
import { Sidebar } from './components/Sidebar.jsx';
import { Header } from './components/Header.jsx';
import { RequestError } from './components/RequestError.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { SubmitPage } from './pages/SubmitPage.jsx';
import { ReportsPage } from './pages/ReportsPage.jsx';
import { FingerprintsPage } from './pages/FingerprintsPage.jsx';
import { PointsPage } from './pages/PointsPage.jsx';
import { SeniorProtectionPage } from './pages/SeniorProtectionPage.jsx';
import { PrivacyPage } from './pages/PrivacyPage.jsx';
import { AuthPage } from './pages/AuthPage.jsx';
import { AccountPage } from './pages/AccountPage.jsx';
import { ModerationPage } from './pages/ModerationPage.jsx';
import { UsersPage } from './pages/UsersPage.jsx';
import { ExamplesPage } from './pages/ExamplesPage.jsx';
import { useAuth } from './hooks/useAuth.js';
import { isStaff } from './source.js';

export default function App() {
  const auth = useAuth();
  return auth.user ? <WorkspaceApp key={auth.sessionKey} auth={auth} /> : <AuthPage auth={auth} />;
}

function WorkspaceApp({ auth }) {
  const { page, navigate } = useNavigation();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const refreshKey = `${page.id}:${revision}`;
  const workspace = useWorkspace(refreshKey);
  const selection = useReportSelection(refresh, refreshKey, auth.user.id);
  useEffect(() => {
    if ((page.staffOnly && !isStaff(auth.user)) || (page.adminOnly && auth.user.role !== 'admin')) navigate('dashboard');
  }, [page, auth.user.role, navigate]);
  useEffect(() => {
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState(null);
  const submission = useSubmission(report => {
    refresh();
    void selection.selectReport(report);
    navigate('reports');
  });

  function openReport(report) {
    void selection.selectReport(report);
    navigate('reports');
  }

  async function clearWorkspace() {
    if (clearing || submission.busy || selection.busy) return;
    setClearing(true);
    setClearError(null);
    try {
      await api.clearWorkspace();
      selection.clear();
      submission.clear();
      refresh();
      return true;
    } catch (error) {
      setClearError(error);
      return false;
    } finally {
      setClearing(false);
    }
  }

  return <div className="app-shell">
    <Sidebar page={page} navigate={navigate} user={auth.user} onLogout={auth.logout} busy={auth.busy} />
    <div className="workspace">
      <Header title={page.label} search={workspace.search} setSearch={workspace.setSearch} navigate={navigate}
        busy={workspace.loading} onRefresh={() => { void auth.refreshSession(); refresh(); }} />
      <main className="page-content" aria-busy={workspace.loading || clearing}>
        <RequestError error={workspace.error} />
        <RequestError error={auth.error} />
        <div hidden={page.id !== 'dashboard'}><DashboardPage workspace={workspace} onSelect={openReport} active={page.id === 'dashboard'} refreshKey={refreshKey} /></div>
        <div hidden={page.id !== 'submit'}><SubmitPage submission={submission} clearing={clearing} /></div>
        <div hidden={page.id !== 'reports'}><ReportsPage workspace={workspace} selection={selection} clearing={clearing} user={auth.user} /></div>
        <div hidden={page.id !== 'fingerprints'}><FingerprintsPage workspace={workspace} /></div>
        <div hidden={page.id !== 'points'}><PointsPage workspace={workspace} /></div>
        <div hidden={page.id !== 'senior'}><SeniorProtectionPage workspace={workspace} selection={selection} /></div>
        <div hidden={page.id !== 'privacy'}><PrivacyPage workspace={workspace} onClear={clearWorkspace}
          busy={clearing || submission.busy || selection.busy || workspace.loading} error={clearError} /></div>
        {page.id === 'account' && <AccountPage auth={auth} />}
        {page.id === 'examples' && <ExamplesPage refreshKey={refreshKey} />}
        {page.id === 'moderation' && isStaff(auth.user) && <ModerationPage user={auth.user} refreshKey={refreshKey} onChange={refresh} />}
        {page.id === 'users' && auth.user.role === 'admin' && <UsersPage auth={auth} refreshKey={refreshKey} onChange={refresh} />}
      </main>
    </div>
  </div>;
}
