let csrfToken = null;
let sessionVersion = 0;
const pending = new Set();

export const sessionExpiredEvent = 'citrine:session-expired';

export function setCsrfToken(token) {
  csrfToken = token;
}

export function clearSession() {
  csrfToken = null;
  sessionVersion += 1;
  for (const controller of pending) controller.abort();
  pending.clear();
}

export const isAbortError = error => error?.name === 'AbortError';

async function request(path, { signal, method = 'GET', body, expireOn401 = true } = {}) {
  const controller = new AbortController();
  const version = sessionVersion;
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  pending.add(controller);
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    headers['X-Citrine-Client'] = '1';
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  try {
    const response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      method,
      signal: controller.signal,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    // An old account's response must never enter the next account's state.
    if (version !== sessionVersion || controller.signal.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error || `Request failed (${response.status}).`);
      error.status = response.status;
      error.code = payload?.error;
      if (response.status === 401 && expireOn401) {
        clearSession();
        window.dispatchEvent(new Event(sessionExpiredEvent));
      }
      throw error;
    }
    if (response.status !== 204 && payload === null) throw new Error('The server returned an unreadable response. Please try again.');
    return payload;
  } catch (error) {
    if (error instanceof TypeError) throw new Error('Unable to reach Citrine. Check your connection and try again.');
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    pending.delete(controller);
  }
}

const reportPath = id => `/reports/${encodeURIComponent(id)}`;

export const api = {
  session: signal => request('/auth/session', { signal }),
  login: body => request('/auth/login', { method: 'POST', body, expireOn401: false }),
  register: body => request('/auth/register', { method: 'POST', body, expireOn401: false }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: body => request('/auth/password', { method: 'POST', body }),
  workspace: signal => request('/workspace', { signal }),
  analytics: signal => request('/analytics', { signal }),
  examples: (label, search, page, signal) => request(`/examples?${new URLSearchParams({ label, search, page })}`, { signal }),
  example: (id, signal) => request(`/examples/${encodeURIComponent(id)}`, { signal }),
  reports: (search, signal) => request(`/reports?${new URLSearchParams({ search })}`, { signal }),
  report: (id, signal) => request(reportPath(id), { signal }),
  fingerprints: signal => request('/fingerprints', { signal }),
  points: signal => request('/points', { signal }),
  seniorReports: signal => request('/reports?seniorProtection=true', { signal }),
  protectionNote: (id, signal) => request(`${reportPath(id)}/protection-note`, { signal }),
  analyze: (content, category) => request('/analysis', { method: 'POST', body: { content, category } }),
  saveReport: body => request('/reports', { method: 'POST', body }),
  updateStatus: (id, body) => request(`${reportPath(id)}/status`, { method: 'PATCH', body }),
  clearWorkspace: () => request('/workspace', { method: 'DELETE' }),
  moderationReports: (status, search, signal) => request(`/moderation/reports?${new URLSearchParams({ status, search })}`, { signal }),
  moderationActions: (reportId, signal) => request(`/moderation/actions${reportId ? `?${new URLSearchParams({ reportId })}` : ''}`, { signal }),
  users: signal => request('/admin/users', { signal }),
  updateUser: (id, body) => request(`/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
};
