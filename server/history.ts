import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as lancedb from '@lancedb/lancedb';
import { Store, chunks } from './store.js';
import { BridgeError } from './errors.js';
import type { BridgeConfig, HistoryStatus, SearchHit } from './types.js';

const recordSchema = z.object({ id: z.string().min(1).max(256), project: z.string().min(1).max(1000), source: z.string().min(1).max(4000), lineStart: z.number().int().positive(), lineEnd: z.number().int().positive(), text: z.string().min(1).max(50_000) }).refine(r => r.lineEnd >= r.lineStart);
export type HistoryRecord = z.infer<typeof recordSchema>;
export interface Embedder { model: string; dimensions: number; embed(text: string): Promise<number[]> }
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

/** Deliberate data minimization, not a claim that every secret is detectable. */
export function redact(text: string): string {
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b/g, '[REDACTED TOKEN]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED JWT]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|token)["']?\s*[:=]\s*)"(?:\\.|[^"\\])*"/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|token)["']?\s*[:=]\s*)'(?:\\.|[^'\\])*'/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|token)["']?\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/g, '$1[REDACTED]@');
}

export function splitText(text: string): string[] {
  const chars = Array.from(text);
  const result: string[] = [];
  for (let pos = 0; pos < chars.length; pos += 420) {
    const part = chars.slice(pos, pos + 500).join('').trim();
    if (part) result.push(part);
    if (pos + 500 >= chars.length) break;
  }
  return result;
}

export class LocalEmbedder implements Embedder {
  readonly dimensions = 384;
  readonly model: string;
  private extractor?: Promise<any>;
  constructor(private config: BridgeConfig) { this.model = `${config.embeddingModel}:q8:mean-normalized:window96-overlap16:v1`; }
  async embed(text: string): Promise<number[]> {
    if (!this.extractor) this.extractor = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = join(this.config.dataDir, 'models');
      // Only model assets are downloaded; corpus/query text stays on-device.
      return pipeline('feature-extraction', this.config.embeddingModel, { dtype: 'q8', device: 'cpu' });
    })().catch(e => { this.extractor = undefined; throw e; });
    const extractor = await this.extractor;
    const tokenized = extractor.tokenizer.encode(text, { add_special_tokens: false });
    const ids: number[] = Array.from(tokenized as number[]);
    const vectors: number[][] = [];
    // Avoid silently truncating multilingual text at the model token limit.
    for (let i = 0; i < ids.length; i += 80) {
      const window = extractor.tokenizer.decode(ids.slice(i, i + 96), { skip_special_tokens: true });
      const output = await extractor(window, { pooling: 'mean', normalize: true });
      vectors.push(Array.from(output.data as Float32Array));
      if (i + 96 >= ids.length) break;
    }
    if (!vectors.length) throw new BridgeError('empty_embedding', 'No embeddable text remained.');
    const vector = Array.from({ length: this.dimensions }, (_, i) => vectors.reduce((sum, row) => sum + row[i], 0) / vectors.length);
    const norm = Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0));
    if (!norm || !vector.every(Number.isFinite)) throw new BridgeError('invalid_embedding', 'Local model returned an invalid vector.', 500);
    return vector.map(n => n / norm);
  }
}

