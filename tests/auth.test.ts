import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import express from 'express';
import { createAuth } from '../server/auth.js';
import { createBridgeMcp } from '../server/mcp.js';
import type { BridgeApi, BridgeConfig } from '../server/types.js';

const SECRET = 'test-owner-secret-not-a-production-value';
const API_TOKEN = 'test-static-token-not-a-production-value';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const challenge = (s: string) => createHash('sha256').update(s).digest('base64url');
async function fixture() {
  const dataDir = mkdtempSync(join(tmpdir(), 'grokbot-auth-test-'));
  const app = express();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const config: BridgeConfig = { host: '127.0.0.1', port: address.port, publicUrl: origin, dataDir,
    ownerSecret: SECRET, apiToken: API_TOKEN, grokHost: 'unused', historyHost: 'unused', embeddingModel: 'unused',
    allowedHosts: [`127.0.0.1:${address.port}`, `localhost:${address.port}`] };
  let auth = createAuth(config);
  let sends = 0;
  const api: BridgeApi = {
    creations: () => [],
    createAgent: async input => ({ ...input, description: input.description ?? '', agentId: null, status: 'creation_uncertain' }),
    verifyCreation: async () => { throw new Error('not mocked'); },
    agents: async () => ({ agents: [], health: { available: true } }),
    send: async input => {
      sends++;
      return { id: input.messageId, agentId: input.agentId, agentName: 'fixture', prompt: input.prompt,
        marker: 'fixture', afterRowid: 0, status: 'accepted', reply: null, requestId: null, error: null,
        createdAt: 'fixture', updatedAt: 'fixture' };
    },
    verify: async () => { throw new Error('unused'); }, messages: () => [],
    search: async () => [], readHistory: async () => null,
    historyStatus: async () => ({ documents: 0, chunks: 0, embeddedChunks: 0, projects: [], model: 'fixture' }),
  };
  const mcp = createBridgeMcp(api);
  app.use(express.json());
  app.use((req, res, next) => auth.router(req, res, next));
  app.all('/owner', (req, res, next) => auth.requireOwner(req, res, next), (_req, res) => { res.json({ owner: true }); });
  app.all('/check', (req, res, next) => auth.requireMcp(req, res, next), (_req, res) => { res.json({ accepted: true }); });
  app.all('/mcp', (req, res, next) => auth.requireMcp(req, res, next), mcp);
  const request = (path: string, options: RequestInit = {}) => fetch(origin + path, { redirect: 'manual', ...options });
  const form = (path: string, body: Record<string, string>, headers: Record<string, string> = {}) => request(path, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(body),
  });
  const inspect = () => new Database(join(dataDir, 'oauth.sqlite'));
  async function register() {
    const res = await request('/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      client_name: 'Test client', redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    }) });
    assert.equal(res.status, 201, await res.clone().text());
    return (await res.json()) as { client_id: string };
  }
  async function begin(scope = 'bridge:read') {
    const { client_id } = await register();
    const verifier = randomBytes(32).toString('base64url');
    const params = new URLSearchParams({ client_id, redirect_uri: CALLBACK, response_type: 'code',
      code_challenge: challenge(verifier), code_challenge_method: 'S256', resource: `${origin}/mcp`, scope, state: 'state-fixture' });
    const res = await request(`/authorize?${params}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('location'), null);
    const html = await res.text();
    const ticket = html.match(/name="ticket" value="([^"]+)"/)?.[1];
    assert(ticket);
    const cookie = res.headers.get('set-cookie')!.split(';')[0];
    return { client_id, verifier, ticket, cookie, html };
  }
  async function approve(pending: Awaited<ReturnType<typeof begin>>) {
    const res = await form('/oauth/approve', { ticket: pending.ticket, secret: SECRET, approve: 'yes' }, { Origin: origin, Cookie: pending.cookie });
    assert.equal(res.status, 303, await res.clone().text());
    const callback = new URL(res.headers.get('location')!);
    assert.equal(callback.origin + callback.pathname, CALLBACK);
    assert.equal(callback.searchParams.get('iss'), `${origin}/`);
    assert.equal(callback.searchParams.get('state'), 'state-fixture');
    return callback.searchParams.get('code')!;
  }
  function exchange(pending: Awaited<ReturnType<typeof begin>>, code: string, overrides: Record<string, string> = {}) {
    return form('/token', { grant_type: 'authorization_code', client_id: pending.client_id, code,
      code_verifier: pending.verifier, redirect_uri: CALLBACK, resource: `${origin}/mcp`, ...overrides });
  }
  async function grant(scope = 'bridge:read') {
    const pending = await begin(scope);
    const code = await approve(pending);
    const res = await exchange(pending, code);
    assert.equal(res.status, 200, await res.clone().text());
    const tokens = await res.json() as { access_token: string; refresh_token: string; expires_in: number; scope: string };
    return { ...pending, ...tokens, code };
  }
  return { origin, config, request, form, inspect, register, begin, approve, exchange, grant, sends: () => sends,
    restart() { auth.close(); auth = createAuth(config); },
    async close() { await mcp.close(); await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); auth.close(); rmSync(dataDir, { recursive: true, force: true }); },
  };
}

test('discovery publishes exact resource, supported PKCE and public-client auth', async () => {
  const f = await fixture();
  try {
    const unauth = await f.request('/check');
    assert.equal(unauth.status, 401);
    assert.match(unauth.headers.get('www-authenticate')!, /oauth-protected-resource\/mcp/);
    assert.match(unauth.headers.get('www-authenticate')!, /scope="bridge:read bridge:write"/);
    const metadata = await (await f.request('/.well-known/oauth-protected-resource/mcp')).json();
    assert.equal(metadata.resource, `${f.origin}/mcp`);
    const as = await (await f.request('/.well-known/oauth-authorization-server')).json();
    assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
    assert.deepEqual(as.token_endpoint_auth_methods_supported, ['none']);
    assert.equal(as.client_id_metadata_document_supported, undefined); // Do not claim unimplemented CIMD.
    assert.equal((await f.request('/check', { headers: { Authorization: `Bearer ${API_TOKEN}` } })).status, 200);
    assert.equal((await f.request('/check', { headers: { Authorization: `Bearer ${API_TOKEN}`, Origin: 'https://claude.ai' } })).status, 200);
    assert.equal((await f.request('/check', { headers: { Authorization: `Bearer ${API_TOKEN}`, Origin: 'https://evil.example' } })).status, 403);
  } finally { await f.close(); }
});

test('DCR refuses arbitrary callbacks, implicit/confidential clients and excess metadata', async () => {
  const f = await fixture();
  try {
    for (const body of [
      { redirect_uris: ['https://evil.example/callback'], token_endpoint_auth_method: 'none' },
      { redirect_uris: ['https://claude.ai/api/mcp/auth_callback#leak'], token_endpoint_auth_method: 'none' },
      { redirect_uris: [CALLBACK], token_endpoint_auth_method: 'client_secret_post' },
      { redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none', grant_types: ['implicit'] },
      { redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none', client_name: 'x'.repeat(121) },
    ]) {
      const res = await f.request('/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(res.status, 400);
    }
    await f.register();
  } finally { await f.close(); }
});

test('consent cannot grant on GET, wrong secret, missing browser binding, or cross-site POST', async () => {
  const f = await fixture();
  try {
    const p = await f.begin('bridge:read bridge:write');
    assert.match(p.html, /bridge:write/);
    assert.match(p.html, /frame|Approve/);
    assert.equal((await f.form('/oauth/approve', { ticket: p.ticket, secret: SECRET, approve: 'yes' }, { Origin: f.origin })).status, 400);
    assert.equal((await f.form('/oauth/approve', { ticket: p.ticket, secret: SECRET, approve: 'yes' }, { Origin: 'https://evil.example', Cookie: p.cookie })).status, 403);
    assert.equal((await f.form('/oauth/approve', { ticket: p.ticket, secret: 'wrong', approve: 'yes' }, { Origin: f.origin, Cookie: p.cookie })).status, 401);
    const db = f.inspect();
    assert.equal((db.prepare('SELECT count(*) AS n FROM codes').get() as { n: number }).n, 0);
    assert.equal((db.prepare('SELECT count(*) AS n FROM tokens').get() as { n: number }).n, 0);
    db.close();
    await f.approve(p);
    assert.equal((await f.form('/oauth/approve', { ticket: p.ticket, secret: SECRET, approve: 'yes' }, { Origin: f.origin, Cookie: p.cookie })).status, 400);
  } finally { await f.close(); }
});

test('PKCE, redirect, audience and single-use code binding; credentials stored only as hashes', async () => {
  const f = await fixture();
  try {
    const p = await f.begin();
    const code = await f.approve(p);
    assert.equal((await f.exchange(p, code, { code_verifier: randomBytes(32).toString('base64url') })).status, 400);
    assert.equal((await f.exchange(p, code, { resource: `${f.origin}/other` })).status, 400);
    assert.equal((await f.exchange(p, code, { redirect_uri: 'http://localhost/callback' })).status, 400);
    const ok = await f.exchange(p, code);
    assert.equal(ok.status, 200, await ok.clone().text());
    const tokens = await ok.json();
    assert.equal(tokens.expires_in, 900);
    assert.equal((await f.exchange(p, code)).status, 400);
    const db = f.inspect();
    const stored = JSON.stringify(db.prepare('SELECT * FROM tokens').all());
    assert(!stored.includes(tokens.access_token));
    assert(!stored.includes(tokens.refresh_token));
    assert(stored.includes(sha(tokens.access_token)));
    db.close();
    f.restart();
    assert.equal((await f.request('/check', { headers: { Authorization: `Bearer ${tokens.access_token}` } })).status, 200);
    assert.equal((await f.request('/owner', { headers: { Authorization: `Bearer ${tokens.access_token}` } })).status, 401);
  } finally { await f.close(); }
});

test('refresh rotates atomically; replay revokes family and persists across restart', async () => {
  const f = await fixture();
  try {
    const g = await f.grant();
    const refresh = (scope?: string) => f.form('/token', { grant_type: 'refresh_token', client_id: g.client_id,
      refresh_token: g.refresh_token, resource: `${f.origin}/mcp`, ...(scope ? { scope } : {}) });
    assert.equal((await refresh('bridge:read bridge:write')).status, 400);
    const res = await refresh();
    assert.equal(res.status, 200);
    const rotated = await res.json();
    assert.notEqual(rotated.refresh_token, g.refresh_token);
    assert.equal((await f.request('/check', { headers: { Authorization: `Bearer ${rotated.access_token}` } })).status, 200);
    const replay = await refresh();
    assert.equal(replay.status, 400);
    assert.equal((await replay.json()).error, 'invalid_grant');
    f.restart();
    for (const token of [g.access_token, rotated.access_token]) {
      assert.equal((await f.request('/check', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    }
  } finally { await f.close(); }
});

test('explicit revocation and expired access tokens are rejected', async () => {
  const f = await fixture();
  try {
    const g = await f.grant();
    const db = f.inspect();
    db.prepare('UPDATE tokens SET expires = 0 WHERE hash = ?').run(sha(g.access_token));
    db.close();
    assert.equal((await f.request('/check', { headers: { Authorization: `Bearer ${g.access_token}` } })).status, 401);
    assert.equal((await f.form('/revoke', { client_id: g.client_id, token: g.refresh_token })).status, 200);
    const res = await f.form('/token', { client_id: g.client_id, grant_type: 'refresh_token', refresh_token: g.refresh_token, resource: `${f.origin}/mcp` });
    assert.equal(res.status, 400);
  } finally { await f.close(); }
});

test('owner login, Strict HttpOnly cookie, CSRF, logout and failed-login throttle', async () => {
  const f = await fixture();
  try {
    const login = (secret: string, origin = f.origin) => f.request('/api/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ secret }) });
    assert.equal((await login(SECRET, 'https://evil.example')).status, 403);
    const logged = await login(SECRET);
    assert.equal(logged.status, 200);
    const cookie = logged.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
    const value = cookie.split(';')[0];
    const { csrfToken } = await logged.json();
    assert.equal((await f.request('/owner', { headers: { Cookie: value } })).status, 200);
    assert.equal((await f.request('/owner', { method: 'POST', headers: { Cookie: value, Origin: f.origin } })).status, 403);
    const headers = { Cookie: value, Origin: f.origin, 'X-CSRF-Token': csrfToken };
    assert.equal((await f.request('/owner', { method: 'POST', headers })).status, 200);
    assert.equal((await f.request('/api/session', { headers })).status, 200);
    assert.equal((await f.request('/api/logout', { method: 'POST', headers })).status, 200);
    assert.equal((await f.request('/owner', { headers: { Cookie: value } })).status, 401);
    for (let i = 0; i < 5; i++) assert.equal((await login('wrong')).status, 401);
    assert.equal((await login(SECRET)).status, 429);
  } finally { await f.close(); }
});

test('MCP advertises eight tools, returns structured data, and enforces write scope', async () => {
  const f = await fixture();
  try {
    const g = await f.grant();
    async function rpc(token: string, method: string, params: Record<string, unknown> = {}) {
      const res = await f.request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}`, 'MCP-Protocol-Version': '2025-06-18' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      assert.equal(res.status, 200, await res.clone().text());
      const body = await res.text();
      return JSON.parse(body.startsWith('{') ? body : body.split('\n').find(line => line.startsWith('data:'))!.slice(5));
    }
    const listed = await rpc(g.access_token, 'tools/list');
    assert.equal(listed.result.tools.length, 8);
    assert.equal(listed.result.tools.find((t: { name: string }) => t.name === 'grokbot_send').annotations.readOnlyHint, false);
    const read = await rpc(g.access_token, 'tools/call', { name: 'history_search', arguments: { query: 'fixture', mode: 'keyword' } });
    assert.deepEqual(read.result.structuredContent, { untrustedHistoricalData: true, hits: [] });
    const input = { messageId: randomUUID(), agentId: randomUUID(), prompt: 'fixture' };
    const denied = await rpc(g.access_token, 'tools/call', { name: 'grokbot_send', arguments: input });
    assert.equal(denied.result.isError, true);
    assert.equal(f.sends(), 0);
    const sent = await rpc(API_TOKEN, 'tools/call', { name: 'grokbot_send', arguments: input });
    assert.equal(sent.result.structuredContent.message.id, input.messageId);
    assert.equal(f.sends(), 1);
    const creation = { operationId: randomUUID(), name: 'New conversation' };
    const deniedCreation = await rpc(g.access_token, 'tools/call', { name: 'grokbot_create_agent', arguments: creation });
    assert.equal(deniedCreation.result.isError, true);
    assert.equal(deniedCreation.result.structuredContent.error, 'insufficient_scope');
    const created = await rpc(API_TOKEN, 'tools/call', { name: 'grokbot_create_agent', arguments: creation });
    assert.equal(created.result.structuredContent.creation.operationId, creation.operationId);
    assert.equal(created.result.structuredContent.creation.status, 'creation_uncertain');

  } finally { await f.close(); }
});
