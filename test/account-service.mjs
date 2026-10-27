import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { AccountService } from '../server/account-service.js';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, SESSION_TOUCH_INTERVAL_MS } from '../server/auth-crypto.js';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'vvc-accounts-'));
let now = 1_800_000_000_000;
let service = new AccountService({ dataDir, now: () => now });

try {
  await service.open();
  const registered = await service.register('  Test.Player  ', 'correct horse battery', 'Test Fighter');
  assert.deepEqual(registered.account, { accountId: 1, username: 'Test.Player', status: 'active' });
  assert.equal(registered.profileId, 1);
  assert.equal(registered.displayName, 'Test Fighter');
  assert.match(registered.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(registered.recoveryCodes.length, 10);
  assert.equal(new Set(registered.recoveryCodes).size, 10);
  assert.ok(registered.recoveryCodes.every((code) => /^[a-f0-9]{32}$/.test(code)));

  const db = new DatabaseSync(path.join(dataDir, 'profiles.sqlite'), { readOnly: true });
  const stored = db.prepare('SELECT username_normalized, password_hash FROM accounts').get();
  assert.equal(stored.username_normalized, 'test.player');
  assert.match(stored.password_hash, /^v1\$scrypt\$N=131072,r=8,p=1,k=64\$/);
  assert.ok(!stored.password_hash.includes('correct horse battery'));
  assert.equal(db.prepare('SELECT count(*) AS count FROM recovery_codes').get().count, 10);
  const storedProfile = db.prepare('SELECT profile_id, account_id, display_name FROM profiles').get();
  assert.equal(storedProfile.profile_id, 1);
  assert.equal(storedProfile.account_id, 1);
  assert.equal(storedProfile.display_name, 'Test Fighter');
  db.close();

  await assert.rejects(service.register('TEST.PLAYER', 'a different password'), hasCode('USERNAME_TAKEN'));
  await assert.rejects(service.register('no spaces', 'a different password'), hasCode('INVALID_USERNAME'));
  await assert.rejects(service.register('valid_name', 'too short'), hasCode('INVALID_PASSWORD'));
  await assert.rejects(service.register('another.name', 'a different password', ''), hasCode('INVALID_DISPLAY_NAME'));

  await assert.rejects(service.login('test.player', 'this password is wrong', '10.0.0.1'), hasCode('INVALID_CREDENTIALS'));
  await assert.rejects(service.login('missing.player', 'this password is wrong', '10.0.0.1'), hasCode('INVALID_CREDENTIALS'));
  await assert.rejects(service.login('test.player', 'short', '10.0.0.1'), hasCode('INVALID_CREDENTIALS'));
  const login = await service.login('TEST.PLAYER', 'correct horse battery', '10.0.0.1');
  assert.equal(login.account.accountId, 1);
  assert.match(login.token, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(await service.verifySession(login.token), { accountId: 1, username: 'Test.Player', status: 'active', profileId: 1 });
  const secretsDb = new DatabaseSync(path.join(dataDir, 'profiles.sqlite'), { readOnly: true });
  assert.equal(secretsDb.prepare('SELECT count(*) AS count FROM sessions WHERE token_hash = ?').get(login.token).count, 0);
  assert.equal(secretsDb.prepare('SELECT count(*) AS count FROM recovery_codes WHERE code_hash = ?').get(registered.recoveryCodes[0]).count, 0);
  assert.equal(secretsDb.prepare("SELECT count(*) AS count FROM login_failures WHERE source_ip = '10.0.0.1'").get().count, 3,
    'a successful login resets the account window without resetting the IP window');
  secretsDb.close();
  assert.equal(await service.logout(registered.token), true);

  now += SESSION_TOUCH_INTERVAL_MS;
  assert.ok(await service.verifySession(login.token), 'active sessions survive a touch');
  now += SESSION_IDLE_MS - 1;
  assert.ok(await service.verifySession(login.token), 'the touch extends the inactivity deadline');
  now += SESSION_IDLE_MS;
  assert.equal(await service.verifySession(login.token), null, 'inactive sessions expire');

  now = 1_800_000_000_000;
  const allDeviceA = await service.login('test.player', 'correct horse battery', '10.0.0.2');
  const allDeviceB = await service.login('test.player', 'correct horse battery', '10.0.0.3');
  assert.equal(await service.logoutAll(1), 3);
  assert.equal(await service.verifySession(allDeviceA.token), null);
  assert.equal(await service.verifySession(allDeviceB.token), null);

  const resetSession = await service.login('test.player', 'correct horse battery', '10.0.0.4');
  await service.resetPassword('test.player', registered.recoveryCodes[0], 'a brand new password');
  assert.equal(await service.verifySession(resetSession.token), null, 'password reset revokes every session');
  await assert.rejects(service.resetPassword('test.player', registered.recoveryCodes[0], 'another secure password'), hasCode('INVALID_RECOVERY'));
  await assert.rejects(service.login('test.player', 'correct horse battery', '10.0.0.4'), hasCode('INVALID_CREDENTIALS'));
  const afterReset = await service.login('test.player', 'a brand new password', '10.0.0.4');

  const replacementCodes = await service.regenerateRecoveryCodes(1, 'a brand new password');
  assert.equal(replacementCodes.length, 10);
  await assert.rejects(service.resetPassword('test.player', registered.recoveryCodes[1], 'unused but obsolete pass'), hasCode('INVALID_RECOVERY'));
  assert.equal(await service.logout(afterReset.token), true);
  assert.equal(await service.verifySession(afterReset.token), null);

  now += 20 * 60 * 1000;
  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(service.login('test.player', 'still the wrong password', '10.0.0.5'), hasCode('INVALID_CREDENTIALS'));
  }
  await service.close();
  service = new AccountService({ dataDir, now: () => now });
  await service.open();
  await assert.rejects(service.login('test.player', 'a brand new password', '10.0.0.5'), hasCode('LOGIN_RATE_LIMITED'));
  now += 15 * 60 * 1000 + 1;
  const afterLimit = await service.login('test.player', 'a brand new password', '10.0.0.5');

  now += SESSION_ABSOLUTE_MS;
  assert.equal(await service.verifySession(afterLimit.token), null, 'absolute lifetime is never extended by activity');
  assert.ok(await service.cleanupSessions() > 0);

  console.log('ACCOUNT SERVICE TESTS OK: credentials, rate limits, recovery and session lifetimes are enforced');
} finally {
  await service.close().catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
}

function hasCode(code) {
  return (error) => error?.code === code;
}
