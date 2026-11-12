import assert from 'node:assert/strict';
import { startTestServer } from './test-server.mjs';

const server = await startTestServer({
  authenticatedProfiles: ['Admin profile', 'Player profile'],
  legacyProfiles: ['Waiting legacy'],
  env: { VVC_BOOTSTRAP_ADMIN: 'Admin profile' },
});

try {
  const adminCookie = server.authCookies[0];
  const playerCookie = server.authCookies[1];
  const adminPage = await fetch(`${server.origin}/admin`, { headers: { cookie: adminCookie }, redirect: 'manual' });
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /Spelare och behörighet/);

  const denied = await fetch(`${server.origin}/admin`, { headers: { cookie: playerCookie }, redirect: 'manual' });
  assert.equal(denied.status, 302);
  const deniedApi = await api('GET', '/api/admin/users', null, playerCookie);
  assert.equal(deniedApi.status, 403);

  const initial = await api('GET', '/api/admin/overview', null, adminCookie);
  assert.equal(initial.status, 200);
  assert.equal(initial.data.summary.accounts, 2);
  assert.equal(initial.data.summary.admins, 1);
  assert.equal(initial.data.summary.pendingMigration, 1);
  assert.equal(initial.data.users, undefined, 'overview does not send every player profile');

  const playerList = await api('GET', '/api/admin/users?search=player&role=player&page=1&pageSize=10', null, adminCookie);
  assert.equal(playerList.status, 200);
  assert.equal(playerList.data.total, 1);
  assert.equal(playerList.data.users[0].username, 'Player profile');

  const playerDetail = await api('GET', `/api/admin/users/${playerList.data.users[0].accountId}`, null, adminCookie);
  assert.equal(playerDetail.status, 200);
  assert.ok(Array.isArray(playerDetail.data.stats));
  assert.ok(Array.isArray(playerDetail.data.achievements));
  assert.equal(playerDetail.data.achievements.length > 0, true);

  const waiting = await api('GET', '/api/admin/users?migration=pending', null, adminCookie);
  assert.equal(waiting.status, 200);
  assert.equal(waiting.data.total, 1);
  assert.equal(waiting.data.users[0].kind, 'legacy');
  assert.equal(waiting.data.users[0].username, 'Waiting legacy');
  const waitingDetail = await api('GET', `/api/admin/legacy-profiles/${waiting.data.users[0].profileId}`, null, adminCookie);
  assert.equal(waitingDetail.status, 200);
  assert.equal(waitingDetail.data.migrationStatus, 'pending');

  const created = await api('POST', '/api/admin/users', { name: 'Panel Player' }, adminCookie);
  assert.equal(created.status, 201);
  assert.equal(created.data.role, 'player');
  assert.equal(created.data.mustChangePassword, true);
  assert.match(created.data.temporaryPassword, /^[A-Za-z0-9_-]{20}$/);
  const native = await api('GET', '/api/admin/users?migration=native&search=Panel', null, adminCookie);
  assert.equal(native.data.total, 1);
  assert.equal(native.data.users[0].migrationStatus, 'native');

  const audit = await api('GET', '/api/admin/audit', null, adminCookie);
  assert.equal(audit.status, 200);
  assert.equal(audit.data.entries[0].action, 'user.create');

  const login = await api('POST', '/api/auth/login', {
    username: 'Panel Player', password: created.data.temporaryPassword,
  });
  assert.equal(login.status, 200);
  const temporaryCookie = cookieFrom(login.response);
  const forcedState = await api('POST', '/api/auth/state', { clientId: 'admin-test' }, temporaryCookie);
  assert.equal(forcedState.data.session.mustChangePassword, true);
  assert.equal(forcedState.data.session.role, 'player');

  const changed = await api('POST', '/api/auth/change-temporary-password', {
    newPassword: 'permanent panel password',
  }, temporaryCookie);
  assert.equal(changed.status, 200);
  assert.equal(changed.data.recoveryCodes.length, 10);
  const changedState = await api('POST', '/api/auth/state', { clientId: 'admin-test' }, temporaryCookie);
  assert.equal(changedState.data.session.mustChangePassword, false);

  const resetStat = await api('POST', `/api/admin/users/${created.data.accountId}/reset-stat`, {
    path: 'stats.combat.kills',
  }, adminCookie);
  assert.equal(resetStat.status, 200);
  const resetGroup = await api('POST', `/api/admin/users/${created.data.accountId}/reset-stat`, {
    path: 'group:stats.combat',
  }, adminCookie);
  assert.equal(resetGroup.status, 200);
  const resetGlobal = await api('POST', '/api/admin/global-stats/reset', { path: 'factionWins.cleo' }, adminCookie);
  assert.equal(resetGlobal.status, 200);

  const promote = await api('PATCH', `/api/admin/users/${created.data.accountId}/role`, { role: 'admin' }, adminCookie);
  assert.equal(promote.status, 200);
  const promotedState = await api('POST', '/api/auth/state', { clientId: 'admin-test' }, temporaryCookie);
  assert.equal(promotedState.data.session.role, 'admin');

  const selfDelete = await api('DELETE', '/api/admin/users/1', null, adminCookie);
  assert.equal(selfDelete.status, 400);
  assert.equal(selfDelete.data.error, 'ADMIN_SELF_DELETE');

  const removed = await api('DELETE', `/api/admin/users/${created.data.accountId}`, null, adminCookie);
  assert.equal(removed.status, 204);
  const afterDelete = await api('POST', '/api/auth/login', {
    username: 'Panel Player', password: 'permanent panel password',
  });
  assert.equal(afterDelete.status, 401);

  console.log('ADMIN HTTP TESTS OK: RBAC, temporary passwords, resets and deletion are enforced');
} finally {
  await server.stop();
}

async function api(method, route, body, cookie = '') {
  const headers = { origin: server.origin };
  if (cookie) headers.cookie = cookie;
  if (body !== null) headers['content-type'] = 'application/json';
  const response = await fetch(`${server.origin}${route}`, {
    method, headers, body: body === null ? undefined : JSON.stringify(body), redirect: 'manual',
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  return { response, status: response.status, data };
}

function cookieFrom(response) {
  const value = response.headers.get('set-cookie') ?? '';
  const match = /^(vvc_session=[^;]+)/.exec(value);
  assert.ok(match, 'response contains a session cookie');
  return match[1];
}