export class History {
  private connection?: Promise<lancedb.Connection>;
  private embedding?: Promise<{ embedded: number }>;
  constructor(private store: Store, private config: BridgeConfig, private encoder: Embedder = new LocalEmbedder(config)) {}
  private async connect() {
    if (!this.connection) this.connection = (async () => {
      const dir = join(this.config.dataDir, 'vectors', hash(this.encoder.model).slice(0, 20));
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(join(dir, 'embedding-space.json'), JSON.stringify({ model: this.encoder.model, dimensions: this.encoder.dimensions }), { mode: 0o600 });
      return lancedb.connect(dir);
    })();
    return this.connection;
  }
  async importFile(path: string) {
    const file = await open(path, 'r');
    let data: string;
    try {
      const max = 10 * 1024 * 1024;
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > max) throw new BridgeError('import_too_large', 'Use a regular reviewed history selection of at most 10 MiB.');
      const buffer = Buffer.alloc(max + 1);
      let length = 0;
      while (length < buffer.length) {
        const read = await file.read(buffer, length, buffer.length - length, null);
        if (!read.bytesRead) break;
        length += read.bytesRead;
      }
      if (length > max) throw new BridgeError('import_too_large', 'History selection grew past the 10 MiB bound.');
      data = buffer.subarray(0, length).toString('utf8');
    } finally { await file.close(); }
    const records = data.split('\n').filter(Boolean).map(line => recordSchema.parse(JSON.parse(line)));
    if (records.length > 500) throw new BridgeError('import_too_many', 'Import at most 500 reviewed excerpts per invocation.');
    return this.importRecords(records);
  }
  importRecords(records: HistoryRecord[]) {
    let added = 0; let unchanged = 0;
    this.store.sqlite.transaction(() => {
      for (const raw of records) {
        const r = recordSchema.parse(raw);
        for (const value of [r.id, r.project, r.source]) {
          if (/[\r\n\0]/.test(value) || redact(value) !== value) throw new BridgeError('unsafe_provenance', 'History metadata contains unsafe credential-like content; review the selection first.');
        }
        const documentId = hash([r.project, r.source, r.lineStart, r.lineEnd, r.id].join('\0'));
        const pieces = splitText(redact(r.text));
        pieces.forEach((text, index) => {
          const id = hash(`${documentId}:${index}`);
          const contentHash = hash(text);
          const previous = this.store.db.select().from(chunks).where(eq(chunks.id, id)).get();
          if (previous?.contentHash === contentHash) { unchanged++; return; }
          this.store.db.insert(chunks).values({ id, documentId, text, contentHash, project: r.project, source: r.source, lineStart: r.lineStart, lineEnd: r.lineEnd, embeddedModel: null }).onConflictDoUpdate({ target: chunks.id, set: { text, contentHash, embeddedModel: null } }).run();
          this.store.sqlite.prepare('DELETE FROM history_fts WHERE id=?').run(id);
          this.store.sqlite.prepare('INSERT INTO history_fts(id,text,project) VALUES (?,?,?)').run(id, text, r.project);
          added++;
        });
        // Remove stale tail chunks when a reviewed excerpt is shortened.
        const existing = this.store.db.select({ id: chunks.id }).from(chunks).where(eq(chunks.documentId, documentId)).all();
        const wanted = new Set(pieces.map((_, i) => hash(`${documentId}:${i}`)));
        for (const item of existing) if (!wanted.has(item.id)) {
          this.store.db.delete(chunks).where(eq(chunks.id, item.id)).run();
          this.store.sqlite.prepare('DELETE FROM history_fts WHERE id=?').run(item.id);
        }
      }
    })();
    return { documentsReviewed: records.length, chunksAddedOrChanged: added, chunksUnchanged: unchanged, embedded: false };
  }
  async embedPending(): Promise<{ embedded: number }> {
    if (this.embedding) return this.embedding;
    this.embedding = this.performEmbedding().finally(() => { this.embedding = undefined; });
    return this.embedding;
  }
  private async performEmbedding() {
    const connection = await this.connect();
    const tables = await connection.tableNames();
    let table = tables.includes('chunks') ? await connection.openTable('chunks') : undefined;
    if (!table) this.store.db.update(chunks).set({ embeddedModel: null }).where(eq(chunks.embeddedModel, this.encoder.model)).run();
    const pending = this.store.db.select().from(chunks).where(sql`${chunks.embeddedModel} IS NULL OR ${chunks.embeddedModel} != ${this.encoder.model}`).all();
    let embedded = 0;
    for (const row of pending) {
      const vector = await this.encoder.embed(row.text);
      if (vector.length !== this.encoder.dimensions || !vector.every(Number.isFinite)) throw new BridgeError('embedding_dimension', 'Embedding space mismatch; refusing mixed vectors.', 500);
      const data = [{ id: row.id, vector, contentHash: row.contentHash, project: row.project }];
      if (!table) table = await connection.createTable('chunks', data);
      else await table.mergeInsert('id').whenMatchedUpdateAll().whenNotMatchedInsertAll().execute(data);
      const changed = this.store.db.update(chunks).set({ embeddedModel: this.encoder.model }).where(and(eq(chunks.id, row.id), eq(chunks.contentHash, row.contentHash))).run();
      if (changed.changes) embedded++;
      else {
        // A concurrent import changed the source while inference was running.
        // The just-written stale vector must not make its replacement look ready,
        // even if another embedding worker briefly finished that replacement.
        this.store.db.update(chunks).set({ embeddedModel: null }).where(eq(chunks.id, row.id)).run();
      }
    }
    return { embedded };
  }
  async status(): Promise<HistoryStatus> {
    const stats = this.store.sqlite.prepare('SELECT COUNT(*) AS chunks, COUNT(DISTINCT document_id) AS documents, COUNT(DISTINCT project) AS projects FROM history_chunks').get() as { chunks: number; documents: number };
    let embedded = this.store.db.select({ count: sql<number>`COUNT(*)` }).from(chunks).where(eq(chunks.embeddedModel, this.encoder.model)).get()!.count;
    if (embedded && !(await (await this.connect()).tableNames()).includes('chunks')) embedded = 0;
    const projects = this.store.sqlite.prepare('SELECT DISTINCT project FROM history_chunks ORDER BY project').all() as { project: string }[];
    return { documents: stats.documents, chunks: stats.chunks, embeddedChunks: embedded, projects: projects.map(p => p.project), model: this.encoder.model };
  }
  async read(id: string): Promise<SearchHit | null> {
    if (!/^[a-f0-9]{64}$/.test(id)) return null;
    const row = this.store.db.select().from(chunks).where(eq(chunks.id, id)).get();
    return row ? { id: row.id, text: row.text, project: row.project, source: row.source, lineStart: row.lineStart, lineEnd: row.lineEnd, score: 0, mode: 'keyword' } : null;
  }
  async search(input: { query: string; mode?: 'vector' | 'keyword'; limit?: number; project?: string }): Promise<SearchHit[]> {
    const { query, mode, limit, project } = z.object({ query: z.string().trim().min(1).max(1000), mode: z.enum(['vector', 'keyword']).default('keyword'), limit: z.number().int().min(1).max(20).default(8), project: z.string().max(1000).optional() }).parse(input);
    if (mode === 'keyword') {
      const tokens = query.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 30) ?? [];
      if (!tokens.length) return [];
      const match = tokens.map(t => `"${t}"`).join(' OR ');
      const rows = this.store.sqlite.prepare(`SELECT c.*, bm25(history_fts) AS rank FROM history_fts JOIN history_chunks c ON c.id=history_fts.id WHERE history_fts MATCH ? ${project ? 'AND c.project=?' : ''} ORDER BY rank LIMIT ?`).all(...(project ? [match, project, limit] : [match, limit])) as any[];
      return rows.map(r => ({ id: r.id, text: r.text, project: r.project, source: r.source, lineStart: r.line_start, lineEnd: r.line_end, score: -r.rank, mode: 'keyword' }));
    }
    if ((await this.status()).embeddedChunks === 0) throw new BridgeError('vectors_not_ready', 'No local embeddings yet. Run the explicit history embedding command first.', 409);
    const connection = await this.connect();
    const table = await connection.openTable('chunks');
    const vector = await this.encoder.embed(query);
    const hits: SearchHit[] = [];
    const batchSize = Math.max(20, limit * 4);
    for (let offset = 0; hits.length < limit; offset += batchSize) {
      let search = table.vectorSearch(vector).distanceType('cosine').offset(offset).limit(batchSize);
      if (project) search = search.where(`project = '${project.replaceAll("'", "''")}'`);
      const found = await search.toArray();
      for (const r of found) {
        const row = this.store.db.select().from(chunks).where(eq(chunks.id, String(r.id))).get();
        // SQLite provenance is authoritative; stale/deleted vector rows cannot leak.
        if (!row || row.contentHash !== r.contentHash || row.embeddedModel !== this.encoder.model) continue;
        hits.push({ id: row.id, text: row.text, project: row.project, source: row.source, lineStart: row.lineStart, lineEnd: row.lineEnd, score: 1 - Number(r._distance), mode: 'vector' });
        if (hits.length === limit) break;
      }
      if (found.length < batchSize) break;
    }
    return hits;
  }
}
