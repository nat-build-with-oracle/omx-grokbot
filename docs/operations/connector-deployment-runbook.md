# MCP connector deployment and verification runbook

This runbook captures the practical operations required to move from the local bridge to external clients.

## Current state and scope

Local implementation already provides:
- Local owner HTTP API + durable message IDs + explicit verification.
- Authenticated Streamable HTTP MCP server with MCP tool set.
- Real MCP and owner-HTTP send/verify proof for Grok Bot.

Still required for end-to-end external connectivity:
- Public HTTPS endpoint reachable from Claude.ai and Grok runtime.
- Real account-level connector setup and authorization in Claude.ai.
- Grok Bot MCP client configured to call this bridge endpoint with MCP credentials.

## 0) Pre-flight checklist

- [ ] Public HTTPS domain for MCP endpoint set in `BRIDGE_PUBLIC_URL`.
- [ ] If the public domain is reached via reverse proxy/tunnel host rewrite, add that host (or host:port) to `BRIDGE_ALLOWED_HOSTS`.
- [ ] Loopback-only hosts (`127.0.0.1` / `localhost`) are only for local testing.
- [ ] TLS is valid for MCP domain.
- [ ] Reverse proxy forwards:
  - `/.well-known/oauth-authorization-server`
  - `/.well-known/oauth-protected-resource/mcp`
  - `/mcp`
  - `/authorize`, `/register`, `/token`, `/revoke`, `/oauth/approve`, `/api/*`
- [ ] Persistent data volume exists for SQLite stores and OAuth grants/tokens.
- [ ] Firewall/IP allowlist reflects Anthropic + your admin access where required.

## 1) Run readiness check (local)

From repo root with Node 22:

```sh
export BRIDGE_PUBLIC_URL=https://bridge.example.com  # example
# If needed:
# export BRIDGE_ALLOWED_HOSTS='tunnel-or-proxy-host.example.com'
export PATH=/Users/nat/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH
npm run start
npx tsx scripts/connector-readiness-smoke.ts
```

Expected outputs:
- `docs/evidence/bridge/connector-readiness.json`
- non-empty `mcpTools`
- `readyForClaude: true` when metadata discovery + health + MCP route checks pass.

> Quick note: account-less `cloudflared tunnel --url` exposure was tested and returned `invalid_host` from a quick tunnel edge route for this bridge in this environment. Treat that as a limitation of that temporary exposure mode. Use a production-grade ingress (or pre-approved hostname path) before claiming external connector readiness.

## 2) Claude.ai connector setup (manual account action)

- Open Claude.ai → settings/integrations/custom MCP connector.
- Add server URL as `https://your-bridge.example.com/mcp`.
- Complete authorization flow through your server-issued consent.
- Ask to re-authorize required scopes as prompted by connector discovery.

Validation target:
- At least one authenticated connector session with expected scope set.
- Confirm a non-mutating MCP call succeeds in Claude before any production write action.

## 3) Grok Bot MCP client setup (manual runtime action)

- Register a dedicated MCP bearer credential in this bridge as an owner-approved headless token path.
- Configure Grok Bot runtime to use:
  - MCP URL: `https://your-bridge.example.com/mcp`
  - Token: bridge-issued MCP access token (never shared in prompts)
- Validate a non-sensitive call first, then a `grokbot_send` + `grokbot_verify` roundtrip.

## 4) Recovery and incident notes

- No stale lock removal on blind restart: process identity is persisted in `data/server.lock`.
- Stop stale process before deleting lock and restarting.
- Rotate secrets by deleting `data/access.json` only in maintenance mode (will require re-connection).
- Preserve raw `*.jsonl` history selections and private model/vector artifacts by not committing them.

## 5) Evidence expectations

Save and review:
- `docs/evidence/bridge/mcp-send-smoke.json`
- `docs/evidence/bridge/http-send-smoke.json`
- `docs/evidence/bridge/connector-readiness.json`
- OAuth/connector UI screenshots or audit entries from your actual Claude.ai and Grok Bot confirmation steps.
