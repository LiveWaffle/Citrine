import express from 'express';
import { categories, confidenceLevels, isStaff, reportStatuses } from './models.js';
import { createWorkspace } from './services/workspace.js';
import { createAuth, safeEqual } from './services/auth.js';
import { createModeration } from './services/moderation.js';
import { ApiError, requireValue } from './services/errors.js';
import { createExamples } from './services/examples.js';
import { createAnalytics } from './services/analytics.js';

const cookieName = 'citrine_session';
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api' };

function readSessionCookie(req) {
  const value = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`));
  return value?.slice(cookieName.length + 1) ?? null;
}

export function createApp(database) {
  const app = express();
  const workspace = createWorkspace(database);
  const auth = createAuth(database);
  const moderation = createModeration(database);
  const examples = createExamples(database);
  const analytics = createAnalytics(database);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    req.session = auth.session(readSessionCookie(req));
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      // Browsers cannot add this header cross-origin without a CORS grant; none is provided.
      requireValue(req.get('X-Citrine-Client') === '1', 403, 'INVALID_CLIENT', 'Use the Citrine app to make this request.');
    }
    next();
  });

  function setSession(res, result) {
    res.cookie(cookieName, result.token, { ...cookieOptions, maxAge: result.maxAge });
    res.json({ user: result.user, csrfToken: result.csrfToken });
  }

  app.get('/api/auth/session', (req, res) => res.json({ user: req.session?.user ?? null, csrfToken: req.session?.csrfToken ?? null }));
  app.post('/api/auth/register', async (req, res) => {
    const result = await auth.register(req.body, req.ip);
    if (req.session) auth.logout(req.session.tokenHash);
    res.status(201);
    setSession(res, result);
  });
  app.post('/api/auth/login', async (req, res) => {
    const result = await auth.login(req.body, req.ip);
    // Replace any previous session in this browser rather than leaving it live.
    if (req.session) auth.logout(req.session.tokenHash);
    setSession(res, result);
  });

  app.use('/api', (req, _res, next) => {
    requireValue(req.session, 401, 'SESSION_EXPIRED', 'Please sign in to continue.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      requireValue(safeEqual(req.get('X-CSRF-Token'), req.session.csrfToken), 403, 'INVALID_CSRF', 'Your session changed. Refresh and try again.');
    }
    next();
  });
  const staffOnly = (req, _res, next) => {
    requireValue(isStaff(req.session.user), 403, 'FORBIDDEN', 'Moderator access is required.');
    next();
  };
  const adminOnly = (req, _res, next) => {
    requireValue(req.session.user.role === 'admin', 403, 'FORBIDDEN', 'Admin access is required.');
    next();
  };
  const contentInput = body => {
    requireValue(typeof body?.content === 'string' && body.content.trim().length > 0,
      400, 'CONTENT_REQUIRED', 'Add content to analyze.');
    const category = body.category ?? 'Unknown';
    requireValue(categories.includes(category), 400, 'INVALID_CATEGORY', 'Select a valid category.');
    return { content: body.content.trim(), category };
  };

  app.post('/api/auth/logout', (req, res) => {
    auth.logout(req.session.tokenHash);
    res.clearCookie(cookieName, cookieOptions).status(204).end();
  });
  app.post('/api/auth/password', async (req, res) => setSession(res, await auth.changePassword(req.session, req.body, req.ip)));

  app.get('/api/workspace', (req, res) => res.json(workspace.summary(req.session.user)));
  app.get('/api/analytics', (_req, res) => res.json(analytics.summary()));
  app.get('/api/examples', (req, res) => res.json(examples.list(req.query)));
  app.get('/api/examples/:id', (req, res) => res.json(examples.get(req.params.id)));
  app.get('/api/reports', (req, res) => res.json(workspace.listReports(req.session.user, {
    search: typeof req.query.search === 'string' ? req.query.search : '', seniorOnly: req.query.seniorProtection === 'true',
  })));
  app.get('/api/reports/:id', (req, res) => res.json(workspace.getReport(req.params.id, req.session.user)));
  app.get('/api/reports/:id/analysis', (req, res) => res.json(workspace.getAnalysis(req.params.id, req.session.user)));
  app.get('/api/reports/:id/signals', (req, res) => res.json(workspace.getReport(req.params.id, req.session.user).signals));
  app.get('/api/reports/:id/protection-note', (req, res) => res.json(workspace.protectionNote(req.params.id, req.session.user)));
  app.get('/api/fingerprints', (req, res) => res.json(workspace.listFingerprints(req.session.user)));
  app.get('/api/points', (req, res) => res.json(workspace.listPoints(req.session.user)));
  app.post('/api/analysis', (req, res) => {
    const { content, category } = contentInput(req.body);
    res.json(workspace.analyzeSubmission(req.session.user, content, category));
  });
  app.post('/api/reports', (req, res) => {
    const input = contentInput(req.body);
    requireValue(confidenceLevels.includes(req.body.confidenceLevel) && typeof req.body.containsPersonalInfo === 'boolean',
      400, 'INVALID_REPORT', 'Select confidence and review the report details.');
    requireValue(req.body.privacyReviewed === true, 400, 'PRIVACY_REVIEW_REQUIRED', 'Review private details before saving.');
    res.status(201).json(workspace.addReport(req.session.user, {
      ...input, confidenceLevel: req.body.confidenceLevel, containsPersonalInfo: req.body.containsPersonalInfo,
    }));
  });
  app.patch('/api/reports/:id/status', (req, res) => {
    requireValue(req.body && typeof req.body.expectedStatus === 'string', 400, 'INVALID_REVIEW', 'Refresh the report before reviewing it.');
    res.json(workspace.updateStatus(req.session.user, req.params.id, req.body));
  });
  app.delete('/api/workspace', (req, res) => {
    workspace.clearOwn(req.session.user);
    res.status(204).end();
  });

  app.get('/api/moderation/reports', staffOnly, (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'PendingReview';
    requireValue(status === 'all' || reportStatuses.includes(status), 400, 'INVALID_STATUS', 'Select a valid report status.');
    res.json(workspace.listModerationReports({ status, search: typeof req.query.search === 'string' ? req.query.search : '' }));
  });
  app.get('/api/moderation/actions', staffOnly, (req, res) => res.json(moderation.actions(typeof req.query.reportId === 'string' ? req.query.reportId : '')));
  app.get('/api/admin/users', adminOnly, (_req, res) => res.json(moderation.listUsers()));
  app.patch('/api/admin/users/:id', adminOnly, (req, res) => {
    requireValue(req.body, 400, 'INVALID_ACCESS', 'Select the account changes.');
    res.json(moderation.updateUser(req.session.user, req.params.id, req.body));
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Not found.' }));
  app.use((error, _req, res, _next) => {
    const status = error instanceof ApiError ? error.status : [400, 413].includes(error.status) ? error.status : 500;
    if (status === 429) res.set('Retry-After', '900');
    // Never log passwords, cookies, request bodies, or report content.
    if (status === 500) console.error('Citrine API:', error.code || error.type || error.name);
    res.status(status).json({
      error: error instanceof ApiError ? error.code : status === 500 ? 'SERVER_ERROR' : 'INVALID_REQUEST',
      message: error instanceof ApiError ? error.message : status === 500 ? 'The request could not be completed.' : 'Invalid request.',
    });
  });
  return app;
}
