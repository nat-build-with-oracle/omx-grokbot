import express from 'express';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { createAuth } from './auth.js';
import { createBridgeMcp } from './mcp.js';
import { BridgeError } from './errors.js';
import type { BridgeApi, BridgeConfig } from './types.js';

export function createApp(config: BridgeConfig, bridge: BridgeApi) {
  const app = express();
  app.disable('x-powered-by');
  const auth = createAuth(config);
  const mcp = createBridgeMcp(bridge);
  const lowerDefault = new Set(config.allowedHosts.map((host) => host.toLowerCase()));
  const normalize = (raw: string) => {
    const value = raw.trim().toLowerCase();
    if (!value.includes(':') || value.startsWith('[')) return value;
    const idx = value.lastIndexOf(':');
    return idx === -1 ? value : value.slice(0, idx);
  };
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
    const headerHost = req.headers.host ?? '';
    const forwarded = req.headers['x-forwarded-host'] ?? '';
    const forwardedHosts = String(forwarded).split(',').map((value) => value.trim());
    const candidates = [String(headerHost), ...forwardedHosts];
    const allowed = candidates.some((candidate) => {
      const exact = candidate.toLowerCase();
      const base = normalize(candidate);
      return lowerDefault.has(exact) || lowerDefault.has(base);
    });
    if (!allowed) {
      res.status(421).json({ error: { code: 'invalid_host', message: 'Host not allowed.' } });
      return;
    }
    next();
  });
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'grokbot-bridge' }));
  app.use(auth.router);
  app.all('/mcp', auth.requireMcp, express.json({ limit: '32kb' }), mcp);
  app.use('/api', auth.requireOwner, express.json({ limit: '32kb' }));
  app.get('/api/agents', async (_req, res) => res.json(await bridge.agents()));
  app.get('/api/agents/:id/transcript', async (req, res) => {
    const query = z.object({ before: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional() }).strict().parse(req.query);
    res.json(await bridge.transcript(String(req.params.id), query.before));
  });
  app.get('/api/agent-creations', (_req, res) => res.json(bridge.creations()));
  app.post('/api/agents', async (req, res) => res.status(202).json(await bridge.createAgent(req.body)));
  app.post('/api/agent-creations/:id/verify', async (req, res) => res.json(await bridge.verifyCreation(String(req.params.id))));
  app.get('/api/messages', (_req, res) => res.json(bridge.messages()));
  app.post('/api/messages', async (req, res) => res.status(202).json(await bridge.send(req.body)));
  app.post('/api/messages/:id/verify', async (req, res) => res.json(await bridge.verify(String(req.params.id))));
  app.get('/api/history/status', async (_req, res) => res.json(await bridge.historyStatus()));
  app.post('/api/history/search', async (req, res) => res.json(await bridge.search(req.body)));
  app.get('/api/history/:id', async (req, res) => {
    const hit = await bridge.readHistory(String(req.params.id));
    if (!hit) throw new BridgeError('not_found', 'History excerpt not found.', 404);
    res.json(hit);
  });
  app.get('/api/connections', (_req, res) => res.json({ grokHost: config.grokHost, historyHost: config.historyHost, mcpUrl: `${config.publicUrl}/mcp`, auth: 'OAuth owner approval; static bearer for headless clients', publicDeploymentVerified: false }));
  const dist = join(process.cwd(), 'dist');
  if (existsSync(join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false }));
    app.get(['/', '/chat', '/new', '/history', '/connections'], (_req, res) => res.sendFile('index.html', { root: dist }));
  } else {
    app.get('/', (_req, res) => res.type('text').send('Grok Bot bridge backend is running. The web interface is not built yet. MCP and owner APIs require authentication.'));
  }
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof BridgeError) res.status(error.status).json({ error: { code: error.code, message: error.message } });
    else if (error instanceof z.ZodError) res.status(400).json({ error: { code: 'invalid_input', message: 'Request fields failed validation.' } });
    else {
      console.error('HTTP request failed:', error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json({ error: { code: 'internal_error', message: 'Operation failed. Do not automatically resend a message.' } });
    }
  });
  return { app, async close() { await mcp.close(); auth.close(); } };
}
