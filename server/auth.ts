/** Single-owner authorization. Frozen SDK OAuth routing is intentional; grants are ours. */
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import express, { type Request, type RequestHandler, type Response } from 'express';
import {
  mcpAuthRouter, InvalidClientMetadataError, InvalidGrantError,
  InvalidRequestError, InvalidScopeError, InvalidTargetError, InvalidTokenError,
  TooManyRequestsError, type OAuthServerProvider,
} from '@modelcontextprotocol/server-legacy/auth';
import type { AuthInfo } from '@modelcontextprotocol/server';
import type { BridgeConfig } from './types.js';

const SCOPES = ['bridge:read', 'bridge:write'];
const SESSION_COOKIE = 'grokbot_session';
const CONSENT_COOKIE = 'grokbot_consent';
const ACCESS_TTL = 15 * 60;
const REFRESH_TTL = 7 * 24 * 3600;
const SESSION_TTL = 8 * 3600;
const now = () => Math.floor(Date.now() / 1000);
const random = () => randomBytes(32).toString('base64url');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
type AuthRequest = Request & { auth?: AuthInfo };
type Client = NonNullable<Awaited<ReturnType<OAuthServerProvider['clientsStore']['getClient']>>>;
interface Grant { client: string; redirect: string; resource: string; challenge: string; scope: string; state?: string; issuer: string }
interface StoredToken { hash: string; kind: string; family: string; client: string; scope: string; resource: string; expires: number; revoked: number }

