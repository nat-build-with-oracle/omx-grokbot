import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { History, redact, splitText, type Embedder } from '../server/history.js';
import type { BridgeConfig } from '../server/types.js';

// Explicit synthetic encoder: tests storage/correlation, NOT semantic quality.
const encoder: Embedder = { model: 'fixture-encoder-v1', dimensions: 3, async embed(text) { return text.includes('vector') ? [1, 0, 0] : [0, 1, 0]; } };
function fixture() {
  const dataDir = mkdtempSync(join(tmpdir(), 'grokbot-history-'));
  const store = new Store(dataDir);
  const config = { dataDir, embeddingModel: 'fixture' } as BridgeConfig;
  const history = new History(store, config, encoder);
  return { store, history, config, dataDir, close: () => { store.close(); rmSync(dataDir, { recursive: true, force: true }); } };
}
const record = { id: 'synthetic-1', project: 'fixture-project', source: '/Users/example/history/session.jsonl', lineStart: 2, lineEnd: 4, text: 'Use LanceDB vector embeddings with source pointers.' };
test('import is idempotent, source-linked, redacted, and does not embed implicitly', async () => {
  const f = fixture(); try {
    assert.equal(f.history.importRecords([record]).chunksAddedOrChanged, 1);
    assert.equal(f.history.importRecords([record]).chunksUnchanged, 1);
    assert.equal((await f.history.status()).embeddedChunks, 0);
    const hits = await f.history.search({ query: 'LanceDB', mode: 'keyword' });
    assert.equal(hits.length, 1); assert.equal(hits[0].source, record.source); assert.equal(hits[0].lineStart, 2);
    assert.equal((await f.history.search({ query: 'LanceDB', project: 'other' })).length, 0);
    assert.equal((await f.history.read(hits[0].id))?.text, record.text);
    await assert.rejects(f.history.search({ query: 'vector', mode: 'vector' }), /No local embeddings/);
  } finally { f.close(); }
});
test('real LanceDB stores synthetic fixture vectors and refuses stale changed content', async () => {
  const f = fixture(); try {
    f.history.importRecords([record, { ...record, id: 'other', project: 'other', text: 'SQLite relational database.' }]);
    assert.equal((await f.history.embedPending()).embedded, 2);
    const hits = await f.history.search({ query: 'vector', mode: 'vector', project: 'fixture-project' });
    assert.equal(hits.length, 1); assert.equal(hits[0].text, record.text); assert.equal(hits[0].mode, 'vector');
    f.history.importRecords([{ ...record, text: 'Changed source now has no previous content.' }]);
    assert.equal((await f.history.search({ query: 'vector', mode: 'vector', project: 'fixture-project' })).length, 0);
    assert.equal((await f.history.embedPending()).embedded, 1);
    assert.equal((await f.history.status()).embeddedChunks, 2);
  } finally { f.close(); }
});
test('model identity isolates vector spaces even with equal dimensions', async () => {
  const f = fixture(); try {
    f.history.importRecords([record]); await f.history.embedPending();
    const other = new History(f.store, f.config, { ...encoder, model: 'different-fixture-model' });
    assert.equal((await other.status()).embeddedChunks, 0);
    await assert.rejects(other.search({ query: 'vector', mode: 'vector' }), /No local embeddings/);
    assert.equal((await other.embedPending()).embedded, 1);
    assert.equal((await other.search({ query: 'vector', mode: 'vector' })).length, 1);
  } finally { f.close(); }
});
test('redaction catches representative secrets and chunks Unicode without broken surrogate pairs', () => {
  const raw = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345\napi_key=sk-12345678901234567890\nhttps://user:privatepassword@example.com\n-----BEGIN PRIVATE KEY-----\nsecret-data\n-----END PRIVATE KEY-----';
  const safe = redact(raw);
  for (const secret of ['abcdefghijklmnopqrstuvwxyz012345', 'sk-12345678901234567890', 'privatepassword', 'secret-data']) assert.ok(!safe.includes(secret));
  for (const value of ['password="two short words"', "password='longpasswordword another secret suffix'", 'secret=longpasswordword suffix']) {
    const result = redact(value);
    assert.ok(!result.includes('short')); assert.ok(!result.includes('longpasswordword')); assert.ok(!result.includes('suffix'));
  }
  assert.ok(splitText('ไทย🔎'.repeat(300)).every(text => !text.includes('\uFFFD') && Array.from(text).length <= 500));
});
test('concurrent import during embedding remains dirty instead of falsely becoming ready', async () => {
  const f = fixture(); try {
    let finish!: () => void;
    let started!: () => void;
    const ready = new Promise<void>(r => { started = r; });
    const gate = new Promise<void>(r => { finish = r; });
    const h = new History(f.store, f.config, { ...encoder, async embed() { started(); await gate; return [1, 0, 0]; } });
    h.importRecords([record]);
    const running = h.embedPending(); await ready;
    h.importRecords([{ ...record, text: 'Updated vector corpus while inference was pending.' }]);
    finish(); assert.equal((await running).embedded, 0);
    assert.equal((await h.status()).embeddedChunks, 0);
    assert.equal((await h.embedPending()).embedded, 1);
  } finally { f.close(); }
});
test('retired vector candidates cannot starve a live result after an excerpt shrinks', async () => {
  const f = fixture(); try {
    f.history.importRecords([{ ...record, text: 'vector details '.repeat(900) }]);
    await f.history.embedPending();
    f.history.importRecords([{ ...record, text: 'SQLite retained explanation.' }]);
    await f.history.embedPending();
    const hits = await f.history.search({ query: 'vector', mode: 'vector', limit: 1 });
    assert.equal(hits.length, 1); assert.equal(hits[0].text, 'SQLite retained explanation.');
  } finally { f.close(); }
});
test('missing vector store is detected and explicit embedding rebuilds from provenance', async () => {
  const f = fixture(); try {
    f.history.importRecords([record]); await f.history.embedPending();
    rmSync(join(f.dataDir, 'vectors'), { recursive: true, force: true });
    const restored = new History(f.store, f.config, encoder);
    assert.equal((await restored.status()).embeddedChunks, 0);
    assert.equal((await restored.embedPending()).embedded, 1);
    assert.equal((await restored.search({ query: 'vector', mode: 'vector' })).length, 1);
  } finally { f.close(); }
});
