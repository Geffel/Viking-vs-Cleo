import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export const PASSWORD_HASH_VERSION = 1;
export const SCRYPT_PARAMS = Object.freeze({ N: 131072, r: 8, p: 1, keylen: 64, maxmem: 256 * 1024 * 1024 });
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 90 * 24 * 60 * 60 * 1000;
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function normalizeUsername(value) {
  if (typeof value !== 'string') throw authError('INVALID_USERNAME', 'Username must be a string');
  const display = value.trim();
  const normalized = display.toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(normalized)) {
    throw authError('INVALID_USERNAME', 'Username must be 3-32 characters using letters, numbers, dot, dash or underscore');
  }
  return { display, normalized };
}

export function validatePassword(value) {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) {
    throw authError('INVALID_PASSWORD', 'Password must be valid Unicode text');
  }
  const length = [...value].length;
  if (length < 12 || length > 128) {
    throw authError('INVALID_PASSWORD', 'Password must contain 12-128 Unicode characters');
  }
  return value;
}

export function validateDisplayName(value) {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) {
    throw authError('INVALID_DISPLAY_NAME', 'Fighter name must be valid Unicode text');
  }
  const displayName = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (![...displayName].length || [...displayName].length > 14) {
    throw authError('INVALID_DISPLAY_NAME', 'Fighter name must contain 1-14 characters');
  }
  return displayName;
}

export async function hashPassword(password, salt = randomBytes(16)) {
  validatePassword(password);
  const derived = await derive(password, salt, SCRYPT_PARAMS);
  return `v${PASSWORD_HASH_VERSION}$scrypt$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p},k=${SCRYPT_PARAMS.keylen}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  validatePassword(password);
  const parsed = parsePasswordHash(encoded);
  if (!parsed) return { valid: false, needsUpgrade: false };
  const actual = await derive(password, parsed.salt, parsed);
  return {
    valid: actual.length === parsed.digest.length && timingSafeEqual(actual, parsed.digest),
    needsUpgrade: parsed.version !== PASSWORD_HASH_VERSION || !sameParams(parsed, SCRYPT_PARAMS),
  };
}

export function generateSessionToken() { return randomBytes(32).toString('base64url'); }
export function hashSessionToken(token) { return sha256(requireToken(token)); }
export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => randomBytes(16).toString('hex'));
}
export function hashRecoveryCode(code) {
  if (typeof code !== 'string' || !/^[a-f0-9]{32}$/.test(code)) return null;
  return sha256(code);
}
export function accountLogKey(normalizedUsername) { return sha256(`account:${normalizedUsername}`); }

export function authError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw authError('INVALID_SESSION', 'Invalid session');
  }
  return token;
}

function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }

function derive(password, salt, params) {
  return scrypt(password, salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: SCRYPT_PARAMS.maxmem });
}

function parsePasswordHash(encoded) {
  if (typeof encoded !== 'string') return null;
  const match = /^v(\d+)\$scrypt\$N=(\d+),r=(\d+),p=(\d+),k=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(encoded);
  if (!match) return null;
  const parsed = {
    version: Number(match[1]), N: Number(match[2]), r: Number(match[3]), p: Number(match[4]), keylen: Number(match[5]),
    salt: Buffer.from(match[6], 'base64url'), digest: Buffer.from(match[7], 'base64url'),
  };
  if (!parsed.N || !parsed.r || !parsed.p || !parsed.keylen || parsed.salt.length < 16 || parsed.digest.length !== parsed.keylen) return null;
  return parsed;
}

function sameParams(a, b) {
  return a.N === b.N && a.r === b.r && a.p === b.p && a.keylen === b.keylen;
}

function hasUnpairedSurrogate(value) {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}
