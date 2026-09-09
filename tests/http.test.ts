import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createApp } from '../server/http.js';
import type { BridgeApi, BridgeConfig } from '../server/types.js';

async function request(port: number, path: string, headers: Record<string, string> = {}) {
  return await new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, headers }, (res) => resolve(res));
    req.on('error', reject);
    req.end();
  });
}

test('host filter accepts loopback and configured public hosts', async (t) => {
  const app = express();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const config: BridgeConfig = {
    host: '127.0.0.1',
    port: address.port,
    publicUrl: origin,
    dataDir: '/tmp',
    ownerSecret: 'x'.repeat(40),
    apiToken: 'y'.repeat(40),
    grokHost: 'unused',
    historyHost: 'unused',
    embeddingModel: 'unused',
    allowedHosts: [
      `127.0.0.1:${address.port}`,
      `localhost:${address.port}`,
      'tunnel.example.com',
      'tunnel2.example.com:8443',
    ],
  };
  let transcriptReads = 0;
  const api: BridgeApi = {
    transcript: async (agentId) => { transcriptReads++; return { agentId, name: 'HTTP fixture', entries: [], hasMore: false, nextBeforeRowid: null }; },
    creations: () => [],
    createAgent: async () => { throw new Error('not mocked'); },
    verifyCreation: async () => { throw new Error('not mocked'); },
    agents: async () => ({ agents: [], health: { ok: true } }),
    send: async (input) => ({
      id: input.messageId,
      agentId: input.agentId,
      agentName: 'test',
      prompt: input.prompt,
      marker: 'marker',
      afterRowid: null,
      status: 'accepted',
      reply: null,
      requestId: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    verify: async () => ({
      id: 'x',
      agentId: 'a',
      agentName: 'test',
      prompt: 'p',
      marker: 'm',
      afterRowid: null,
      status: 'accepted',
      reply: null,
      requestId: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    messages: () => [],
    search: async () => [],
    readHistory: async () => null,
    historyStatus: async () => ({ documents: 0, chunks: 0, embeddedChunks: 0, model: 'test', projects: [] }),
  };
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'pipe' });
  const indexHtml = readFileSync(join(process.cwd(), 'dist/index.html'), 'utf8');
  // Incubate worktrees live below .local; exercise hidden ancestors on every machine.
  const fixture = mkdtempSync(join(tmpdir(), '.grokbot-http-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  cpSync(join(process.cwd(), 'dist'), join(fixture, 'dist'), { recursive: true });
  const cwd = process.cwd();
  const { app: bridgeApp, close } = (() => {
    try {
      process.chdir(fixture);
      return createApp(config, api);
    } finally {
      process.chdir(cwd);
    }
  })();
  app.use('/x', bridgeApp);
  try {
    await t.test('GET / serves the built index HTML', async () => {
      const res = await fetch(origin + '/x/');
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      assert.equal(await res.text(), indexHtml);
    });
    await t.test('unexpected errors log only the message and return a generic 500', async (t) => {
      const log = t.mock.method(console, 'error', () => {});
      const res = await fetch(origin + '/x/api/agent-creations/fixture/verify', {
        method: 'POST', headers: { Authorization: `Bearer ${config.apiToken}` },
      });
      assert.equal(res.status, 500);
      assert.equal((await res.json()).error.code, 'internal_error');
      assert.equal(log.mock.callCount(), 1);
      assert.deepEqual(log.mock.calls[0].arguments, ['HTTP request failed:', 'not mocked']);
    });

    const res1 = await request(address.port, '/x/health');
    assert.equal(res1.statusCode, 200, 'loopback should pass');

    const res2 = await request(address.port, '/x/health', { Host: 'bad.example' });
    assert.equal(res2.statusCode, 421, 'bad host should fail');

    const res3 = await request(address.port, '/x/health', { Host: 'bad.example', 'x-forwarded-host': 'tunnel.example.com' });
    assert.equal(res3.statusCode, 200, 'forwarded allowed host should pass');

    const path = '/x/api/agents/11111111-1111-4111-8111-111111111111/transcript';
    const anonymous = await fetch(origin + path);
    assert.equal(anonymous.status, 401); assert.equal(transcriptReads, 0);
    const headers = { Authorization: `Bearer ${config.apiToken}` };
    assert.equal((await fetch(origin + path + '?before=bad', { headers })).status, 400);
    assert.equal((await fetch(origin + path + '?unexpected=1', { headers })).status, 400);
    assert.equal(transcriptReads, 0);
    assert.equal((await fetch(origin + path + '?before=30', { headers })).status, 200);
    assert.equal(transcriptReads, 1);
  } finally {
    await close();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
