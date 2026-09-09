import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basePath } from '../client/basePath.js';
import { createApiClient } from '../client/api.js';

test('base path keeps the ingress prefix and drops only an application route', () => {
  assert.equal(basePath('/'), '/');
  assert.equal(basePath('/new'), '/');
  assert.equal(basePath('/api/hassio_ingress/TOKEN/'), '/api/hassio_ingress/TOKEN/');
  assert.equal(basePath('/api/hassio_ingress/TOKEN/history'), '/api/hassio_ingress/TOKEN/');
  assert.equal(basePath('/api/hassio_ingress/TOKEN'), '/api/hassio_ingress/TOKEN/');
});

test('the API client requests through the base it was given', async () => {
  const seen: string[] = [];
  const respond = async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response(JSON.stringify({ grokHost: 'box@grokbot1', historyHost: 'beta@m5', mcpUrl: 'http://127.0.0.1:4328/mcp', auth: 'owner', publicDeploymentVerified: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  await createApiClient(respond).connections();
  await createApiClient(respond, '/api/hassio_ingress/TOKEN/').connections();
  assert.deepEqual(seen, ['/api/connections', '/api/hassio_ingress/TOKEN/api/connections']);
});
