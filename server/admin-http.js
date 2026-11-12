import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { readSessionCookie } from './auth-http.js';

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'admin-ui');

export function installAdminRoutes(app, accountService, handlers) {
  const json = express.json({ limit: '16kb', strict: true });
  const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

  app.use('/api/admin', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get(['/admin', '/admin/', '/adminpanel', '/adminpanel/'], route(async (req, res) => {
    if (!await adminSession(accountService, req, res)) return;
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(UI_DIR, 'admin.html'));
  }));
  app.get('/admin/admin.css', route(async (req, res) => {
    if (!await adminSession(accountService, req, res)) return;
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(UI_DIR, 'admin.css'));
  }));
  app.get('/admin/admin.js', route(async (req, res) => {
    if (!await adminSession(accountService, req, res)) return;
    res.set('Cache-Control', 'no-store');
    res.type('text/javascript').sendFile(path.join(UI_DIR, 'admin.js'));
  }));

  app.get('/api/admin/overview', route(async (req, res) => {
    const session = await adminSession(accountService, req, res, { api: true });
    if (!session) return;
    const [users, legacyProfiles] = await Promise.all([
      accountService.listAdminUsers(), accountService.listAdminLegacyProfiles(),
    ]);
    res.json(await handlers.overview(users, legacyProfiles, session));
  }));

  app.get('/api/admin/users', route(async (req, res) => {
    const session = await adminSession(accountService, req, res, { api: true });
    if (!session) return;
    const [users, legacyProfiles] = await Promise.all([
      accountService.listAdminUsers(), accountService.listAdminLegacyProfiles(),
    ]);
    res.json(await handlers.users(users, legacyProfiles, req.query));
  }));

  app.get('/api/admin/legacy-profiles/:profileId', route(async (req, res) => {
    const session = await adminSession(accountService, req, res, { api: true });
    if (!session) return;
    res.json(await handlers.legacyUser(await accountService.listAdminLegacyProfiles(), positiveId(req.params.profileId)));
  }));

  app.get('/api/admin/users/:accountId', route(async (req, res) => {
    const session = await adminSession(accountService, req, res, { api: true });
    if (!session) return;
    res.json(await handlers.user(await accountService.listAdminUsers(), positiveId(req.params.accountId)));
  }));

  app.get('/api/admin/audit', route(async (req, res) => {
    const session = await adminSession(accountService, req, res, { api: true });
    if (!session) return;
    res.json({ entries: await accountService.listAdminAudit(req.query.limit) });
  }));

  app.post('/api/admin/users', json, route(async (req, res) => {
    const session = await mutationAdmin(accountService, req, res);
    if (!session) return;
    const result = await accountService.adminCreateUser(req.body?.name, session.accountId);
    await handlers.userCreated(result);
    res.status(201).json(result);
  }));

  app.patch('/api/admin/users/:accountId/role', json, route(async (req, res) => {
    const session = await mutationAdmin(accountService, req, res);
    if (!session) return;
    const accountId = positiveId(req.params.accountId);
    const result = await accountService.adminSetRole(accountId, req.body?.role, session.accountId);
    if (result.changed && result.role !== 'admin') await handlers.sessionsRevoked(accountId, 'Role changed');
    res.json(result);
  }));

  app.post('/api/admin/users/:accountId/password', json, route(async (req, res) => {
    const session = await mutationAdmin(accountService, req, res);
    if (!session) return;
    const accountId = positiveId(req.params.accountId);
    const result = await accountService.adminResetPassword(accountId, session.accountId);
    await handlers.sessionsRevoked(accountId, 'Password reset by admin');
    res.json(result);
  }));

  app.delete('/api/admin/users/:accountId', route(async (req, res) => {
    const session = await mutationAdmin(accountService, req, res);
    if (!session) return;
    const accountId = positiveId(req.params.accountId);
    const users = await accountService.listAdminUsers();
    const target = users.find((user) => user.accountId === accountId);
    if (!target) return res.status(404).json({ error: 'ACCOUNT_NOT_FOUND', message: 'Account not found' });
    if (accountId === session.accountId) {
      return res.status(400).json({ error: 'ADMIN_SELF_DELETE', message: 'You cannot delete your own account' });
    }
    if (target.role === 'admin' && users.filter((user) => user.role === 'admin').length < 2) {
      return res.status(400).json({ error: 'LAST_ADMIN', message: 'The last admin cannot be removed' });
    }
    await handlers.beforeUserDeleted(accountId);
    await accountService.adminDeleteUser(accountId, session.accountId);
    await handlers.userDeleted(accountId);
    res.status(204).end();
  }));

  app.post('/api/admin/users/:accountId/reset-stat', json, route(async (req, res) => {
    const session = await mutationAdmin(accountService, req, res);
    if (!session) return;
    const accountId = positiveId(req.params.accountId);
    const result = await handlers.resetUserStat(accountId, req.body?.path);
    await accountService.adminAudit(session.accountId, 'stats.reset', accountId, { path: req.body?.path });
    res.json(result);
  }));

  app.post('/api/admin/global-stats/reset', json, route(async (req, res) => {
    const session = await mutationAdmin(accountService, req, res);
    if (!session) return;
    const result = await handlers.resetGlobalStat(req.body?.path);
    await accountService.adminAudit(session.accountId, 'global_stats.reset', null, { path: req.body?.path });
    res.json(result);
  }));

  app.use('/api/admin', (error, _req, res, _next) => {
    const known = ['USERNAME_TAKEN', 'ACCOUNT_NOT_FOUND', 'INVALID_ROLE', 'LAST_ADMIN', 'ADMIN_SELF_DELETE'];
    const status = error?.code === 'ACCOUNT_NOT_FOUND' ? 404
      : known.includes(error?.code) || String(error?.code || '').startsWith('INVALID_') ? 400 : 500;
    res.status(status).json({ error: error?.code || 'ADMIN_ERROR', message: status === 500 ? 'Server error' : error.message });
  });
}

async function adminSession(accountService, request, response, { api = false } = {}) {
  const token = readSessionCookie(request);
  const session = token ? await accountService.verifySession(token).catch(() => null) : null;
  if (session?.role === 'admin' && !session.mustChangePassword) return session;
  if (api) response.status(session ? 403 : 401).json({ error: 'ADMIN_REQUIRED', message: 'Admin access required' });
  else response.redirect('/');
  return null;
}

async function mutationAdmin(accountService, request, response) {
  const session = await adminSession(accountService, request, response, { api: true });
  if (!session) return null;
  const origin = String(request.headers.origin ?? '');
  let sameOrigin = false;
  try { sameOrigin = !!origin && new URL(origin).host.toLowerCase() === String(request.headers.host ?? '').toLowerCase(); } catch {}
  if (!sameOrigin) {
    response.status(403).json({ error: 'INVALID_ORIGIN', message: 'Invalid request origin' });
    return null;
  }
  return session;
}

function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    const error = new Error('Invalid account ID');
    error.code = 'INVALID_ACCOUNT_ID';
    throw error;
  }
  return id;
}
