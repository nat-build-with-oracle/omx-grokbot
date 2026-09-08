import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
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

test('host filter accepts loopback and configured public hosts', async () => {
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
  const api: BridgeApi = {
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
  const { app: bridgeApp, close } = createApp(config, api);
  app.use('/x', bridgeApp);
  try {
    const res1 = await request(address.port, '/x/health');
    assert.equal(res1.statusCode, 200, 'loopback should pass');

    const res2 = await request(address.port, '/x/health', { Host: 'bad.example' });
    assert.equal(res2.statusCode, 421, 'bad host should fail');

    const res3 = await request(address.port, '/x/health', { Host: 'bad.example', 'x-forwarded-host': 'tunnel.example.com' });
    assert.equal(res3.statusCode, 200, 'forwarded allowed host should pass');
  } finally {
    await close();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
