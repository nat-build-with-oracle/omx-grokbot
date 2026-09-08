import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { Store } from './store.js';
import { SshGateway } from './remote.js';
import { History } from './history.js';
import { Bridge } from './core.js';
import { createApp } from './http.js';

process.umask(0o077);
const config = loadConfig();
const lock = join(config.dataDir, 'server.lock');
if (existsSync(lock)) {
  // Never auto-unlink a stale lock: another starter could already have replaced
  // it between inspection and deletion. An owner must verify a stopped process.
  throw new Error('Server lock exists. Confirm the recorded process has stopped before manually removing this lock.');
}
writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
const release = () => { if (existsSync(lock) && readFileSync(lock, 'utf8') === String(process.pid)) unlinkSync(lock); };
process.on('exit', release);
const store = new Store(config.dataDir);
store.recoverInterrupted();
const history = new History(store, config);
const bridge = new Bridge(store, new SshGateway(config.grokHost), history);
const http = createApp(config, bridge);
const server = http.app.listen(config.port, config.host, () => {
  console.error(`Grok Bot bridge: http://${config.host}:${config.port} (MCP issuer ${config.publicUrl})`);
  console.error('Owner/API credentials are in the private data/access.json file; no secret is printed.');
});
server.on('error', () => { console.error('Listener failed; no automatic restart or resend.'); process.exitCode = 1; void http.close().finally(() => { store.close(); release(); }); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  server.close(() => { void http.close().finally(() => { store.close(); release(); process.exit(); }); });
});
