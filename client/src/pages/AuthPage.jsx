import { useState } from 'react';
import { RequestError } from '../components/RequestError.jsx';

export function AuthPage({ auth }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (auth.busy || auth.checking) return;
    await auth.authenticate(mode, { username, password });
    setPassword('');
  }

  return <main className="auth-layout">
    <div className="auth-content stack gap-18">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">C</div>
        <div><h1 className="brand-name">Citrine</h1><p className="caption">Track scams. Earn points.</p></div>
      </div>
      <section className="panel stack gap-18" aria-busy={auth.checking || auth.busy}>
        <div className="view-tabs" aria-label="Account access">
          <button type="button" aria-pressed={mode === 'login'} disabled={auth.busy}
            onClick={() => { setMode('login'); setPassword(''); }}>Sign in</button>
          <button type="button" aria-pressed={mode === 'register'} disabled={auth.busy}
            onClick={() => { setMode('register'); setPassword(''); }}>Register</button>
        </div>
        {auth.checking && <p role="status" className="body">Checking session...</p>}
        <form onSubmit={submit}>
          <fieldset className="stack gap-16" disabled={auth.busy || auth.checking}>
            <label className="stack gap-6">
              <span className="caption strong">Username</span>
              <input type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
                required minLength={3} maxLength={32} pattern="[a-zA-Z0-9._\-]+" value={username}
                aria-describedby={mode === 'register' ? 'username-help' : undefined}
                onChange={event => setUsername(event.target.value)} />
            </label>
            {mode === 'register' && <p id="username-help" className="caption">3-32 letters, numbers, periods, underscores, or hyphens.</p>}
            <label className="stack gap-6">
              <span className="caption strong">Password</span>
              <input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required minLength={12} maxLength={128} value={password}
                aria-describedby={mode === 'register' ? 'password-help' : undefined}
                onChange={event => setPassword(event.target.value)} />
            </label>
            {mode === 'register' && <p id="password-help" className="caption">12-128 characters.</p>}
            <button className="primary" type="submit">{auth.busy ? 'Please wait...' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
          </fieldset>
        </form>
        <RequestError error={auth.error} />
        {auth.error && <button type="button" className="secondary align-start" disabled={auth.busy || auth.checking}
          onClick={auth.refreshSession}>Check session</button>}
      </section>
    </div>
  </main>;
}
