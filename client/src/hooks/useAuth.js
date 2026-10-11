import { useCallback, useEffect, useRef, useState } from 'react';
import { api, clearSession, isAbortError, sessionExpiredEvent, setCsrfToken } from '../api.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sessionKey, setSessionKey] = useState(0);
  const currentUser = useRef(null);
  const operation = useRef(0);
  const mounted = useRef(false);
  const changingSession = useRef(false);
  const checkOnFocus = useRef(true);

  const acceptSession = useCallback(envelope => {
    const next = envelope.user?.status === 'active' ? envelope.user : null;
    const previous = currentUser.current;
    if (previous?.id !== next?.id || previous?.role !== next?.role || previous?.status !== next?.status) {
      clearSession();
      setSessionKey(value => value + 1);
    }
    setCsrfToken(next ? envelope.csrfToken : null);
    currentUser.current = next;
    setUser(next);
  }, []);

  const refreshSession = useCallback(async () => {
    if (changingSession.current) return;
    const version = ++operation.current;
    try {
      const result = await api.session();
      if (mounted.current && version === operation.current) {
        acceptSession(result);
        setError(null);
      }
    } catch (error) {
      if (mounted.current && version === operation.current && !isAbortError(error)) setError(error);
    } finally {
      if (mounted.current && version === operation.current) setChecking(false);
    }
  }, [acceptSession]);

  useEffect(() => {
    mounted.current = true;
    void refreshSession();
    const expired = () => {
      operation.current += 1;
      changingSession.current = false;
      checkOnFocus.current = false;
      currentUser.current = null;
      setUser(null);
      setSessionKey(value => value + 1);
      setChecking(false);
      setBusy(false);
      setError(new Error('Your session has ended. Sign in again to continue.'));
      window.location.hash = 'dashboard';
    };
    const focus = () => {
      if (checkOnFocus.current && document.visibilityState !== 'hidden') void refreshSession();
    };
    window.addEventListener(sessionExpiredEvent, expired);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      mounted.current = false;
      operation.current += 1;
      window.removeEventListener(sessionExpiredEvent, expired);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [refreshSession]);

  async function authenticate(mode, credentials) {
    if (changingSession.current) return false;
    changingSession.current = true;
    const version = ++operation.current;
    setBusy(true);
    setError(null);
    try {
      const result = await api[mode](credentials);
      if (!mounted.current || version !== operation.current) return false;
      acceptSession(result);
      checkOnFocus.current = true;
      return true;
    } catch (error) {
      if (mounted.current && version === operation.current && !isAbortError(error)) setError(error);
      return false;
    } finally {
      changingSession.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function changePassword(credentials) {
    if (changingSession.current) throw new Error('An account request is already in progress.');
    changingSession.current = true;
    const version = ++operation.current;
    try {
      const result = await api.changePassword(credentials);
      if (!mounted.current || version !== operation.current) throw new DOMException('Request cancelled.', 'AbortError');
      acceptSession(result);
    } finally {
      changingSession.current = false;
    }
  }

  async function logout() {
    if (changingSession.current) return;
    changingSession.current = true;
    operation.current += 1;
    setBusy(true);
    setError(null);
    let failure = null;
    try {
      await api.logout();
    } catch (error) {
      if (!isAbortError(error) && error.status !== 401) {
        failure = new Error(`Sign out could not be confirmed by the server. ${error.message}`);
      }
    } finally {
      clearSession();
      currentUser.current = null;
      checkOnFocus.current = false;
      changingSession.current = false;
      operation.current += 1;
      setUser(null);
      setSessionKey(value => value + 1);
      setChecking(false);
      setBusy(false);
      setError(failure);
      window.location.hash = 'dashboard';
    }
  }

  return { user, checking, busy, error, sessionKey, authenticate, logout, changePassword, refreshSession };
}
