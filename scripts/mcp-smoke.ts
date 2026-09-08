/** Read-only live smoke. Tokens and retrieved history never enter stdout/evidence. */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { writeFileSync } from 'node:fs';
import { loadConfig } from '../server/config.js';

const config = loadConfig();
const client = new Client({ name: 'grokbot-bridge-smoke', version: '0.1.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${config.port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${config.apiToken}` } },
  }));
  const listed = await client.listTools();
  const agents = await client.callTool({ name: 'grokbot_agents', arguments: {} });
  const status = await client.callTool({ name: 'history_status', arguments: {} });
  const search = await client.callTool({ name: 'history_search', arguments: { query: 'OAuth authorization approval', mode: 'vector', limit: 3 } });
  if (agents.isError || status.isError || search.isError) throw new Error('MCP tool returned an error');
  const a = agents.structuredContent as any;
  const h = (status.structuredContent as any).status;
  const hits = (search.structuredContent as any).hits;
  const proof = {
    utc: new Date().toISOString(), transport: 'Streamable HTTP', client: '@modelcontextprotocol/client',
    tools: listed.tools.map(t => t.name), grokbotAgentCount: a.agents.length,
    omxProxyDiscovered: a.agents.some((agent: any) => agent.name === 'OMX Proxy'),
    historyDocuments: h.documents, historyChunks: h.chunks, embeddedChunks: h.embeddedChunks,
    semanticHitCount: hits.length, credentialsRetained: false, rawHistoryRetained: false,
    sendsPerformed: 0, limits: 'Local authenticated SDK-client proof, not Claude.ai/public or Grok Bot MCP-client acceptance.',
  };
  writeFileSync('docs/evidence/bridge/mcp-readonly-smoke.json', JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} catch {
  console.error('MCP smoke failed; no credential or raw tool response is printed.');
  process.exitCode = 1;
} finally { await client.close(); }
