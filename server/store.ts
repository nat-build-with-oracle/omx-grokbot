import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BridgeError } from './errors.js';
import type { MessageRun } from './types.js';

export const runs = sqliteTable('message_runs', {
  id: text('id').primaryKey(), agentId: text('agent_id').notNull(), agentName: text('agent_name').notNull(),
  prompt: text('prompt').notNull(), marker: text('marker').notNull().unique(), afterRowid: integer('after_rowid'),
  status: text('status').notNull(), reply: text('reply'), requestId: text('request_id'), error: text('error'),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
export const chunks = sqliteTable('history_chunks', {
  id: text('id').primaryKey(), documentId: text('document_id').notNull(), project: text('project').notNull(),
  source: text('source').notNull(), lineStart: integer('line_start').notNull(), lineEnd: integer('line_end').notNull(),
  text: text('text').notNull(), contentHash: text('content_hash').notNull(), embeddedModel: text('embedded_model'),
});

export class Store {
  readonly sqlite: Database.Database;
  readonly db;
  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const path = join(dataDir, 'bridge.sqlite');
    this.sqlite = new Database(path);
    chmodSync(path, 0o600);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('busy_timeout = 5000');
    if (Number(this.sqlite.pragma('user_version', { simple: true })) > 1) { this.sqlite.close(); throw new Error('Database schema is newer than this bridge.'); }
    this.sqlite.exec(`CREATE TABLE IF NOT EXISTS message_runs (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, agent_name TEXT NOT NULL, prompt TEXT NOT NULL,
      marker TEXT NOT NULL UNIQUE, after_rowid INTEGER, status TEXT NOT NULL, reply TEXT, request_id TEXT,
      error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS runs_agent_status ON message_runs(agent_id,status);
      CREATE TABLE IF NOT EXISTS history_chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, project TEXT NOT NULL,
      source TEXT NOT NULL,line_start INTEGER NOT NULL,line_end INTEGER NOT NULL,text TEXT NOT NULL,
      content_hash TEXT NOT NULL,embedded_model TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(id UNINDEXED,text,project UNINDEXED);
      PRAGMA user_version = 1;`);
    this.db = drizzle(this.sqlite);
  }
  recoverInterrupted() {
    // Called only by the exclusively locked server, not by CLI readers/importers.
    this.db.update(runs).set({ status: 'delivery_uncertain', error: 'Process restarted; verify the original message. Do not resend.', updatedAt: new Date().toISOString() }).where(eq(runs.status, 'sending')).run();
    this.db.update(runs).set({ status: 'failed', error: 'Process stopped before the durable send intent. No POST was started.', updatedAt: new Date().toISOString() }).where(eq(runs.status, 'prepared')).run();
  }
  get(id: string): MessageRun | undefined { return this.db.select().from(runs).where(eq(runs.id, id)).get() as MessageRun | undefined; }
  list(): MessageRun[] { return this.db.select().from(runs).orderBy(desc(runs.createdAt)).limit(100).all() as MessageRun[]; }
  create(input: MessageRun): { run: MessageRun; created: boolean } {
    return this.sqlite.transaction(() => {
      const existing = this.get(input.id);
      if (existing) {
        if (existing.agentId !== input.agentId || existing.prompt !== input.prompt) throw new BridgeError('message_id_conflict', 'This message ID belongs to different content.', 409);
        return { run: existing, created: false };
      }
      const pending = this.db.select({ id: runs.id }).from(runs).where(and(eq(runs.agentId, input.agentId), inArray(runs.status, ['prepared', 'sending', 'accepted', 'reply_pending', 'delivery_uncertain']))).get();
      if (pending) throw new BridgeError('agent_has_pending_message', 'Verify the existing pending message before sending another to this agent.', 409);
      this.db.insert(runs).values(input).run();
      return { run: input, created: true };
    }).immediate();
  }
  update(id: string, patch: Partial<Omit<MessageRun, 'id'>>): MessageRun {
    return this.sqlite.transaction(() => {
      const current = this.get(id);
      if (!current) throw new BridgeError('not_found', 'Message not found.', 404);
      if (current.status === 'reply_recorded' || current.status === 'failed') return current;
      const rank: Record<MessageRun['status'], number> = { prepared: 0, sending: 1, accepted: 2, delivery_uncertain: 2, reply_pending: 3, reply_recorded: 4, failed: 4 };
      if (patch.status && rank[patch.status] < rank[current.status]) return current;
      this.db.update(runs).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(runs.id, id)).run();
      return this.get(id)!;
    }).immediate();
  }
  close() { this.sqlite.close(); }
}
