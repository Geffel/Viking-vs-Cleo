import { parentPort, workerData } from 'node:worker_threads';
import { SqliteProfileDatabase } from './sqlite-profile-database.js';

const database = new SqliteProfileDatabase(workerData.filePath);
parentPort.on('message', ({ id, type, snapshot }) => {
  try {
    let result = null;
    if (type === 'load') result = database.load();
    else if (type === 'save') database.replaceSnapshot(snapshot);
    else if (type === 'checkpoint') result = database.checkpoint();
    else if (type === 'close') { database.checkpoint(); database.close(); }
    else throw new Error(`Unknown profile worker command: ${type}`);
    parentPort.postMessage({ id, result });
    if (type === 'close') process.exit(0);
  } catch (error) {
    parentPort.postMessage({ id, error: error.stack || error.message });
  }
});
