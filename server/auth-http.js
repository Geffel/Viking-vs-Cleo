import express from 'express';
import { SESSION_ABSOLUTE_MS } from './auth-crypto.js';

export const SESSION_COOKIE = 'vvc_session';

export function installAuthRoutes(app, accountService, {
  onRegistered = () => {}, onMigrated = () => {}, onLoggedOut = () => {}, onPasswordReset = () => {},
} = {}) {
  const json = express.json({ limit: '8kb', strict: true });

  app.post('/api/auth/state', json, asyncRoute(async (req, res) => {
    const session = await sessionFromRequest(accountService, req);
    if (session) return res.json({ authenticated: true, session, migration: null });
    const migration = await accountService.findLegacyProfile(req.body?.clientId);
    return res.json({ authenticated: false, session: null, migration });
  }));

  app.post('/api/auth/login', json, asyncRoute(async (req, res) => {
    const result = await accountService.login(req.body?.username, req.body?.password, sourceIp(req));
    setSessionCookie(res, result.token, req.secure);
    res.json({ account: result.account });
  }));

  app.post('/api/auth/register', json, asyncRoute(async (req, res) => {
    const result = await accountService.register(req.body?.name, req.body?.password);
    setSessionCookie(res, result.token, req.secure);
    onRegistered(result);
    res.status(201).json({ account: result.account, profileId: result.profileId,
      displayName: result.displayName, recoveryCodes: result.recoveryCodes });
  }));

  app.post('/api/auth/logout', json, asyncRoute(async (req, res) => {
    const token = readSessionCookie(req);
    if (token) {
      await accountService.logout(token);
      onLoggedOut(token);
    }
    clearSessionCookie(res, req.secure);
    res.status(204).end();
  }));

  app.post('/api/auth/reset-password', json, asyncRoute(async (req, res) => {
    const result = await accountService.resetPassword(
      req.body?.username, req.body?.recoveryCode, req.body?.newPassword, sourceIp(req),
    );
    onPasswordReset(result.accountId);
    clearSessionCookie(res, req.secure);
    res.status(204).end();
  }));

  app.post('/api/auth/migrate', json, asyncRoute(async (req, res) => {
    const result = await accountService.migrateLegacyProfile(
      req.body?.clientId, req.body?.name, req.body?.password,
    );
    setSessionCookie(res, result.token, req.secure);
    onMigrated(req.body.clientId, result);
    res.status(201).json({ account: result.account, profileId: result.profileId,
      displayName: result.displayName, recoveryCodes: result.recoveryCodes });
  }));

  app.use('/api/auth', (error, _req, res, _next) => {
    const status = statusFor(error);
    res.status(status).json({ error: error.code || 'INVALID_REQUEST', message: publicMessage(error) });
  });
}

export function readSessionCookie(request) {
  const header = String(request?.headers?.cookie ?? '');
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) {
      // Session tokens only use the base64url alphabet, so decoding is both
      // unnecessary and dangerous: malformed percent escapes must never throw
      // from the HTTP server's WebSocket upgrade event.
      const token = value.join('=');
      return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
    }
  }
  return '';
}

async function sessionFromRequest(accountService, request) {
  const token = readSessionCookie(request);
  if (!token) return null;
  try { return await accountService.verifySession(token); } catch { return null; }
}

function setSessionCookie(response, token, secure) {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_ABSOLUTE_MS / 1000)}`,
  ];
  if (secure) attributes.push('Secure');
  response.setHeader('Set-Cookie', attributes.join('; '));
}

function clearSessionCookie(response, secure) {
  const attributes = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) attributes.push('Secure');
  response.setHeader('Set-Cookie', attributes.join('; '));
}

function sourceIp(request) {
  return String(request.ip || request.socket?.remoteAddress || 'unknown').slice(0, 64);
}

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response)).catch(next);
}

function statusFor(error) {
  if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') return 400;
  if (error?.code === 'USERNAME_TAKEN' || error?.code === 'LEGACY_NAME_LOCKED'
    || error?.code === 'LEGACY_PROFILE_UNAVAILABLE') return 409;
  if (error?.code === 'INVALID_CREDENTIALS') return 401;
  if (error?.code === 'LOGIN_RATE_LIMITED') return 429;
  if (error?.code === 'RECOVERY_RATE_LIMITED') return 429;
  if (String(error?.code || '').startsWith('INVALID_')) return 400;
  return 500;
}

function publicMessage(error) {
  if (statusFor(error) === 500) return 'Server error';
  return error?.message || 'Invalid request';
}
