import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { BridgeConfig } from './types.js';

export function loadConfig(): BridgeConfig {
  const dataDir = resolve(process.env.BRIDGE_DATA_DIR ?? 'data');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
  const secretFile = resolve(dataDir, 'access.json');
  if (!existsSync(secretFile)) {
    writeFileSync(secretFile, JSON.stringify({ ownerSecret: randomBytes(32).toString('base64url'), apiToken: randomBytes(32).toString('base64url') }), { mode: 0o600, flag: 'wx' });
  }
  chmodSync(secretFile, 0o600);
  const secrets = JSON.parse(readFileSync(secretFile, 'utf8'));
  const port = Number(process.env.PORT ?? 4328);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const publicUrl = new URL(process.env.BRIDGE_PUBLIC_URL ?? `http://127.0.0.1:${port}`);
  if (publicUrl.username || publicUrl.password || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) throw new Error('BRIDGE_PUBLIC_URL must be an origin without credentials, path or query');
  if (publicUrl.protocol !== 'https:' && !(publicUrl.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(publicUrl.hostname))) throw new Error('Public MCP requires HTTPS');
  const ownerSecret = process.env.BRIDGE_OWNER_SECRET ?? secrets.ownerSecret;
  const apiToken = process.env.BRIDGE_API_TOKEN ?? secrets.apiToken;
  if (typeof ownerSecret !== 'string' || typeof apiToken !== 'string' || ownerSecret.length < 32 || apiToken.length < 32 || ownerSecret === apiToken) throw new Error('Distinct owner and API secrets of at least 32 characters are required');
  const grokHost = process.env.GROKBOT_SSH_HOST ?? 'box@grokbot1';
  if (!['box@grokbot1', 'box@grokbot1.oracle.netbird'].includes(grokHost)) throw new Error('Use the approved Grok Bot NetBird SSH target');
  const explicitHosts = new Set<string>();
  explicitHosts.add(new URL(publicUrl).host);
  explicitHosts.add(`127.0.0.1:${port}`);
  explicitHosts.add(`localhost:${port}`);
  const extraHosts = process.env.BRIDGE_ALLOWED_HOSTS?.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean) ?? [];
  for (const host of extraHosts) explicitHosts.add(host);
  return {
    host: process.env.BRIDGE_HOST ?? '127.0.0.1',
    port,
    publicUrl: publicUrl.origin,
    dataDir,
    ownerSecret,
    apiToken,
    grokHost,
    grokIdentityFile: process.env.GROKBOT_SSH_IDENTITY_FILE ? resolve(process.env.GROKBOT_SSH_IDENTITY_FILE) : undefined,
    historyHost: 'beta@m5.oracle.netbird',
    embeddingModel: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    allowedHosts: [...explicitHosts],
  };
}
