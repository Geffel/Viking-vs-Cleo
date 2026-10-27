import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';

export class AccountService {
  constructor({ dataDir, fileName = 'profiles.sqlite', now = Date.now } = {}) {
    if (!dataDir) throw new TypeError('AccountService requires dataDir');
    this.filePath = path.join(dataDir, fileName);
    this.now = now;
    this.worker = null;
    this.requests = new Map();
    this.nextId = 1;
    this.closed = false;
  }

  async open() {
    if (this.worker) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    this.worker = new Worker(new URL('./account-worker.js', import.meta.url), { workerData: { filePath: this.filePath } });
    this.worker.on('message', (message) => this.#settle(message));
    this.worker.on('error', (error) => this.#failAll(error));
    this.worker.on('exit', (code) => {
      if (!this.closed) this.#failAll(new Error(`Account worker exited before closing (code ${code})`));
    });
  }

  register(username, password) { return this.#request('register', { username, password, now: this.now() }); }
  login(username, password, sourceIp) {
    const safeIp = typeof sourceIp === 'string' && sourceIp.length <= 64 ? sourceIp : 'unknown';
    return this.#request('login', { username, password, sourceIp: safeIp, now: this.now() });
  }
  verifySession(token) { return this.#request('verifySession', { token, now: this.now() }); }
  logout(token) { return this.#request('logout', { token, now: this.now() }); }
  logoutAll(accountId) { return this.#request('logoutAll', { accountId, now: this.now() }); }
  resetPassword(username, recoveryCode, newPassword) {
    return this.#request('resetPassword', { username, recoveryCode, newPassword, now: this.now() });
  }
  regenerateRecoveryCodes(accountId, currentPassword) {
    return this.#request('regenerateRecoveryCodes', { accountId, currentPassword, now: this.now() });
  }
  findLegacyProfile(clientId) { return this.#request('findLegacyProfile', { clientId }); }
  migrateLegacyProfile(clientId, username, password) {
    return this.#request('migrateLegacyProfile', { clientId, username, password, now: this.now() });
  }
  cleanupSessions() { return this.#request('cleanupSessions', { now: this.now() }); }

  async close() {
    if (this.closed) return;
    await this.#request('close');
    this.closed = true;
    await this.worker.terminate();
  }

  #request(type, payload = {}) {
    if (!this.worker) return Promise.reject(new Error('Account service is not open'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.requests.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }

  #settle({ id, result, error }) {
    const request = this.requests.get(id);
    if (!request) return;
    this.requests.delete(id);
    if (error) {
      const failure = new Error(error.message);
      failure.code = error.code;
      request.reject(failure);
    } else request.resolve(result);
  }

  #failAll(error) {
    for (const request of this.requests.values()) request.reject(error);
    this.requests.clear();
  }
}
