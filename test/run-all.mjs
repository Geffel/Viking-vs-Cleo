import { spawn } from 'node:child_process';
import net from 'node:net';

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
];

const smokeScale = Number(process.env.SMOKE_TIME_SCALE || 10);

function runNode(name, script, env = {}) {
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn(node, [script], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
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

function waitForPort(port, child, timeoutMs = 5000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (child.exitCode !== null) {
        reject(new Error(`testservern stangdes innan den hann starta (kod ${child.exitCode})`));
        return;
      }
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) reject(new Error(`testservern svarade inte pa port ${port}`));
        else setTimeout(tryConnect, 50);
      });
    };
    tryConnect();
  });
}

async function runSmoke() {
  const port = Number(process.env.TEST_PORT || 3100 + Math.floor(Math.random() * 1000));
  const server = spawn(node, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      GAME_TIME_SCALE: String(smokeScale),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOut = '';
  let serverErr = '';
  server.stdout.on('data', (chunk) => {
    serverOut += chunk;
  });
  server.stderr.on('data', (chunk) => {
    serverErr += chunk;
  });

  try {
    await waitForPort(port, server);
    return await runNode('smoke', 'test/smoke.mjs', {
      URL: `ws://127.0.0.1:${port}`,
      SMOKE_TIME_SCALE: String(smokeScale),
    });
  } catch (error) {
    return {
      name: 'smoke',
      code: 1,
      stdout: serverOut,
      stderr: `${serverErr}${error.stack || error.message}\n`,
      ms: 0,
    };
  } finally {
    if (server.exitCode === null) server.kill();
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
