# Claude.ai ↔ Grok Bot MCP integration

**Research date: 2026-09-08 (UTC).** Official documentation, SDK source, and publisher package metadata were read. This document describes requirements and proposed implementation; it does **not** establish that an account was connected, OAuth consent completed, a public endpoint deployed, or Grok Bot's MCP client tested.

## 1. Architecture decision

Use an authenticated **Streamable HTTP** bridge at a stable HTTPS URL such as `https://bridge.example.com/mcp`. Keep Grok Bot's private gateway and its credential behind the bridge. The public MCP access token and the private gateway credential must be separate credentials.

Ordinary Claude.ai remote connectors execute from Anthropic infrastructure, not from the browser's machine. A working local SSH/NetBird route therefore does not establish Claude.ai connectivity. A private-only `grokbot1.oracle.netbird` URL is not a public connector deployment. Local Desktop subprocess configuration is a different integration surface. [Claude Help: remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

For this project, the proposed separation is:

```text
Claude.ai ── HTTPS + user OAuth ──┐
                                ├── MCP bridge ── private authenticated adapter ── Grok Bot
Grok Bot MCP client ── bearer ───┘       │
                                       ├── relational authorization/job metadata
React webapp ── browser session ────────┤
                                       └── owner-authorized vector history
```

The webapp is an additional first-party client, not what makes a server MCP-compatible. Do not expose SSH execution, a general URL proxy, the gateway token, or unrestricted database queries as MCP tools. Proposed tools should list authorized agents, send to a pinned agent, inspect a submitted job, and search authorized history. Prevent a Grok Bot agent from recursively invoking a tool that sends back to itself.

