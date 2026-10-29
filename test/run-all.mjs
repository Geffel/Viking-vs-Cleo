import { spawn } from 'node:child_process';
import { startTestServer } from './test-server.mjs';

const node = process.execPath;
const logicTests = [
  ['achievements', 'test/achievements.mjs'],
  ['hitreg', 'test/hitreg.mjs'],
  ['combat', 'test/combat.mjs'],
  ['abilities', 'test/abilities.mjs'],
  ['powerup', 'test/powerup.mjs'],
  ['platforms', 'test/platforms.mjs'],
  ['maps', 'test/maps.mjs'],
  ['matches', 'test/matches.mjs'],
  ['round-results', 'test/round-results.mjs'],
  ['ability-layout', 'test/ability-layout.mjs'],
  ['auth-ui', 'test/auth-ui.mjs'],
  ['sprite-assets', 'test/sprite-assets.mjs'],
  ['netcode', 'test/netcode.mjs'],
  ['server-protocol', 'test/server-protocol.mjs'],
  ['public-leaderboard', 'test/public-leaderboard.mjs'],
  ['round-stats', 'test/round-stats.mjs'],
  ['profile-kills', 'test/profile-kills.mjs'],
  ['profile-attribution', 'test/profile-attribution.mjs'],
  ['profile-boundaries', 'test/profile-boundaries.mjs'],
  ['sqlite-profile-store', 'test/sqlite-profile-store.mjs'],
  ['account-service', 'test/account-service.mjs'],
  ['profile-migration', 'test/profile-migration.mjs'],
  ['migration-http', 'test/migration-http.mjs'],
  ['auth-lifecycle-http', 'test/auth-lifecycle-http.mjs'],
];

const smokeScale = Number(process.env.SMOKE_TIME_SCALE || 10);

function runNode(name, script, env = {}) {
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn(node, [script], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      resolve({ name, code, stdout, stderr, ms: performance.now() - started });
    });
  });
}

function printResult(result) {
  console.log(`\n--- ${result.name} (${Math.round(result.ms)} ms) ---`);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

async function runSmoke() {
  let server;
  try {
    server = await startTestServer({ timeScale: smokeScale, authenticatedProfiles: ['Katten', 'Bjorn'] });
    return await runNode('smoke', 'test/smoke.mjs', {
      URL: server.url,
      AUTH_COOKIES: JSON.stringify(server.authCookies),
      SMOKE_TIME_SCALE: String(smokeScale),
    });
  } catch (error) {
    return {
      name: 'smoke',
      code: 1,
      stdout: server?.output() ?? '',
      stderr: `${error.stack || error.message}\n`,
      ms: 0,
    };
  } finally {
    await server?.stop();
  }
}

const started = performance.now();
console.log('Kor direkttester parallellt...');
const logicResults = await Promise.all(logicTests.map(([name, script]) => runNode(name, script)));
for (const result of logicResults) printResult(result);

const failedLogic = logicResults.filter((result) => result.code !== 0);
let smokeResult = null;
if (!failedLogic.length) {
  console.log('\nKor smoke-test med tillfallig testserver...');
  smokeResult = await runSmoke();
  printResult(smokeResult);
}

const results = smokeResult ? [...logicResults, smokeResult] : logicResults;
const failed = results.filter((result) => result.code !== 0);
console.log(`\nKlart pa ${(performance.now() - started).toFixed(0)} ms.`);

if (failed.length) {
  console.error(`TEST MISSLYCKADES: ${failed.map((result) => result.name).join(', ')}`);
  process.exit(1);
}

console.log('ALLA TESTER OK');
