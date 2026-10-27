import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import WebSocket from 'ws';
import { SqliteProfileDatabase } from '../server/sqlite-profile-database.js';
import { startTestServer } from './test-server.mjs';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'vvc-migration-http-'));
const database = new SqliteProfileDatabase(path.join(dataDir, 'profiles.sqlite'));
database.replaceSnapshot({
  version: 4, nextProfileId: 8,
  profiles: [{
    clientId: 'browser-legacy-id', profileId: 7, name: 'Old Fighter', points: 12, playMs: 5000, seen: 4,
    killsAgainst: {}, deathsBy: {}, teamPlayMs: { cleo: 3000, viking: 2000 },
    stats: { matches: { played: 2 } }, achievements: { unlocked: {} },
  }],
}, { validate: true });
database.close();

let server;
try {
  server = await startTestServer({ dataDir });
  const httpUrl = server.url.replace(/^ws/, 'http');
  const pending = await post(httpUrl, '/api/auth/state', { clientId: 'browser-legacy-id' });
  assert.equal(pending.response.status, 200);
  assert.equal(pending.data.authenticated, false);
  assert.equal(pending.data.migration.profileId, 7);
  assert.equal(pending.data.migration.displayName, 'Old Fighter');

  const migrated = await post(httpUrl, '/api/auth/migrate', {
    clientId: 'browser-legacy-id', username: 'old.fighter', password: 'migration password 123',
  });
  assert.equal(migrated.response.status, 201);
  assert.equal(migrated.data.profileId, 7);
  assert.equal(migrated.data.recoveryCodes.length, 10);
  const setCookie = migrated.response.headers.get('set-cookie');
  assert.match(setCookie, /^vvc_session=[A-Za-z0-9_-]{43};/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.ok(!/Secure/.test(setCookie), 'plain HTTP development cookies are not marked Secure');
  const cookie = setCookie.split(';', 1)[0];

  const authenticated = await post(httpUrl, '/api/auth/state', { clientId: 'browser-legacy-id' }, cookie);
  assert.equal(authenticated.data.authenticated, true);
  assert.equal(authenticated.data.session.profileId, 7);
  assert.equal(authenticated.data.migration, null);

  const repeated = await post(httpUrl, '/api/auth/migrate', {
    clientId: 'browser-legacy-id', username: 'profile.thief', password: 'another migration password',
  });
  assert.equal(repeated.response.status, 409);
  assert.equal(repeated.data.error, 'LEGACY_PROFILE_UNAVAILABLE');

  assert.equal(await rejectedWebSocket(server.url, server.origin), 401,
    'the retired legacy identity cannot open an anonymous game connection');

  const identified = await identifyWithCookie(server.url, server.origin, cookie);
  assert.equal(identified.profileId, 7, 'the first session owns the unchanged profile ID');
  assert.equal(identified.name, 'Old Fighter', 'the account session keeps the profile display name');

  console.log('MIGRATION HTTP TESTS OK: blocking lookup, atomic claim, session cookie and profile ownership work end to end');
} finally {
  await server?.stop();
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function post(base, route, body, cookie = '') {
  const response = await fetch(`${base}${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

function identifyWithCookie(url, origin, cookie) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Origin: origin, Cookie: cookie } });
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('WebSocket migration test timed out')); }, 5000);
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.t === 'welcome') socket.send(JSON.stringify({ t: 'identify', name: 'Forged name', clientId: 'browser-legacy-id' }));
      if (message.t === 'identified') {
        clearTimeout(timer);
        socket.close();
        resolve(message);
      }
    });
    socket.on('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

function rejectedWebSocket(url, origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Origin: origin } });
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode);
    });
    socket.once('open', () => { socket.terminate(); reject(new Error('Anonymous WebSocket unexpectedly opened')); });
    socket.once('error', (error) => {
      if (!String(error.message).includes('Unexpected server response')) reject(error);
    });
  });
}