**Private-network exception:** Anthropic offers MCP Tunnels as an Enterprise, by-request research preview. It uses an outbound tunnel stack and an organization-specific Anthropic tunnel hostname; it is not automatic NetBird support. The proxy's default upstream range is RFC 1918 IPv4, which excludes this project's `100.97.*` overlay addresses. OAuth remains required on the MCP server. A tunnel created for Claude Console cannot serve a claude.ai organization. Eligibility, approved upstream routing, and actual client testing remain prerequisites. [Official MCP Tunnels overview](https://claude.com/docs/connectors/mcp-tunnels/overview)

## 2. Current SDK baseline: v2 is stable

The official SDK README identifies v2 as the stable line implementing the `2026-07-28` protocol. Do not repeat old search-cache descriptions of v2 as an alpha. [Official SDK repository](https://github.com/modelcontextprotocol/typescript-sdk)

The publisher's npm registry returned **2.0.0** and **Node >=20** for each package below on the research date:

| Package | Role | Primary version evidence |
|---|---|---|
| `@modelcontextprotocol/server` | Server, HTTP handler, core auth types | [Registry metadata](https://registry.npmjs.org/@modelcontextprotocol/server/2.0.0) |
| `@modelcontextprotocol/node` | Node HTTP adapter | [Registry metadata](https://registry.npmjs.org/@modelcontextprotocol/node/2.0.0) |
| `@modelcontextprotocol/express` | Express integration and resource-server auth | [Registry metadata](https://registry.npmjs.org/@modelcontextprotocol/express/2.0.0) |
| `@modelcontextprotocol/server-legacy` | Frozen authorization-server/SSE compatibility helpers | [Registry metadata](https://registry.npmjs.org/@modelcontextprotocol/server-legacy/2.0.0) |

Pin the selected package generation in the lockfile. Do not mix v1 deep imports such as `@modelcontextprotocol/sdk/server/mcp.js` with v2 examples. The legacy package exports `/auth`, not arbitrary `/auth/provider` subpaths. It explicitly describes itself as deprecated, frozen migration support. [Legacy package manifest](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server-legacy/package.json)

### HTTP factory and adapter

`createMcpHandler` builds a fresh server from its factory per HTTP request. Its returned handler supports `fetch` and `close`; token verification and host/origin policy must run before it. Avoid keeping user-specific mutable state in a singleton `McpServer`. Put durable jobs and history behind injected services. [SDK HTTP guide](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html)

The following is an **integration scaffold**, not a complete application. `checkedVerifier`, `authorizationServerMetadata`, and `bridge` represent implementation dependencies; none may be replaced by an allow-all stub in a deployed service.

```ts
import {
  createMcpExpressApp, requireBearerAuth,
  mcpAuthMetadataRouter, getOAuthProtectedResourceMetadataUrl,
} from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const resource = new URL('https://bridge.example.com/mcp');
const app = createMcpExpressApp({
  host: '0.0.0.0',
  allowedHosts: [resource.hostname],
  allowedOrigins: [resource.hostname],
});
const handler = createMcpHandler(({ authInfo }) => {
  const server = new McpServer({ name: 'grokbot-bridge', version: '0.1.0' });
  server.registerTool('history_search', {
    description: 'Search history visible to the authenticated principal',
    inputSchema: z.object({ query: z.string().min(1).max(2000) }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ query }) => {
    const hits = await bridge.searchAuthorizedHistory(authInfo, query);
    return { content: [{ type: 'text', text: JSON.stringify(hits) }] };
  });
  return server;
});
const adapt = toNodeHandler(handler);
const gate = requireBearerAuth({
  verifier: checkedVerifier,
  requiredScopes: ['bridge:read'],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource),
});
app.use(mcpAuthMetadataRouter({
  oauthMetadata: authorizationServerMetadata,
  resourceServerUrl: resource,
}));
app.all('/mcp', gate, (req, res) => void adapt(req, res, req.body));
```

The Express app factory installs JSON parsing; passing `req.body` prevents re-reading an already-consumed request stream. Host/origin defaults protecting localhost do not automatically protect an all-interface bind. Explicit allowlists are required; absent `Origin` must not itself reject non-browser MCP clients. Review proxy header handling rather than globally trusting forwarded headers. [SDK Express guide](https://ts.sdk.modelcontextprotocol.io/v2/serving/express.html)

`OAuthTokenVerifier.verifyAccessToken` returns verified `AuthInfo`, including `expiresAt` in epoch seconds; an omitted expiry is rejected. Reject invalid credentials using the SDK OAuth error type, not a generic exception that becomes a server error. Verification must establish issuer, audience, expiry and principal, not merely decode a JWT. `clientId` identifies the OAuth client and must not substitute for the resource owner's identity. Preserve a separately verified user/tenant subject for authorization. [SDK authorization guide](https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization.html)

### Version compatibility is a test, not an assumption

Keep the default `legacy: 'stateless'` while supporting current clients. It accepts 2025-era initialization and requests without maintaining protocol sessions; legacy `GET` and `DELETE` receive 405. Setting `legacy: 'reject'` deliberately excludes those clients. An old session-dependent client needs a deliberate compatibility route, not accidental in-memory session sharing. [SDK legacy-client guide](https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.html)

The 2026 transport uses one POST endpoint with JSON or request-scoped SSE replies; its GET stream and protocol sessions were removed. It requires validation of a supplied Origin and supports both response media types. Thus “Streamable HTTP” alone does not identify a client's protocol generation. A reverse proxy must not buffer SSE indefinitely. [MCP Streamable HTTP specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)

## 3. Claude.ai authentication and URL contract

Configure the canonical HTTPS MCP URL, normally `/mcp`; a URL ending `/sse` can select the older transport in Claude's UI. An owner adds an organizational connector, then members connect. Pre-registered OAuth client credentials can be entered; the secret is optional unless the authorization server requires it. Static request-header authentication exists but is a limited-organization beta, so a bearer-only implementation is **not** a generally available Claude.ai onboarding solution. OAuth owns the Authorization header when OAuth is enabled. [Claude custom-connector guide](https://claude.com/docs/connectors/custom/remote-mcp)

Claude-specific requirements:

- Hosted callback: `https://claude.ai/api/mcp/auth_callback`.
- CIMD selection requires both `client_id_metadata_document_supported: true` and `none` among token-endpoint authentication methods; DCR remains supported.
- Support PKCE S256 and advertise it in authorization-server metadata.
- Return an actual HTTP 401 for discovery; a 200 carrying an authentication challenge does not work.
- Protected-resource `resource` must equal the configured MCP URL, including path.
- Claude uses the first advertised authorization server, without trying subsequent entries.
- Token exchange and refresh bodies are form-urlencoded; DCR bodies are JSON.
- A machine-only `client_credentials` grant is not the ordinary Claude.ai user-connection flow.
- Discovery, registration and initial token requests have ten-second limits; refresh has thirty seconds. Invalid refresh grants must use the standard `invalid_grant` error.

[Claude connector authentication reference](https://claude.com/docs/connectors/building/authentication)

Prefer CIMD or explicit pre-registration for new integrations. The current MCP specification deprecates DCR but retains it for compatibility; supporting DCR is a conscious interoperability choice, not a claim that it is the new preferred mechanism. CIMD fetching itself requires redirect/metadata validation and SSRF protection. [MCP client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)

Proposed deployment URL map:

| Route | Exposure/purpose |
|---|---|
| `https://bridge.example.com/mcp` | Authenticated MCP resource; exact token audience/resource |
| `https://bridge.example.com/.well-known/oauth-protected-resource/mcp` | Public resource discovery; identifies the issuer |
| Issuer's `/.well-known/oauth-authorization-server` or OIDC discovery | Public authorization metadata |
| Issuer's advertised authorization endpoint | User login and informed consent |
| Issuer's advertised token endpoint | Code redemption and refresh, never gateway credential delivery |
| Issuer's registration endpoint, if enabled | Bounded DCR, not automatic user authorization |

MCP tokens belong in request headers, never URL query strings. Validate tokens for this exact resource and reject invalid/expired credentials with 401; insufficient permission is 403 at the HTTP authorization boundary. Scopes are not a replacement for object-level ownership checks. [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

The current published Anthropic outbound IPv4 range is `160.79.104.0/21`. If using an edge allowlist, recheck the official list during deployment and cover authorization discovery/token hosts as well as `/mcp`. Browser consent pages must also remain reachable by the user's browser; an Anthropic-only firewall is not sufficient for interactive login. An IP allowlist is defense in depth, not user authentication. [Anthropic IP reference](https://platform.claude.com/docs/en/api/ip-addresses)

## 4. OAuthServerProvider: deliberate compatibility option

For a fresh production deployment, the SDK recommends a dedicated authorization server. If this project deliberately implements its own owner-approved OAuth service, it may use frozen routing helpers while owning all credential, consent and persistence logic. This choice must remain visible in dependency and deployment documentation.

```ts
import {
  mcpAuthRouter,
  type OAuthServerProvider,
} from '@modelcontextprotocol/server-legacy/auth';
```

The public export is verified in the [legacy auth index](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server-legacy/src/auth/index.ts).

The provider contract requires a registered-client store plus `authorize`, `challengeForAuthorizationCode`, `exchangeAuthorizationCode`, `exchangeRefreshToken`, and `verifyAccessToken`; `revokeToken` is optional. Authorization receives scopes, redirect URI, PKCE challenge, optional resource, state and issuer. Code exchange also receives verifier, redirect and resource. These are inputs to enforce, not ignorable decoration. `skipLocalPkceValidation` must stay off unless an upstream actually validates PKCE. If consent redirects occur on a separate response, implement advertised issuer-response behavior explicitly. [Provider interface source](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server-legacy/src/auth/provider.ts)

Mount `mcpAuthRouter` at application root, not beneath `/mcp`. Supply `issuerUrl` and **explicit `resourceServerUrl`**, or metadata can describe the issuer rather than the actual MCP path. Registration is mounted only when the client store supports registration; revocation only when the provider implements it. Do not enable the insecure-issuer escape hatch in production. [Router source](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server-legacy/src/auth/router.ts)

Project implementation requirements, not SDK-provided guarantees:

- Persist clients, pending approvals, one-use authorization codes, token hashes, refresh families, owner identity and grants in a dedicated authorization store. Expire and bound every temporary collection; survive restarts without silently granting access.
- Require owner authentication and explicit consent; DCR creates a client, **not** permission to use Grok Bot. Bind approval to the exact client, redirect, scope, challenge and resource. Reject scope escalation and replay.
- Issue short-lived access tokens, rotate refresh tokens atomically, revoke token families on detected reuse, and support explicit revocation. Never log raw credentials or accept an arbitrary supplied principal.
- Keep browser session credentials separate from MCP credentials. Use HttpOnly/Secure production cookies, strict SameSite, CSRF checks and validated Origin for browser mutations. Never put owner or gateway secrets into React build variables.
- Bound login/registration traffic and inputs; do not allow arbitrary redirects, fetched URLs, unbounded client creation, or automatic approval by a GET request.

These requirements implement the specification's audience separation, secure credential handling, PKCE/redirect controls and token-passthrough prohibition. [MCP authorization security considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations)

## 5. Acceptance gates — proposed, not executed by this research

1. **Build/API:** compile against pinned SDK packages; exercise real JSON-RPC requests, not only HTTP status checks. Verify parsed-body forwarding and fresh per-request server construction.
2. **Transport:** test modern requests and a 2025 initialization/client path; tools/list and a read-only tool; JSON and SSE responses; invalid protocol/version/body; expected 405 behavior; shutdown/cancellation and proxy streaming. Record actual client versions.
3. **Auth discovery:** anonymous `/mcp` returns 401 with a working metadata pointer; discovery is public; resource/issuer match configured URLs; S256 and token authentication methods are truthful.
4. **Authorization abuse:** invalid, expired, revoked, wrong-audience and wrong-issuer tokens fail; malformed/scope-escalating requests fail; code replay, wrong PKCE and changed redirect/resource fail; refresh reuse revokes its family. Restart preserves revocation and unredeemed-code state.
5. **Owner/browser:** missing owner secret cannot approve; authorization GET cannot grant; cookie authentication does not authorize cross-site mutation; login is throttled; errors/logs expose no raw tokens. A static Grok Bot token must have explicit limited permissions.
6. **Isolation:** one user cannot list, search, read, send to, or retrieve another user's objects. Apply ACLs before vector retrieval and recheck returned row ownership; do not assume ORM or LanceDB provides authorization automatically.
7. **Side effects:** use a stable submission identifier and persisted state. Retrying after an uncertain gateway response must not send another prompt. Return a job/status handle for long work; preserve backend prompt/reply correlation. Test recursion prevention.
8. **Public client:** after explicit account/deployment approval, add the custom connector in Claude.ai, complete consent, run a read-only call, then one approved write and verify its backend result. Separately configure and test Grok Bot's MCP client. No pass may be inferred from local Inspector alone.

Anthropic recommends Inspector checks followed by the real custom-connector runtime; no separate Claude staging environment is provided. ClientInfo names vary and are unauthenticated, so they are telemetry, not an authorization identity. [Official connector testing guide](https://claude.com/docs/connectors/building/testing)

## 6. Public deployment blockers and boundaries

The remaining deployment prerequisites are a user-approved public hostname and TLS termination (or eligible approved MCP Tunnel), a reachable bridge host with the private backend route, persistent secret/storage provisioning, tested authentication and owner consent, and permission to configure the two client applications. A reverse proxy must preserve authentication challenges and streaming while restricting unexpected hosts/origins. Service ownership, logging/redaction, backups, retention and revocation procedures need an operator.

The research did **not** provision DNS, open a firewall, start a public tunnel, create an OAuth account, grant client access, or verify Grok Bot's MCP-client configuration. Those are deployment/acceptance work, not reasons to prevent safe local implementation. References to provider examples establish API shape, never production security certification.

## 7. Local implementation follow-up (same date)

The assigned follow-up implements [authorization](../../server/auth.ts), [MCP tools](../../server/mcp.ts), and [local regression tests](../../tests/auth.test.ts). These are **single-owner** services: an owner-approved client receives access to that owner's corpus, constrained by `bridge:read` and `bridge:write`. They do not implement separate user/tenant ACLs. Multiuser deployment requires an identity-aware BridgeApi and storage authorization changes first.

The implementation deliberately uses the frozen SDK auth router, public-client DCR, and an independently persisted SQLite provider. It does **not** advertise CIMD. Registration permits only the exact hosted Claude callback or HTTP loopback `/callback`; arbitrary public callback registration and confidential-client authentication are intentionally rejected. Access tokens expire after fifteen minutes, refresh tokens rotate, and token/cookie/code credentials are hashed at rest. Interactive approval requires the owner secret plus a one-use browser-bound ticket. Initial discovery requests both read and write so Claude's ordinary connection can send after informed consent; explicitly read-only grants remain supported and cannot send. Browser sessions use strict SameSite cookies and mutation CSRF checks.

Eight local regression tests passed under real Node 22, including complete simulated OAuth issuance, rejection cases, restart persistence, refresh replay/revocation, browser sessions, and MCP read/write scope enforcement. This is not Claude.ai account acceptance. The tool description warns against agent self-recursion, but caller-agent identity is not in the current API contract, so a hard recursion guard is not claimed. Public deployment prerequisites in section 6 remain outstanding.
