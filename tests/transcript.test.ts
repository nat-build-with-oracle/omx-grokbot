import test from 'node:test';
import assert from 'node:assert/strict';
import { readTranscript } from '../server/transcript.js';
import { createApiClient } from '../client/api.js';
import { visibleTranscript } from '../client/transcript.js';
import { createConversationController } from '../client/conversation.js';
import type { TranscriptEntry, TranscriptPage, MessageRun } from '../server/types.js';

const aid = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const entry = (rowid: number, extra: Partial<TranscriptEntry> = {}): TranscriptEntry => ({ rowid, role: 'user', content: 'Earlier text', timestamp: null, requestId: null, clientNonce: null, contentTruncated: false, isStreaming: false, ...extra });
const page = (extra: Partial<TranscriptPage> = {}): TranscriptPage => ({ agentId: aid, name: 'Fixture', entries: [entry(20)], hasMore: true, nextBeforeRowid: 15, ...extra });

test('transcript reads only the selected agent and bounded earlier cursor', async () => {
  const calls: string[][] = [];
  const result = await readTranscript({ async run(args) { calls.push(args); return { exitCode: 0, events: [{ action: 'history', ...page() }] }; } }, aid, 30);
  assert.equal(result.entries[0].rowid, 20);
  assert.deepEqual(calls, [['history', '--agent-id', aid, '--limit', '50', '--before-rowid', '30']]);
});

test('invalid history inputs fail before SSH', async () => {
  let calls = 0;
  const remote = { async run() { calls++; return { exitCode: 0, events: [] }; } };
  await assert.rejects(readTranscript(remote, '../../secret'));
  await assert.rejects(readTranscript(remote, aid, 0));
  await assert.rejects(readTranscript(remote, aid, Number.MAX_SAFE_INTEGER + 1));
  assert.equal(calls, 0);
});

test('history rejects other agents, backwards cursors, unordered rows and failed transport', async () => {
  for (const invalid of [page({ agentId: other }), page({ nextBeforeRowid: 40 }), page({ entries: [entry(25), entry(20)] }), page({ hasMore: false })]) {
    await assert.rejects(readTranscript({ async run() { return { exitCode: 0, events: [{ action: 'history', ...invalid }] }; } }, aid, 30));
  }
  await assert.rejects(readTranscript({ async run() { return { exitCode: 1, events: [{ action: 'history', ...page() }] }; } }, aid));
});

test('client history is an abortable GET without write payload or CSRF requirement', async () => {
  let captured: { url: string; init?: RequestInit } | undefined;
  const api = createApiClient(async (url, init) => { captured = { url: String(url), init }; return Response.json(page()); });
  const abort = new AbortController();
  await api.transcript(aid, 30, { signal: abort.signal });
  assert.equal(captured?.url, `/api/agents/${aid}/transcript?before=30`);
  assert.equal(captured?.init?.method, 'GET');
  assert.equal(captured?.init?.body, undefined);
  assert.equal(captured?.init?.signal, abort.signal);
});

test('client rejects mismatched history and invalid pagination', async () => {
  const api = createApiClient(async () => Response.json(page({ agentId: other })));
  await assert.rejects(api.transcript(aid));
  await assert.rejects(api.transcript(aid, -1));
});

test('history deduplication requires selected-agent correlation, not similar text', () => {
  const run: MessageRun = { id: other, agentId: aid, agentName: 'Fixture', prompt: 'Hello', marker: 'GB_fixture_marker', afterRowid: 9, status: 'accepted', reply: null, requestId: null, error: null, createdAt: '2026-09-08T00:00:00Z', updatedAt: '2026-09-08T00:00:00Z' };
  const controller = createConversationController(); controller.dispatch({ type: 'restore', run });
  const operations = Object.values(controller.getState().operations);
  const exact = entry(10, { content: `Hello\n\n[Bridge correlation: ${run.marker}]`, clientNonce: run.marker, requestId: 'ours' });
  const rows = [entry(8, { content: 'Hello' }), exact, entry(11, { role: 'assistant', content: 'Reply', requestId: 'ours' }), entry(12, { content: exact.content })];
  assert.deepEqual(visibleTranscript(aid, rows, operations).map(e => e.rowid), [8, 12]);
  assert.equal(visibleTranscript(other, rows, operations).length, 4);
  assert.equal(visibleTranscript(aid, [entry(8, { ...exact, rowid: 8 })], operations).length, 1);
});
