import { spawn } from 'node:child_process';
import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Every integration run owns its process, ephemeral port and profile directory.
// Never send malformed protocol probes to somebody's running game server.
export async function startTestServer({ timeScale = 1, dataDir: providedDataDir = '', env = {} } = {}) {
  const ownsDataDir = !providedDataDir;
  const dataDir = providedDataDir || await mkdtemp(path.join(os.tmpdir(), 'vvc-net-test-'));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, ...env, PORT: '0', VVC_DATA_DIR: dataDir, GAME_TIME_SCALE: String(timeScale) },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  child.stderr.on('data', (chunk) => { output += chunk; });
  const closed = new Promise((resolve) => child.once('close', resolve));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await closed;
    if (ownsDataDir) {
      // Only our own flat, freshly-created directory is removed.
      for (const name of await readdir(dataDir)) await unlink(path.join(dataDir, name));
      await rmdir(dataDir);
    }
  };
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Test server startup timeout: ${output}`)), 10000);
      const finish = (fn, value) => { clearTimeout(timer); fn(value); };
      child.once('error', (error) => finish(reject, error));
      child.once('exit', (code) => finish(reject, new Error(`Test server exited (${code}): ${output}`)));
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/\[SERVER\] Started on port (\d+)\./);
        if (match) finish(resolve, Number(match[1]));
      });
    });
    return { url: `ws://127.0.0.1:${port}`, dataDir, stop, output: () => output };
  } catch (error) {
    await stop();
    throw error;
  }
}
