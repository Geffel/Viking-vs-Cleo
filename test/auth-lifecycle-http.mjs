import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startTestServer } from './test-server.mjs';

let server;
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'vvc-auth-lifecycle-'));
try {
  server = await startTestServer({ dataDir });
  const httpUrl = server.url.replace(/^ws/, 'http');

  const anonymous = await post(httpUrl, '/api/auth/state', { clientId: 'fresh-browser' });
  assert.equal(anonymous.response.status, 200);
  assert.equal(anonymous.data.authenticated, false);
  assert.equal(anonymous.data.migration, null);

  const registered = await post(httpUrl, '/api/auth/register', {
    name: 'New Fighter', password: 'a secure new password',
  });
  assert.equal(registered.response.status, 201);
  assert.equal(registered.data.profileId, 1);
  assert.equal(registered.data.displayName, 'New Fighter');
  assert.equal(registered.data.recoveryCodes.length, 10);
  const firstCookie = cookieFrom(registered.response);

  const active = await post(httpUrl, '/api/auth/state', { clientId: 'fresh-browser' }, firstCookie);
  assert.equal(active.data.authenticated, true);
  assert.equal(active.data.session.profileId, 1);
  assert.equal((await identify(server.url, server.origin, firstCookie)).name, 'New Fighter');

  const activeSocket = await openIdentified(server.url, server.origin, firstCookie);
  const revoked = once(activeSocket.socket, 'close', { signal: AbortSignal.timeout(5000) });
  const loggedOut = await post(httpUrl, '/api/auth/logout', {}, firstCookie, false);
  assert.equal(loggedOut.response.status, 204);
  assert.equal((await revoked)[0], 1008, 'logout closes an already connected game socket');
  assert.match(loggedOut.response.headers.get('set-cookie'), /^vvc_session=;/);
  const afterLogout = await post(httpUrl, '/api/auth/state', { clientId: 'fresh-browser' }, firstCookie);
  assert.equal(afterLogout.data.authenticated, false);
  assert.equal(await rejectedWebSocket(server.url, server.origin, firstCookie), 401);

  const loggedIn = await post(httpUrl, '/api/auth/login', {
    username: 'NEW FIGHTER', password: 'a secure new password',
  });
  assert.equal(loggedIn.response.status, 200);
  const reconnectCookie = cookieFrom(loggedIn.response);
  const firstConnection = await identify(server.url, server.origin, reconnectCookie);
  assert.equal(firstConnection.profileId, 1);

  await server.stop();
  server = await startTestServer({ dataDir });
  const restartedHttpUrl = server.url.replace(/^ws/, 'http');
  const restored = await post(restartedHttpUrl, '/api/auth/state', { clientId: 'fresh-browser' }, reconnectCookie);
  assert.equal(restored.data.authenticated, true, 'the session survives a server restart');
  assert.equal(restored.data.session.profileId, 1);
  const reconnected = await identify(server.url, server.origin, reconnectCookie);
  assert.equal(reconnected.profileId, 1);
  assert.equal(reconnected.name, 'New Fighter');

  const resetSocket = await openIdentified(server.url, server.origin, reconnectCookie);
  const resetSocketClosed = once(resetSocket.socket, 'close', { signal: AbortSignal.timeout(5000) });
  const reset = await post(restartedHttpUrl, '/api/auth/reset-password', {
    username: 'new fighter', recoveryCode: registered.data.recoveryCodes[0], newPassword: 'a replaced secure password',
  }, reconnectCookie, false);
  assert.equal(reset.response.status, 204);
  assert.match(reset.response.headers.get('set-cookie'), /^vvc_session=;/);
  assert.equal((await resetSocketClosed)[0], 1008, 'password reset closes active game sockets');
  const afterReset = await post(restartedHttpUrl, '/api/auth/state', { clientId: 'fresh-browser' }, reconnectCookie);
  assert.equal(afterReset.data.authenticated, false, 'password reset revokes every existing session');

  const oldPassword = await post(restartedHttpUrl, '/api/auth/login', {
    username: 'New Fighter', password: 'a secure new password',
  });
  assert.equal(oldPassword.response.status, 401);
  const reusedCode = await post(restartedHttpUrl, '/api/auth/reset-password', {
    username: 'New Fighter', recoveryCode: registered.data.recoveryCodes[0], newPassword: 'another secure password',
  });
  assert.equal(reusedCode.response.status, 400, 'a recovery code can only be used once');
  assert.equal(reusedCode.data.error, 'INVALID_RECOVERY');
  const afterPasswordReset = await post(restartedHttpUrl, '/api/auth/login', {
    username: 'New Fighter', password: 'a replaced secure password',
  });
  assert.equal(afterPasswordReset.response.status, 200);

  console.log('AUTH LIFECYCLE HTTP TESTS OK: registration, sessions and one-time recovery work end to end');
} finally {
  await server?.stop();
  await rm(dataDir, { recursive: true, force: true });
}

async function post(base, route, body, cookie = '', parseJson = true) {
  const response = await fetch(`${base}${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { response, data: parseJson ? await response.json() : null };
}

function cookieFrom(response) {
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /^vvc_session=[A-Za-z0-9_-]{43};/);
  return setCookie.split(';', 1)[0];
}

function identify(url, origin, cookie) {
  return openIdentified(url, origin, cookie).then(({ socket, message }) => {
    socket.close();
    return message;
  });
}

function openIdentified(url, origin, cookie) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Origin: origin, Cookie: cookie } });
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('WebSocket auth test timed out')); }, 5000);
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.t === 'welcome') socket.send(JSON.stringify({ t: 'identify', name: 'Forged', clientId: 'forged' }));
      if (message.t === 'identified') {
        clearTimeout(timer);
        resolve({ socket, message });
      }
    });
    socket.on('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

function rejectedWebSocket(url, origin, cookie) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Origin: origin, Cookie: cookie } });
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode);
    });
    socket.once('open', () => { socket.terminate(); reject(new Error('Revoked session unexpectedly opened')); });
    socket.once('error', (error) => {
      if (!String(error.message).includes('Unexpected server response')) reject(error);
    });
  });
}
