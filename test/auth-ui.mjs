import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../public/js/main.js', import.meta.url), 'utf8');

assert.doesNotMatch(html, /id="intro"|id="intro-form"|id="intro-name"/,
  'the retired Enter name screen is absent');
assert.match(html, /id="migration-register-name"/,
  'registration has one player-name field');
assert.match(html, /id="migration-forgot-password"/,
  'sign-in exposes password recovery');
assert.match(html, /id="migration-password-reset"[\s\S]*id="migration-reset-code"[\s\S]*id="migration-reset-password-confirm"/,
  'password recovery collects a recovery code and confirms the new password');
assert.doesNotMatch(html, /migration-register-display-name|migration-register-username/,
  'registration does not split login and fighter names');
assert.match(html, /id="migration-username"[^>]*readonly/,
  'the legacy player name starts locked');
assert.match(html, /id="migration-kicker"[^>]*hidden[^>]*>Profile upgrade</,
  'the profile-upgrade label starts hidden for ordinary sign-in');
assert.match(main, /setMigrationPresentation\(false\);[\s\S]*migrationTitle\.textContent = 'Sign in';/,
  'ordinary sign-in uses the minimal non-migration presentation');
assert.match(main, /pendingLegacyMigration = true;[\s\S]*setMigrationPresentation\(true\);/,
  'the profile-upgrade presentation is enabled only for a legacy migration');
assert.match(main, /currentName = state\.session\.username;[\s\S]*setView\('lobby'\);[\s\S]*return true;/,
  'an authenticated session routes directly to the lobby');
assert.doesNotMatch(main, /function submitName\(|setView\('intro'\)/,
  'the client no longer routes through Enter name');
assert.match(main, /authRequest\('\/api\/auth\/reset-password',[\s\S]*recoveryCode:[\s\S]*newPassword:/,
  'password recovery submits the recovery code and new password');
assert.ok(
  main.indexOf('const renderFrameSamples = []') < main.indexOf('const netDebug = initNetDebug(NET_DEBUG)'),
  'performance frame metrics exist before the eagerly enabled debug panel samples them',
);

console.log('AUTH UI TESTS OK: one player name, locked migration name and direct lobby routing');
