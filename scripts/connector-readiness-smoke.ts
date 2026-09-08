import { writeFileSync } from 'node:fs';
import { loadConfig } from '../server/config.js';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

type ProbeStep = {
  check: string;
  ok: boolean;
  details?: string;
  hint?: string;
};

type ProbeResult = {
  utc: string;
  origin: string;
  publicUrl: string;
  steps: ProbeStep[];
  mcpTools: string[];
  readyForClaude: boolean;
  readyForGrokBot: boolean;
};

const config = loadConfig();
const proof: ProbeResult = {
  utc: new Date().toISOString(),
  origin: new URL(config.publicUrl).origin,
  publicUrl: config.publicUrl,
  steps: [],
  mcpTools: [],
  readyForClaude: false,
  readyForGrokBot: false,
};

function add(check: string, ok: boolean, details?: string, hint?: string) {
  proof.steps.push({ check, ok, details, hint });
}

function validPublicTransport(): boolean {
  const u = new URL(config.publicUrl);
  if (['127.0.0.1', 'localhost'].includes(u.hostname)) return true;
  return u.protocol === 'https:';
}

async function fetchJson(url: string, accept = 'application/json'): Promise<unknown> {
  const res = await fetch(url, { headers: { accept }, });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) as unknown : null;
}

try {
  add('config_public_url_present', Boolean(config.publicUrl));
  add('public_url_transport', validPublicTransport(), 'Non-loopback public URLs must be HTTPS');

  const protectedResourceUrl = `${config.publicUrl}/.well-known/oauth-protected-resource/mcp`;
  const authzMetadataUrl = `${config.publicUrl}/.well-known/oauth-authorization-server`;

  const authzMetadata = await fetchJson(authzMetadataUrl) as Record<string, unknown>;
  add('authorization_server_discovery', true, `Found ${Object.keys(authzMetadata).length} keys`);
  add('authorization_server_has_authorize', typeof authzMetadata.authorization_endpoint === 'string');
  add('authorization_server_has_token', typeof authzMetadata.token_endpoint === 'string');
  add('authorization_server_scopes', Array.isArray(authzMetadata.scopes_supported));

  const protectedMeta = await fetchJson(protectedResourceUrl) as Record<string, unknown>;
  const resource = String(protectedMeta.resource ?? '');
  add('protected_resource_discovery', resource.length > 0, `resource=${resource}`);
  if (resource === config.publicUrl.replace(/\/$/, '') + '/mcp' || resource === config.publicUrl) {
    add('protected_resource_matches_mcp', true);
  } else {
    add('protected_resource_matches_mcp', false, `Expected ${config.publicUrl}/mcp or ${config.publicUrl}; got ${resource}`);
  }

  await fetchJson(`${config.publicUrl}/health`);
  add('health_ok', true);

  const client = new Client({ name: 'omx-connector-readiness', version: '0.1.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${config.publicUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${config.apiToken}` } },
  }));
  try {
    const tools = await client.listTools();
    proof.mcpTools = tools.tools.map(tool => tool.name);
    add('mcp_tools_listed', tools.tools.length >= 6, `Listed ${tools.tools.length} tools`);
    add('mcp_expected_tools_present', ['grokbot_agents', 'grokbot_send', 'grokbot_verify', 'history_search', 'history_read', 'history_status']
      .every((tool) => proof.mcpTools.includes(tool)));
  } finally {
    await client.close();
  }

  proof.readyForClaude = proof.steps.every((s) => s.ok);
  proof.readyForGrokBot = ['grokbot_send', 'grokbot_verify', 'history_search'].every((tool) => proof.mcpTools.includes(tool));
  writeFileSync('docs/evidence/bridge/connector-readiness.json', JSON.stringify({ ...proof }, null, 2));
  console.log(JSON.stringify({ readyForClaude: proof.readyForClaude, readyForGrokBot: proof.readyForGrokBot, toolCount: proof.mcpTools.length }));
} catch (error) {
  proof.steps.push({
    check: 'readiness_check',
    ok: false,
    details: error instanceof Error ? error.message : 'unknown',
    hint: 'Retry from a public-host process context if required host/path headers differ.',
  });
  writeFileSync('docs/evidence/bridge/connector-readiness.json', JSON.stringify({ ...proof }, null, 2));
  process.exitCode = 1;
}
