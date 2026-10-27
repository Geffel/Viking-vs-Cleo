import { parentPort, workerData } from 'node:worker_threads';
import { AccountDatabase } from './account-database.js';
import {
  accountLogKey, authError, generateRecoveryCodes, generateSessionToken, hashPassword,
  hashRecoveryCode, hashSessionToken, normalizeUsername, validatePassword, verifyPassword,
} from './auth-crypto.js';
import { hashLegacyClientId } from './profile-snapshot.js';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const GENERIC_LOGIN_MESSAGE = 'Fel anvandarnamn eller losenord';
const database = new AccountDatabase(workerData.filePath);
let queue = Promise.resolve();

parentPort.on('message', (message) => {
  queue = queue.then(() => handle(message)).catch(() => {});
});

async function handle({ id, type, payload = {} }) {
  try {
    let result;
    if (type === 'register') result = await register(payload);
    else if (type === 'login') result = await login(payload);
    else if (type === 'verifySession') result = database.resolveSession(hashSessionToken(payload.token), payload.now);
    else if (type === 'logout') result = database.revokeSession(hashSessionToken(payload.token), payload.now);
    else if (type === 'logoutAll') result = database.revokeAllSessions(payload.accountId, payload.now);
    else if (type === 'resetPassword') result = await resetPassword(payload);
    else if (type === 'regenerateRecoveryCodes') result = await regenerateRecoveryCodes(payload);
    else if (type === 'findLegacyProfile') result = findLegacyProfile(payload);
    else if (type === 'migrateLegacyProfile') result = await migrateLegacyProfile(payload);
    else if (type === 'cleanupSessions') result = database.cleanupSessions(payload.now);
    else if (type === 'close') { database.close(); result = true; }
    else throw authError('UNKNOWN_COMMAND', `Unknown account worker command: ${type}`);
    parentPort.postMessage({ id, result });
  } catch (error) {
    parentPort.postMessage({ id, error: { code: error.code || 'AUTH_ERROR', message: error.message } });
  }
}

function findLegacyProfile({ clientId }) {
  requireLegacyClientId(clientId);
  return database.findPendingLegacyProfile(hashLegacyClientId(clientId));
}

async function migrateLegacyProfile({ clientId, name, password, now }) {
  requireLegacyClientId(clientId);
  const names = normalizeUsername(name);
  validatePassword(password);
  const recoveryCodes = generateRecoveryCodes();
  const token = generateSessionToken();
  const result = database.completeLegacyMigration({
    clientIdHash: hashLegacyClientId(clientId),
    usernameNormalized: names.normalized,
    usernameDisplay: names.display,
    passwordHash: await hashPassword(password),
    recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
    tokenHash: hashSessionToken(token),
    now,
  });
  return { ...result, recoveryCodes, token };
}

async function register({ name, password, now }) {
  const names = normalizeUsername(name);
  validatePassword(password);
  const passwordHash = await hashPassword(password);
  const recoveryCodes = generateRecoveryCodes();
  const token = generateSessionToken();
  const result = database.createAccount({ usernameNormalized: names.normalized, usernameDisplay: names.display,
    passwordHash, recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
    tokenHash: hashSessionToken(token), now });
  return { ...result, recoveryCodes, token };
}

async function login({ username, password, sourceIp, now }) {
  let names;
  try { names = normalizeUsername(username); } catch { names = { normalized: String(username || '').trim().toLowerCase() }; }
  let candidatePassword = password;
  let validPasswordInput = true;
  try { validatePassword(password); } catch { candidatePassword = 'invalid input placeholder'; validPasswordInput = false; }
  const accountKey = accountLogKey(names.normalized);
  const limit = database.loginLimit({ accountKey, sourceIp, cutoff: now - LOGIN_WINDOW_MS, accountMax: 5, ipMax: 25 });
  if (limit.limited) throw authError('LOGIN_RATE_LIMITED', GENERIC_LOGIN_MESSAGE);
  const account = database.findAccount(names.normalized);
  const encoded = account?.password_hash ?? dummyPasswordHash;
  const checked = await verifyPassword(candidatePassword, encoded);
  if (!validPasswordInput || !account || account.status !== 'active' || !checked.valid) {
    database.recordLoginFailure({ accountKey, sourceIp, now });
    throw authError('INVALID_CREDENTIALS', GENERIC_LOGIN_MESSAGE);
  }
  const token = generateSessionToken();
  const upgradedHash = checked.needsUpgrade ? await hashPassword(password) : null;
  const publicAccount = database.completeLogin({ account, accountKey, passwordHash: upgradedHash,
    tokenHash: hashSessionToken(token), now });
  return { account: publicAccount, token };
}

async function resetPassword({ username, recoveryCode, newPassword, now }) {
  const names = normalizeUsername(username);
  validatePassword(newPassword);
  const account = database.findAccount(names.normalized);
  const codeHash = hashRecoveryCode(recoveryCode);
  if (!account || !codeHash) throw authError('INVALID_RECOVERY', 'Invalid username or recovery code');
  database.resetPassword({ accountId: Number(account.account_id), codeHash, passwordHash: await hashPassword(newPassword), now });
  return true;
}

async function regenerateRecoveryCodes({ accountId, currentPassword, now }) {
  validatePassword(currentPassword);
  const account = database.findAccountById(accountId);
  if (!account || account.status !== 'active' || !(await verifyPassword(currentPassword, account.password_hash)).valid) {
    throw authError('INVALID_CREDENTIALS', GENERIC_LOGIN_MESSAGE);
  }
  const recoveryCodes = generateRecoveryCodes();
  database.replaceRecoveryCodes({ accountId, recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode), now });
  return recoveryCodes;
}

// Unknown accounts still perform the same scrypt work. The digest deliberately
// does not correspond to a usable password, while its format and cost are real.
const dummyPasswordHash = `v1$scrypt$N=131072,r=8,p=1,k=64$AAAAAAAAAAAAAAAAAAAAAA$${'A'.repeat(86)}`;

function requireLegacyClientId(clientId) {
  if (typeof clientId !== 'string' || !clientId.length || clientId.length > 80) {
    throw authError('INVALID_LEGACY_ID', 'Invalid legacy profile identity');
  }
}
