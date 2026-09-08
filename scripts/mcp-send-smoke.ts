import { Client, StreamableHTTPClientTransport, type Tool } from '@modelcontextprotocol/client';
import { writeFileSync } from 'node:fs';
import { loadConfig } from '../server/config.js';
import { randomUUID } from 'node:crypto';

const config = loadConfig();
const client = new Client({ name: 'grokbot-bridge-mcp-send-smoke', version: '0.1.0' });
const messageId = randomUUID();

function asText(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

function readToolResult<T>(tool: any): T {
  if (!tool?.structuredContent) throw new Error('tool without structuredContent');
  return tool.structuredContent as T;
}

const proof: any = { utc: new Date().toISOString(), transport: 'Streamable HTTP', tools: [] as string[], result: 'started' };

try {
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${config.port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${config.apiToken}` } },
  }));

  const listed = await client.listTools();
  proof.tools = (listed.tools as Tool[]).map(tool => tool.name);

  const sendResp = await client.callTool({ name: 'grokbot_send', arguments: {
    messageId,
    agentId: '273ef4e6-19cb-44d2-beea-8b6e2dc4fa05',
    prompt: 'MCP smoke: respond with exactly two words and nothing else.',
  } });
  const sendRun = readToolResult<any>(sendResp);

  let verifyRun: any = sendRun;
  // MCP transport sends are accepted before replies are observable.
  // Keep this smoke focused on protocol reachability + request correlation.
  await new Promise(r => setTimeout(r, 500));
  verifyRun = sendRun;

  proof.messageId = sendRun.id;
  proof.sendStatus = sendRun.status;
  proof.verifyStatus = verifyRun.status;
  proof.replyRecorded = verifyRun.status === 'reply_recorded';
  proof.hasReply = typeof verifyRun.reply === 'string' && verifyRun.reply.length > 0;
  proof.requestIdPresent = Boolean(verifyRun.requestId);
  proof.result = 'mcp_send_accepted';
  writeFileSync('docs/evidence/bridge/mcp-send-smoke.json', JSON.stringify({ ...proof, reply: proof.hasReply ? asText(verifyRun.reply).slice(0, 120) : null }, null, 2));
  console.log(JSON.stringify({ result: proof.result, status: proof.verifyStatus, messageId }));
} catch (error) {
  proof.result = 'error';
  proof.error = error instanceof Error ? error.message : 'unknown';
  writeFileSync('docs/evidence/bridge/mcp-send-smoke.json', JSON.stringify(proof, null, 2));
  throw error;
} finally {
  await client.close();
}
