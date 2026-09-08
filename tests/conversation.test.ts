import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, createApiClient, type FetchLike } from '../client/api.js';
import { activeOperation, conversationReducer, createConversationController, initialConversationState } from '../client/conversation.js';
import type { MessageRun } from '../server/types.js';

const ID = 'cb8a8dfd-bf40-4c98-8bc5-b509a44443c3';
const ID2 = '52ca5542-5285-41f5-af32-484e1ee71084';
const AGENT = 'test-agent-a';
const PROMPT = 'A deliberately synthetic test prompt';
const CSRF = 'synthetic-csrf-not-a-real-secret';

function run(status: MessageRun['status'], overrides: Partial<MessageRun> = {}): MessageRun {
  return {
    id: ID, agentId: AGENT, agentName: 'Test agent', prompt: PROMPT, marker: 'TEST_MARKER_12345',
    afterRowid: 8, status, reply: status === 'reply_recorded' ? 'A verified synthetic reply' : null,
    requestId: status === 'reply_recorded' ? 'test-request-1' : null, error: null,
    createdAt: '2026-09-08T00:00:00Z', updatedAt: '2026-09-08T00:00:01Z', ...overrides,
  };
}

function ready() {
  const controller = createConversationController();
  controller.dispatch({ type: 'select_agent', agentId: AGENT });
  controller.dispatch({ type: 'edit_draft', agentId: AGENT, prompt: PROMPT });
  return controller;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('reducer edits are immutable and preparing requires a selected agent/nonblank draft', () => {
  const initial = initialConversationState();
  const edited = conversationReducer(initial, { type: 'edit_draft', agentId: AGENT, prompt: PROMPT });
  assert.deepEqual(initial.drafts, {});
  assert.equal(edited.drafts[AGENT], PROMPT);
  assert.equal(conversationReducer(edited, { type: 'prepare', messageId: ID }), edited);
  const selected = conversationReducer(initial, { type: 'select_agent', agentId: AGENT });
  assert.equal(conversationReducer(selected, { type: 'prepare', messageId: ID }), selected);
  assert.throws(() => conversationReducer(selected, { type: 'prepare', messageId: 'not-a-uuid' }), /UUID/);
});

test('manual preparation captures one stable UUID/prompt, and synchronous submit suppresses double clicks', () => {
  const controller = ready();
  assert.equal(controller.prepare(ID), true);
  assert.equal(activeOperation(controller.getState())?.phase, 'prepared');
  const command = controller.submit();
  assert.deepEqual(command, { type: 'send', input: { messageId: ID, agentId: AGENT, prompt: PROMPT } });
  assert.equal(controller.submit(), null);
  assert.equal(controller.prepareAndSubmit(ID2), null);
  assert.equal(activeOperation(controller.getState())?.messageId, ID);
  assert.equal(activeOperation(controller.getState())?.phase, 'sending');
});

test('acceptance and pending are not recorded replies and do not discard the draft', () => {
  const controller = ready();
  controller.prepareAndSubmit(ID);
  controller.dispatch({ type: 'receive', messageId: ID, run: run('accepted') });
  assert.equal(activeOperation(controller.getState())?.phase, 'accepted');
  assert.equal(controller.getState().drafts[AGENT], PROMPT);
  controller.dispatch({ type: 'receive', messageId: ID, run: run('reply_pending') });
  assert.equal(activeOperation(controller.getState())?.phase, 'pending');
  assert.equal(controller.getState().drafts[AGENT], PROMPT);
  assert.equal(controller.submit(), null);
});

test('unknown delivery retains UUID and draft; retry can only produce a read-side verify command', () => {
  const controller = ready();
  controller.prepareAndSubmit(ID);
  controller.dispatch({ type: 'send_unknown', messageId: ID });
  assert.equal(activeOperation(controller.getState())?.phase, 'uncertain');
  assert.equal(controller.getState().drafts[AGENT], PROMPT);
  assert.equal(controller.submit(), null);
  assert.equal(controller.prepareAndSubmit(ID2), null);
  assert.deepEqual(controller.verify(), { type: 'verify', messageId: ID });
  assert.equal(controller.verify(), null);
  controller.dispatch({ type: 'verify_failed', messageId: ID });
  assert.equal(activeOperation(controller.getState())?.phase, 'uncertain');
  assert.deepEqual(controller.verify(), { type: 'verify', messageId: ID });
  assert.equal(controller.submit(), null);
  assert.equal(controller.getState().drafts[AGENT], PROMPT);
});

test('verified output clears only an unchanged submitted draft and late responses cannot downgrade it', () => {
  const controller = ready();
  controller.prepareAndSubmit(ID);
  controller.dispatch({ type: 'receive', messageId: ID, run: run('reply_recorded') });
  assert.equal(activeOperation(controller.getState())?.phase, 'recorded');
  assert.equal(controller.getState().drafts[AGENT], '');
  controller.dispatch({ type: 'receive', messageId: ID, run: run('accepted') });
  controller.dispatch({ type: 'send_unknown', messageId: ID });
  assert.equal(activeOperation(controller.getState())?.phase, 'recorded');
  assert.equal(controller.verify(), null);
});

test('draft edits and agent switches while waiting do not lose either draft', () => {
  const controller = ready();
  controller.prepareAndSubmit(ID);
  controller.dispatch({ type: 'edit_draft', agentId: AGENT, prompt: 'The next unsent draft' });
  controller.dispatch({ type: 'select_agent', agentId: 'test-agent-b' });
  controller.dispatch({ type: 'edit_draft', agentId: 'test-agent-b', prompt: 'Another agent draft' });
  controller.dispatch({ type: 'receive', messageId: ID, run: run('reply_recorded') });
  assert.equal(controller.getState().selectedAgentId, 'test-agent-b');
  assert.equal(controller.getState().drafts[AGENT], 'The next unsent draft');
  assert.equal(controller.getState().drafts['test-agent-b'], 'Another agent draft');
});

test('a mismatched result cannot replace the original operation or draft', () => {
  const controller = ready();
  controller.prepareAndSubmit(ID);
  controller.dispatch({ type: 'receive', messageId: ID, run: run('reply_recorded', { id: ID2 }) });
  assert.equal(activeOperation(controller.getState())?.phase, 'uncertain');
  assert.equal(activeOperation(controller.getState())?.messageId, ID);
  assert.equal(controller.getState().drafts[AGENT], PROMPT);
});

test('restoring a server-prepared operation never emits a send, only explicit verification', () => {
  const controller = ready();
  controller.dispatch({ type: 'restore', run: run('prepared') });
  assert.equal(controller.submit(), null);
  assert.equal(controller.prepareAndSubmit(ID2), null);
  assert.deepEqual(controller.verify(), { type: 'verify', messageId: ID });
});

test('the HTTP client confines CSRF to memory, uses same-origin credentials and never adds Bearer auth', async () => {
  const calls: { path: string; init: RequestInit }[] = [];
  const fetcher: FetchLike = async (input, init) => {
    const path = String(input); calls.push({ path, init: init ?? {} });
    if (path === '/api/login') return json({ authenticated: true, csrfToken: CSRF });
    if (path === '/api/logout') return json({ authenticated: false });
    return json(run('accepted'));
  };
  const client = createApiClient(fetcher);
  assert.deepEqual(await client.login('synthetic-owner-secret'), { authenticated: true });
  await client.send({ messageId: ID, agentId: AGENT, prompt: PROMPT });
  assert.equal(new Headers(calls[0].init.headers).has('X-CSRF-Token'), false);
  assert.equal(new Headers(calls[1].init.headers).get('X-CSRF-Token'), CSRF);
  for (const call of calls) {
    assert.equal(call.init.credentials, 'same-origin');
    assert.equal(call.init.redirect, 'error');
    assert.equal(new Headers(call.init.headers).has('Authorization'), false);
    assert.equal(new Headers(call.init.headers).has('Origin'), false); // Browser supplies its own Origin.
  }
  await client.logout();
  await assert.rejects(client.send({ messageId: ID2, agentId: AGENT, prompt: PROMPT }), (error: unknown) => error instanceof ApiError && error.code === 'csrf_missing');
  assert.equal(calls.length, 3);
});

test('session restores memory-only CSRF; unknown successful send response preserves ID/draft and causes no retry', async () => {
  let sends = 0;
  const client = createApiClient(async (input) => {
    if (String(input) === '/api/session') return json({ authenticated: true, csrfToken: CSRF });
    sends += 1;
    return json({ accepted: true }); // Not the MessageRun HTTP contract.
  });
  const controller = ready();
  await client.session();
  const command = controller.prepareAndSubmit(ID);
  assert.equal(command?.type, 'send');
  if (command?.type !== 'send') throw new Error('Expected explicit send command');
  await assert.rejects(client.send(command.input), (error: unknown) => error instanceof ApiError && error.code === 'invalid_response');
  controller.dispatch({ type: 'send_unknown', messageId: ID });
  assert.equal(sends, 1);
  assert.equal(controller.getState().drafts[AGENT], PROMPT);
  assert.equal(activeOperation(controller.getState())?.messageId, ID);
  assert.deepEqual(controller.verify(), { type: 'verify', messageId: ID });
  assert.equal(controller.submit(), null);
  assert.equal(sends, 1); // Pure commands do not themselves execute network requests.
});

test('aborted/failed send is not retried and raw transport exception details are not exposed', async () => {
  let sends = 0;
  const client = createApiClient(async (input) => {
    if (String(input) === '/api/session') return json({ authenticated: true, csrfToken: CSRF });
    sends += 1; throw new Error('PRIVATE transport detail that must not be copied');
  });
  await client.session();
  await assert.rejects(client.send({ messageId: ID, agentId: AGENT, prompt: PROMPT }), (error: unknown) =>
    error instanceof ApiError && error.code === 'network_error' && !error.message.includes('PRIVATE'));
  assert.equal(sends, 1);
});

test('typed route wrappers validate bodies, path-encode IDs and distinguish missing history from transport errors', async () => {
  const calls: { path: string; init: RequestInit }[] = [];
  const hit = { id: 'doc/one', text: 'Synthetic history', project: 'tests', source: 'fixture', lineStart: 1, lineEnd: 2, score: 0.4, mode: 'vector' };
  const fetcher: FetchLike = async (input, init) => {
    const path = String(input); calls.push({ path, init: init ?? {} });
    if (path === '/api/session') return json({ authenticated: true, csrfToken: CSRF });
    if (path === '/api/agents') return json({ agents: [{ agentId: AGENT, name: 'Test agent' }], health: { ok: true } });
    if (path === '/api/messages') return json([run('accepted')]);
    if (path.endsWith('/verify')) return json(run('reply_recorded'));
    if (path === '/api/history/status') return json({ documents: 1, chunks: 1, embeddedChunks: 1, model: 'fixture', projects: ['tests'] });
    if (path === '/api/history/search') return json([hit]);
    if (path === '/api/history/doc%2Fone') return json(hit);
    return json({ error: { code: 'not_found', message: 'No matching history record.' } }, 404);
  };
  const client = createApiClient(fetcher);
  await client.session();
  assert.equal((await client.agents()).agents[0].agentId, AGENT);
  assert.equal((await client.messages())[0].id, ID);
  assert.equal((await client.verify(ID)).status, 'reply_recorded');
  assert.equal((await client.historyStatus()).embeddedChunks, 1);
  assert.deepEqual(await client.search({ query: 'synthetic', mode: 'vector', limit: 5, project: 'tests' }), [hit]);
  assert.deepEqual(await client.readHistory('doc/one'), hit);
  assert.equal(await client.readHistory('missing'), null);
  const search = calls.find((call) => call.path === '/api/history/search');
  assert.deepEqual(JSON.parse(String(search?.init.body)), { query: 'synthetic', mode: 'vector', limit: 5, project: 'tests' });
  assert.equal(new Headers(search?.init.headers).get('X-CSRF-Token'), CSRF);
});

test('a late session response cannot restore CSRF after logout', async () => {
  const pending = deferred<Response>();
  let sessionCount = 0;
  const client = createApiClient(async (input) => {
    if (String(input) === '/api/session') return ++sessionCount === 1 ? json({ authenticated: true, csrfToken: CSRF }) : pending.promise;
    if (String(input) === '/api/logout') return json({ authenticated: false });
    throw new Error('No further network call expected');
  });
  await client.session();
  const oldSession = client.session();
  await client.logout();
  pending.resolve(json({ authenticated: true, csrfToken: CSRF }));
  await oldSession;
  await assert.rejects(client.verify(ID), (error: unknown) => error instanceof ApiError && error.code === 'csrf_missing');
});

test('a stale unauthorized read cannot clear a newer login token', async () => {
  const oldRead = deferred<Response>();
  const client = createApiClient(async (input, init) => {
    if (String(input) === '/api/agents') return oldRead.promise;
    if (String(input) === '/api/login') return json({ authenticated: true, csrfToken: CSRF });
    assert.equal(new Headers(init?.headers).get('X-CSRF-Token'), CSRF);
    return json(run('reply_recorded'));
  });
  const stale = client.agents();
  await client.login('synthetic-owner-secret');
  oldRead.resolve(json({ error: { code: 'unauthorized', message: 'Sign in required.' } }, 401));
  await assert.rejects(stale, (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal((await client.verify(ID)).status, 'reply_recorded');
});

test('creation client uses session CSRF, normalizes names and keeps operation IDs across verification', async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const created = { operationId: ID, agentId: 'new-agent', name: 'New bot', description: '', status: 'verified' };
  const client = createApiClient(async (input, init) => {
    const path = String(input); calls.push({ path, init });
    if (path === '/api/session') return json({ authenticated: true, csrfToken: CSRF });
    if (path === '/api/agent-creations') return json([created]);
    return json(created);
  });
  await assert.rejects(client.createAgent({ operationId: ID, name: 'New bot' }), (e: unknown) => e instanceof ApiError && e.code === 'csrf_missing');
  assert.equal(calls.length, 0);
  await client.session();
  assert.equal((await client.createAgent({ operationId: ID, name: ' New bot ' })).operationId, ID);
  const post = calls.find(c => c.path === '/api/agents')!;
  assert.equal(new Headers(post.init?.headers).get('X-CSRF-Token'), CSRF);
  assert.deepEqual(JSON.parse(String(post.init?.body)), { operationId: ID, name: 'New bot', description: '' });
  assert.deepEqual(await client.creations(), [created]);
  assert.equal((await client.verifyCreation(ID)).status, 'verified');
  assert.equal(calls.filter(c => c.path === '/api/agents').length, 1);
  assert.equal(calls.at(-1)?.path, `/api/agent-creations/${ID}/verify`);
});

test('creation client rejects mismatched and malformed success responses without retrying', async () => {
  let posts = 0;
  const client = createApiClient(async (input) => {
    if (String(input) === '/api/session') return json({ authenticated: true, csrfToken: CSRF });
    posts++;
    return json({ operationId: ID2, name: 'New', description: '', agentId: 'an-id', status: 'verified' });
  });
  await client.session();
  await assert.rejects(client.createAgent({ operationId: ID, name: 'New' }), (e: unknown) => e instanceof ApiError && e.code === 'invalid_response');
  assert.equal(posts, 1);
  await assert.rejects(client.verifyCreation(ID), (e: unknown) => e instanceof ApiError && e.code === 'invalid_response');
  assert.equal(posts, 2);
});
