import { loadConfig } from './config.js';
import { Store } from './store.js';
import { History } from './history.js';

const config = loadConfig();
const store = new Store(config.dataDir);
const history = new History(store, config);
try {
  const [command, arg, ...rest] = process.argv.slice(2);
  if (command === 'history-import' && arg) console.log(JSON.stringify(await history.importFile(arg)));
  else if (command === 'history-embed') console.log(JSON.stringify(await history.embedPending()));
  else if (command === 'history-status') console.log(JSON.stringify(await history.status()));
  else if (command === 'history-search' && arg) console.log(JSON.stringify(await history.search({ query: [arg, ...rest].join(' '), mode: 'vector' })));
  else { console.error('Usage: tsx server/cli.ts history-import <reviewed.jsonl> | history-embed | history-status | history-search <query>'); process.exitCode = 2; }
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof Error ? error.name : 'Error', message: 'History operation failed. Source files are unchanged; no remote upload was attempted.' }));
  process.exitCode = 1;
} finally { store.close(); }
