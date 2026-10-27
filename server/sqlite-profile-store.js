import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { mkdir } from 'node:fs/promises';

export class SqliteProfileStore {
  constructor({ dataDir, fileName = 'profiles.sqlite', maxPendingSnapshots = 2 } = {}) {
    if (!dataDir) throw new TypeError('SqliteProfileStore requires dataDir');
    this.filePath = path.join(dataDir, fileName);
    this.maxPendingSnapshots = maxPendingSnapshots;
    this.worker = null;
    this.nextId = 1;
    this.requests = new Map();
    this.inFlightSave = null;
    this.pendingSnapshot = null;
    this.lastError = null;
    this.closed = false;
  }

  async open() {
    if (this.worker) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    this.worker = new Worker(new URL('./sqlite-profile-worker.js', import.meta.url), { workerData: { filePath: this.filePath } });
    this.worker.on('message', (message) => this.#settle(message));
    this.worker.on('error', (error) => this.#failAll(error));
    this.worker.on('exit', (code) => { if (!this.closed && code) this.#failAll(new Error(`Profile worker exited with code ${code}`)); });
    await this.#request('checkpoint');
  }

  load() { return this.#request('load'); }

  save(snapshot) {
    if (this.closed) return false;
    // Absolute snapshots make coalescing safe: the newest state subsumes older
    // queued state and cannot double-apply counters after a retry.
    this.pendingSnapshot = snapshot;
    if (!this.inFlightSave) this.#startNextSave();
    return true;
  }

  async flush() {
    while (this.inFlightSave || this.pendingSnapshot) {
      if (!this.inFlightSave) this.#startNextSave();
      await this.inFlightSave;
    }
    if (this.lastError) throw this.lastError;
  }

  async close() {
    if (this.closed) return;
    await this.flush();
    await this.#request('close');
    this.closed = true;
    await this.worker.terminate();
  }

  get status() { return { busy: !!this.inFlightSave, pending: this.pendingSnapshot ? 1 : 0, lastError: this.lastError?.message ?? null }; }

  #startNextSave() {
    if (!this.pendingSnapshot || this.inFlightSave) return;
    const snapshot = this.pendingSnapshot;
    this.pendingSnapshot = null;
    this.inFlightSave = this.#saveWithRetry(snapshot)
      .then((result) => { this.lastError = null; return result; })
      .catch((error) => { this.lastError = error; throw error; })
      .finally(() => { this.inFlightSave = null; if (this.pendingSnapshot) this.#startNextSave(); });
    // Save is deliberately fire-and-observe from the game loop.
    this.inFlightSave.catch(() => {});
  }

  async #saveWithRetry(snapshot) {
    const delays = [0, 50, 200];
    let lastError;
    for (const delay of delays) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      try { return await this.#request('save', snapshot); }
      catch (error) { lastError = error; }
    }
    throw lastError;
  }

  #request(type, snapshot) {
    if (!this.worker) return Promise.reject(new Error('Profile store is not open'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.requests.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, snapshot });
    });
  }

  #settle({ id, result, error }) {
    const request = this.requests.get(id);
    if (!request) return;
    this.requests.delete(id);
    if (error) request.reject(new Error(error)); else request.resolve(result);
  }

  #failAll(error) {
    this.lastError = error;
    for (const request of this.requests.values()) request.reject(error);
    this.requests.clear();
  }
}