function cookie(req: Request, name: string): string | undefined {
  const part = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`));
  const value = part?.slice(name.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
function bearer(req: Request): string | undefined {
  const value = req.headers.authorization;
  return value && /^Bearer [^\s]{1,4096}$/i.test(value) ? value.slice(7) : undefined;
}
function validRedirect(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    const u = new URL(value);
    if (u.hash || u.username || u.password) return false;
    if (value === 'https://claude.ai/api/mcp/auth_callback') return true;
    // Local native clients only; no arbitrary public callback or URL fetch.
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
      && u.pathname === '/callback' && !u.search;
  } catch { return false; }
}
function scopes(input?: string[]): string[] {
  const result = [...new Set(input?.length ? input : ['bridge:read'])];
  if (result.length > 2 || result.some(s => !SCOPES.includes(s)) || !result.includes('bridge:read')) {
    throw new InvalidScopeError('Only bridge:read and optional bridge:write are supported');
  }
  return result;
}

export function createAuth(config: BridgeConfig): {
  router: express.Router; requireOwner: RequestHandler; requireMcp: RequestHandler; close(): void;
} {
  const base = new URL(config.publicUrl);
  if (base.pathname !== '/' || base.search || base.hash || base.username || base.password
      || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) {
    throw new Error('publicUrl must be an HTTPS origin (HTTP allowed only on loopback)');
  }
  if (config.ownerSecret.length < 16 || config.apiToken.length < 16 || equal(config.ownerSecret, config.apiToken)) {
    throw new Error('Distinct ownerSecret and apiToken of at least 16 characters are required');
  }
  const origin = base.origin;
  const issuer = new URL(origin);
  const resource = new URL('/mcp', origin);
  const metadataUrl = new URL('/.well-known/oauth-protected-resource/mcp', origin).href;
  const secure = base.protocol === 'https:';
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const dbPath = join(config.dataDir, 'oauth.sqlite');
  const db = new Database(dbPath);
  chmodSync(dbPath, 0o600);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, json TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pending (hash TEXT PRIMARY KEY, binding TEXT NOT NULL, json TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS codes (hash TEXT PRIMARY KEY, json TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, kind TEXT NOT NULL, family TEXT NOT NULL, client TEXT NOT NULL,
      scope TEXT NOT NULL, resource TEXT NOT NULL, expires INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS tokens_family ON tokens(family);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const fingerprint = createHmac('sha256', config.ownerSecret).update(`owner:${origin}`).digest('hex');
  const previous = db.prepare('SELECT value FROM settings WHERE key = ?').get('owner') as { value: string } | undefined;
  if (previous && previous.value !== fingerprint) {
    db.exec('DELETE FROM sessions; DELETE FROM codes; DELETE FROM pending; UPDATE tokens SET revoked = 1;');
  }
  db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)').run('owner', fingerprint);
  function cleanup() {
    const t = now();
    for (const table of ['pending', 'codes', 'sessions', 'attempts']) db.prepare(`DELETE FROM ${table} WHERE expires <= ?`).run(t);
    // Retain rotated refresh tombstones for the whole family lifetime to detect reuse.
    db.prepare('DELETE FROM tokens WHERE expires < ?').run(t - REFRESH_TTL);
    db.prepare('DELETE FROM clients WHERE created < ? AND id NOT IN (SELECT client FROM tokens WHERE expires > ?)')
      .run(t - 30 * 86400, t);
  }
  cleanup();
  const timer = setInterval(cleanup, 60_000);
  timer.unref();
  function limited(req: Request, category: string, max: number, window = 900): boolean {
    const key = digest(`${category}:${req.socket.remoteAddress ?? 'unknown'}`);
    const row = db.prepare('SELECT count, expires FROM attempts WHERE key = ?').get(key) as { count: number; expires: number } | undefined;
    if (row && row.expires > now() && row.count >= max) return true;
    db.prepare(`INSERT INTO attempts VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN expires <= ? THEN 1 ELSE count + 1 END,
      expires = CASE WHEN expires <= ? THEN excluded.expires ELSE expires END`).run(key, now() + window, now(), now());
    return false;
  }
  function ownerAttempt(req: Request, supplied: unknown): 'ok' | 'invalid' | 'limited' {
    const key = digest(`owner:${req.socket.remoteAddress ?? 'unknown'}`);
    const row = db.prepare('SELECT count, expires FROM attempts WHERE key = ?').get(key) as { count: number; expires: number } | undefined;
    if (row && row.expires > now() && row.count >= 5) return 'limited';
    if (typeof supplied === 'string' && supplied.length <= 4096 && equal(supplied, config.ownerSecret)) {
      db.prepare('DELETE FROM attempts WHERE key = ?').run(key);
      return 'ok';
    }
    limited(req, 'owner', 5);
    return 'invalid';
  }
  function setCookie(res: Response, name: string, token: string, ttl: number) {
    res.append('Set-Cookie', `${name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ttl}${secure ? '; Secure' : ''}`);
  }
  const csrf = (session: string) => createHmac('sha256', config.ownerSecret).update(`csrf:${session}`).digest('base64url');
  function session(req: Request): string | undefined {
    const token = cookie(req, SESSION_COOKIE);
    if (!token) return undefined;
    return db.prepare('SELECT 1 FROM sessions WHERE hash = ? AND expires > ?').get(digest(token), now()) ? token : undefined;
  }
  function sameOrigin(req: Request): boolean {
    return req.headers.origin === origin && req.headers['sec-fetch-site'] !== 'cross-site';
  }
  const requireOwner: RequestHandler = (req, res, next) => {
    const token = bearer(req);
    if (token && equal(token, config.apiToken)) {
      if (req.headers.origin && !sameOrigin(req)) { res.status(403).json({ error: 'invalid_origin' }); return; }
      next(); return;
    }
    const current = session(req);
    if (!current) { res.status(401).json({ error: 'owner_authentication_required' }); return; }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
        && (!sameOrigin(req) || typeof req.headers['x-csrf-token'] !== 'string' || !equal(req.headers['x-csrf-token'], csrf(current)))) {
      res.status(403).json({ error: 'invalid_csrf' }); return;
    }
    next();
  };
  function tokenInfo(token: string): AuthInfo {
    if (equal(token, config.apiToken)) {
      return { token, clientId: 'owner-static', scopes: [...SCOPES], resource, expiresAt: now() + ACCESS_TTL,
        extra: { owner: true, principal: 'owner', method: 'static' } };
    }
    const row = db.prepare('SELECT * FROM tokens WHERE hash = ? AND kind = ?').get(digest(token), 'access') as StoredToken | undefined;
    if (!row || row.revoked || row.expires <= now() || row.resource !== resource.href) throw new InvalidTokenError('Invalid access token');
    return { token, clientId: row.client, scopes: row.scope.split(' '), expiresAt: row.expires, resource,
      extra: { owner: true, principal: 'owner', method: 'oauth' } };
  }
  const requireMcp: RequestHandler = (req, res, next) => {
    if (req.headers.origin && ![origin, 'https://claude.ai'].includes(req.headers.origin)) {
      res.status(403).json({ error: 'invalid_origin' }); return;
    }
    try {
      const token = bearer(req);
      if (!token) throw new InvalidTokenError('Missing bearer token');
      const info = tokenInfo(token);
      if (!info.scopes.includes('bridge:read')) {
        res.setHeader('WWW-Authenticate', `Bearer error="insufficient_scope", scope="bridge:read", resource_metadata="${metadataUrl}"`);
        res.status(403).json({ error: 'insufficient_scope' }); return;
      }
      (req as AuthRequest).auth = info;
      next();
    } catch {
      // This connector's advertised purpose includes sending. Request both explicitly so
      // Claude obtains informed owner consent rather than silently connecting read-only.
      res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", scope="bridge:read bridge:write", resource_metadata="${metadataUrl}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.status(401).json({ error: 'invalid_token' });
    }
  };
  function issue(client: string, scope: string, family: string = randomUUID()) {
    const access_token = random(), refresh_token = random();
    const insert = db.prepare('INSERT INTO tokens VALUES (?, ?, ?, ?, ?, ?, ?, 0)');
    insert.run(digest(access_token), 'access', family, client, scope, resource.href, now() + ACCESS_TTL);
    insert.run(digest(refresh_token), 'refresh', family, client, scope, resource.href, now() + REFRESH_TTL);
    return { access_token, refresh_token, token_type: 'Bearer', expires_in: ACCESS_TTL, scope };
  }
  const provider: OAuthServerProvider = {
    clientsStore: {
      getClient(id) {
        if (id.length > 200) return undefined;
        const row = db.prepare('SELECT json FROM clients WHERE id = ?').get(id) as { json: string } | undefined;
        return row ? JSON.parse(row.json) as Client : undefined;
      },
      registerClient(input) {
        if (input.token_endpoint_auth_method !== 'none' || input.client_secret) {
          throw new InvalidClientMetadataError('Only public clients using token_endpoint_auth_method none are supported');
        }
        if (!input.redirect_uris.length || input.redirect_uris.length > 5 || input.redirect_uris.some(u => !validRedirect(u))) {
          throw new InvalidClientMetadataError('Redirect must be the hosted Claude callback or an HTTP loopback /callback');
        }
        if ((input.client_name?.length ?? 0) > 120 || JSON.stringify(input).length > 8192
            || input.grant_types?.some(g => !['authorization_code', 'refresh_token'].includes(g))
            || input.response_types?.some(r => r !== 'code')) throw new InvalidClientMetadataError('Invalid client metadata');
        if (input.scope) scopes(input.scope.split(' '));
        if ((db.prepare('SELECT count(*) AS n FROM clients').get() as { n: number }).n >= 500) throw new TooManyRequestsError('Client capacity reached');
        // Whitelist fields; no caller-supplied credentials, arbitrary metadata or ID persisted.
        const client: Client = { client_id: randomUUID(), client_id_issued_at: now(), client_name: input.client_name ?? 'MCP client',
          redirect_uris: input.redirect_uris, token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: SCOPES.join(' ') };
        db.prepare('INSERT INTO clients VALUES (?, ?, ?)').run(client.client_id, JSON.stringify(client), now());
        return client;
      },
    },
    async authorize(client, params, res) {
      if (!params.resource || params.resource.href !== resource.href) throw new InvalidTargetError('Exact MCP resource is required');
      if (!validRedirect(params.redirectUri) || !/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge)
          || (params.state?.length ?? 0) > 2048) throw new InvalidRequestError('Invalid authorization parameters');
      const requested = scopes(params.scopes);
      if ((db.prepare('SELECT count(*) AS n FROM pending').get() as { n: number }).n >= 500) throw new TooManyRequestsError('Pending approval capacity reached');
      const ticket = random(), binding = random();
      const grant: Grant = { client: client.client_id, redirect: params.redirectUri, resource: resource.href,
        challenge: params.codeChallenge, scope: requested.join(' '), state: params.state, issuer: issuer.href };
      db.prepare('INSERT INTO pending VALUES (?, ?, ?, ?)').run(digest(ticket), digest(binding), JSON.stringify(grant), now() + 600);
      setCookie(res, CONSENT_COOKIE, binding, 600);
      res.setHeader('Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Approve Grok Bot access</title>
        <h1>Approve Grok Bot access</h1><p>Client: ${escape(client.client_name ?? client.client_id)}</p>
        <p>Client ID: ${escape(client.client_id)}</p><p>Redirect: ${escape(params.redirectUri)}</p>
        <p>Permissions: ${escape(grant.scope)}. Read exposes this owner's history; write can send prompts and incur work.</p>
        <p>Only approve a connection you started. Registering a client has not granted any access.</p>
        <form method="post" action="/oauth/approve"><input type="hidden" name="ticket" value="${ticket}">
        <label>Owner secret <input type="password" name="secret" required autocomplete="current-password"></label>
        <label><input type="checkbox" name="approve" value="yes" required>I approve these permissions</label>
        <button type="submit">Approve once</button></form></html>`);
    },
    async challengeForAuthorizationCode(client, code) {
      const row = db.prepare('SELECT json FROM codes WHERE hash = ? AND expires > ?').get(digest(code), now()) as { json: string } | undefined;
      if (!row) throw new InvalidGrantError('Invalid authorization code');
      const grant = JSON.parse(row.json) as Grant;
      if (grant.client !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
      return grant.challenge;
    },
    async exchangeAuthorizationCode(client, code, _verifier, redirect, requestedResource) {
      // SDK verified PKCE immediately before this call; atomic deletion prevents concurrent redemption.
      return db.transaction(() => {
        const row = db.prepare('SELECT json FROM codes WHERE hash = ? AND expires > ?').get(digest(code), now()) as { json: string } | undefined;
        if (!row) throw new InvalidGrantError('Invalid authorization code');
        const grant = JSON.parse(row.json) as Grant;
        if (grant.client !== client.client_id || redirect !== grant.redirect || requestedResource?.href !== grant.resource) {
          throw new InvalidGrantError('Authorization binding mismatch');
        }
        db.prepare('DELETE FROM codes WHERE hash = ?').run(digest(code));
        return issue(grant.client, grant.scope);
      })();
    },
    async exchangeRefreshToken(client, token, requestedScopes, requestedResource) {
      const row = db.prepare('SELECT * FROM tokens WHERE hash = ? AND kind = ?').get(digest(token), 'refresh') as StoredToken | undefined;
      if (!row || row.client !== client.client_id) throw new InvalidGrantError('Invalid refresh grant');
      if (row.revoked || row.expires <= now()) {
        db.prepare('UPDATE tokens SET revoked = 1 WHERE family = ?').run(row.family);
        throw new InvalidGrantError('Invalid refresh grant');
      }
      if (requestedResource?.href !== row.resource) throw new InvalidTargetError('Exact MCP resource is required');
      const approved = requestedScopes ? scopes(requestedScopes) : row.scope.split(' ');
      if (approved.some(s => !row.scope.split(' ').includes(s))) throw new InvalidScopeError('Refresh cannot expand scopes');
      return db.transaction(() => {
        const updated = db.prepare('UPDATE tokens SET revoked = 1 WHERE hash = ? AND revoked = 0').run(row.hash);
        if (!updated.changes) throw new InvalidGrantError('Invalid refresh grant');
        return issue(row.client, approved.join(' '), row.family);
      })();
    },
    async verifyAccessToken(token) { return tokenInfo(token); },
    async revokeToken(client, request) {
      const row = db.prepare('SELECT * FROM tokens WHERE hash = ?').get(digest(request.token)) as StoredToken | undefined;
      if (row?.client === client.client_id) db.prepare('UPDATE tokens SET revoked = 1 WHERE family = ?').run(row.family);
    },
  };
  const router = express.Router();
  // Do not consume unrelated API/MCP bodies: their owning routes set their own limits.
  const authPaths = ['/api/login', '/api/logout', '/oauth/approve', '/register', '/authorize', '/token', '/revoke'];
  router.use(authPaths, express.json({ limit: '16kb' }), express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 30 }));
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.post('/api/login', (req, res) => {
    if (!sameOrigin(req)) { res.status(403).json({ error: 'invalid_origin' }); return; }
    const result = ownerAttempt(req, req.body?.secret);
    if (result !== 'ok') { res.status(result === 'limited' ? 429 : 401).json({ error: result === 'limited' ? 'rate_limited' : 'invalid_credentials' }); return; }
    if ((db.prepare('SELECT count(*) AS n FROM sessions').get() as { n: number }).n >= 200) {
      res.status(429).json({ error: 'session_capacity' }); return;
    }
    const old = cookie(req, SESSION_COOKIE);
    if (old) db.prepare('DELETE FROM sessions WHERE hash = ?').run(digest(old));
    const token = random();
    db.prepare('INSERT INTO sessions VALUES (?, ?)').run(digest(token), now() + SESSION_TTL);
    setCookie(res, SESSION_COOKIE, token, SESSION_TTL);
    res.json({ authenticated: true, csrfToken: csrf(token) });
  });
  router.get('/api/session', (req, res) => {
    const token = session(req);
    const isStatic = bearer(req);
    res.json(token ? { authenticated: true, csrfToken: csrf(token) } : { authenticated: Boolean(isStatic && equal(isStatic, config.apiToken)) });
  });
  router.post('/api/logout', requireOwner, (req, res) => {
    const token = cookie(req, SESSION_COOKIE);
    if (token) db.prepare('DELETE FROM sessions WHERE hash = ?').run(digest(token));
    setCookie(res, SESSION_COOKIE, '', 0);
    res.json({ authenticated: false });
  });
  router.post('/oauth/approve', (req, res) => {
    if (!sameOrigin(req)) { res.status(403).send('Invalid origin'); return; }
    const ticket: unknown = req.body?.ticket;
    const binding = cookie(req, CONSENT_COOKIE);
    if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket) || !binding || req.body?.approve !== 'yes') {
      res.status(400).send('Invalid approval'); return;
    }
    const row = db.prepare('SELECT binding, json FROM pending WHERE hash = ? AND expires > ?').get(digest(ticket), now()) as { binding: string; json: string } | undefined;
    if (!row || !equal(row.binding, digest(binding))) { res.status(400).send('Invalid or expired approval'); return; }
    const result = ownerAttempt(req, req.body?.secret);
    if (result !== 'ok') { res.status(result === 'limited' ? 429 : 401).send(result === 'limited' ? 'Rate limited' : 'Invalid owner secret'); return; }
    const grant = JSON.parse(row.json) as Grant;
    const code = random();
    db.transaction(() => {
      db.prepare('DELETE FROM pending WHERE hash = ?').run(digest(ticket));
      db.prepare('INSERT INTO codes VALUES (?, ?, ?)').run(digest(code), row.json, now() + 120);
    })();
    setCookie(res, CONSENT_COOKIE, '', 0);
    const redirect = new URL(grant.redirect);
    redirect.searchParams.set('code', code);
    redirect.searchParams.set('iss', grant.issuer);
    if (grant.state !== undefined) redirect.searchParams.set('state', grant.state);
    res.redirect(303, redirect.href);
  });
  // Legacy router's default metadata advertises confidential clients we intentionally do not support.
  router.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ issuer: issuer.href, authorization_endpoint: new URL('/authorize', origin).href,
      token_endpoint: new URL('/token', origin).href, registration_endpoint: new URL('/register', origin).href,
      revocation_endpoint: new URL('/revoke', origin).href, response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'], scopes_supported: SCOPES,
      token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true });
  });
  router.use(mcpAuthRouter({ provider, issuerUrl: issuer, resourceServerUrl: resource,
    scopesSupported: SCOPES, resourceName: 'Grok Bot bridge',
    clientRegistrationOptions: { rateLimit: { max: 10, windowMs: 15 * 60_000 } },
  }));
  return { router, requireOwner, requireMcp, close() { clearInterval(timer); db.close(); } };
}
