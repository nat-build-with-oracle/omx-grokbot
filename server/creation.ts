import { z } from 'zod';
import type { Store } from './store.js';
import type { RemoteGateway } from './remote.js';
import { BridgeError } from './errors.js';

export const creationInput = z.object({ operationId: z.uuid(), name: z.string().trim().min(1).max(120), description: z.string().max(4000).default('') }).strict();
export interface CreationRun {
  operationId: string; name: string; description: string; agentId: string | null;
  status: 'creation_uncertain' | 'created_unverified' | 'verified';
}
/** Reserve before network I/O. A timeout or restart never authorizes another POST. */
export class Creations {
  constructor(private store: Store, private remote: RemoteGateway) {
    store.sqlite.exec('CREATE TABLE IF NOT EXISTS agent_creations (id TEXT PRIMARY KEY, body TEXT NOT NULL)');
  }
  get(id: string): CreationRun {
    z.uuid().parse(id);
    const row = this.store.sqlite.prepare('SELECT body FROM agent_creations WHERE id=?').get(id) as { body: string } | undefined;
    if (!row) throw new BridgeError('not_found', 'Creation operation not found.', 404);
    return JSON.parse(row.body);
  }
  list(): CreationRun[] {
    return (this.store.sqlite.prepare('SELECT body FROM agent_creations ORDER BY rowid DESC LIMIT 100').all() as { body: string }[]).map(row => JSON.parse(row.body));
  }
  private save(run: CreationRun) {
    this.store.sqlite.prepare('UPDATE agent_creations SET body=? WHERE id=?').run(JSON.stringify(run), run.operationId);
    return run;
  }
  async create(raw: z.input<typeof creationInput>): Promise<CreationRun> {
    const input = creationInput.parse(raw);
    const initial: CreationRun = { ...input, agentId: null, status: 'creation_uncertain' };
    const claim = this.store.sqlite.prepare('INSERT OR IGNORE INTO agent_creations VALUES (?,?)').run(input.operationId, JSON.stringify(initial));
    if (!claim.changes) {
      const existing = this.get(input.operationId);
      if (existing.name !== input.name || existing.description !== input.description) throw new BridgeError('creation_id_conflict', 'Operation ID belongs to another profile.', 409);
      return existing;
    }
    try {
      const response = await this.remote.run(['create-agent', '--operation-id', input.operationId, '--name', input.name, '--description', input.description]);
      const event = response.events.find(e => e.action === 'create-agent' && e.operationId === input.operationId);
      if (response.exitCode !== 0 || event?.httpStatus !== 200 || !z.uuid().safeParse(event.agentId).success) return initial;
      this.save({ ...initial, agentId: event.agentId, status: 'created_unverified' });
      return await this.verify(input.operationId);
    } catch { return this.get(input.operationId); }
  }
  async verify(id: string): Promise<CreationRun> {
    const run = this.get(id);
    if (!run.agentId || run.status === 'verified') return run;
    try {
      const response = await this.remote.run(['verify-agent', '--agent-id', run.agentId, '--expected-name', run.name]);
      const event = response.events.find(e => e.action === 'verify-agent');
      if (response.exitCode === 0 && event?.verified === true && event.agentId === run.agentId && event.name === run.name) return this.save({ ...run, status: 'verified' });
    } catch { /* Verification is read-only; never resend creation. */ }
    return this.get(id);
  }
}
