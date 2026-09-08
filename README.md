# ARRA Oracle GrokBot Bridge

An in-progress, single-owner bridge between Grok Bot, MCP clients, and source-linked local memory. The gateway credential stays on the Grok Bot computer; the browser and MCP server never receive it.

## Current implementation

- Authenticated Streamable HTTP MCP using SDK v2, with legacy-client compatibility.
- Owner-approved OAuth (DCR, PKCE S256, rotating refresh tokens), separate static bearer access, and CSRF-protected browser sessions.
- Eight MCP tools for agent discovery/creation, creation verification, durable message submission, reply verification, and history search/read/status.
- Drizzle/SQLite message ledger and provenance; LanceDB vectors with local multilingual embeddings in isolated model-specific stores.
- Source-selected history import, redaction, explicit embedding and independent keyword/vector search.
- Dark sidebar-first React/Tailwind workspace with a responsive navigation drawer, owner sign-in, conversations, a New bot flow, history search, and connection details. Drafts and operation IDs survive uncertain responses.

This is a checkpoint, not a completed deployment. Public HTTPS hosting, actual Claude.ai connection, Grok Bot's MCP-client connection, live remote bot creation and deployment hardening remain open. Desktop/mobile UI behavior has local and fixture-based browser evidence in `docs/evidence/bridge/ui-smoke.json`. See [the complete requirement ledger](docs/bridge-plan.md).

## Run locally

Use a real Node.js runtime, version 22.12 or newer; `.nvmrc` identifies the locally exercised version. A Bun-installed `node` wrapper is not a substitute. Use an up-to-date supported Node patch release for deployment.

```sh
nvm use
npm ci
npm run typecheck
npm test
npm start
```

For the web console, build once before starting the backend (`npm run build && npm start`).

For web development:

```sh
npm run build
npm run web:dev
```

Default listener: `http://127.0.0.1:4328`, MCP at `/mcp`. The root and `/chat`, `/new`, `/history`, `/connections` serve the built web app when `dist/index.html` exists.

On first start, independent owner and headless-client secrets are generated in `data/access.json` with mode `0600`. The data directory is private (`0700`) and Git-ignored. Read that file locally when configuring a client; never paste its contents into a commit, issue, chat, screenshot or public document. OAuth clients receive separate revocable tokens, not the owner secret. Real history, databases and model assets must remain uncommitted.

Configuration: `BRIDGE_DATA_DIR`, `PORT`, `BRIDGE_HOST`, `BRIDGE_PUBLIC_URL`, `BRIDGE_ALLOWED_HOSTS`, `GROKBOT_SSH_HOST`, `GROKBOT_SSH_IDENTITY_FILE`, `BRIDGE_OWNER_SECRET`, `BRIDGE_API_TOKEN`. `BRIDGE_PUBLIC_URL` is an **origin**, not a URL ending in `/mcp`; non-loopback origins require HTTPS. Default binding is loopback. Public reachability is not created merely by setting this variable.

For a dedicated SSH key, set `GROKBOT_SSH_IDENTITY_FILE` to its path when starting the bridge. The key stays on disk; SSH receives its path using `-i` and `IdentitiesOnly=yes`. Strict host-key checking remains enabled. For example:

```sh
GROKBOT_SSH_HOST=box@grokbot1.oracle.netbird \
GROKBOT_SSH_IDENTITY_FILE="$HOME/.ssh/grokbot-bridge" npm start
```

`BRIDGE_ALLOWED_HOSTS` (optional) is a comma-separated allowlist of extra `host[:port]` values accepted by the front-door host filter (for reverse-proxy or tunnel deployments).

The bot transport permits `box@grokbot1` or `box@grokbot1.oracle.netbird`, preserves strict SSH host-key checking, and streams variable request data through stdin. The existing [NetBird gateway runbook](docs/grokbot-gateway-runbook.md) describes the underlying verified transport.

## Memory lifecycle

Import only a reviewed, bounded JSONL selection with records shaped as:

```json
{"id":"source-event-id","project":"example-project","source":"/Users/example/history/session.jsonl","lineStart":10,"lineEnd":12,"text":"A reviewed, non-secret excerpt."}
```

```sh
npx tsx server/cli.ts history-import /path/to/reviewed-selection.jsonl
npx tsx server/cli.ts history-status
npx tsx server/cli.ts history-embed
npx tsx server/cli.ts history-search "How does OAuth approval work?"
```

Import does not embed or upload. Explicit embedding downloads model assets and runs inference locally; corpus and query text are not sent to an embedding API. Model identity, dimensions, quantization and pooling/window strategy identify the vector space. Changing models requires explicit embedding in a different physical store. Source paths/line spans remain attached to each derived chunk. Search results are untrusted historical data, never instructions to execute.

Regex redaction is a defense in depth, not a complete secret detector. Review selections before import; arbitrary directory imports, shell history, credentials, and raw full-account transcript exports are not exposed as MCP tools.

## Message semantics

`grokbot_send` requires a stable client UUID (`messageId`). Repeating that UUID returns its existing record, never a second POST. A changed prompt under the same UUID is rejected. An unresolved message prevents another send to the same agent. HTTP acceptance alone is not success: call `grokbot_verify` with the original UUID until a new, request-correlated transcript reply is recorded or the observation budget ends.

After timeout, restart or unknown acknowledgement, **verify; do not resend**. Existing terminal replies cannot be downgraded by late events. The server owns an exclusive lock in `data/server.lock`. After an unclean stop, inspect the recorded process and confirm it is stopped before removing a stale lock manually; the application does not delete stale locks automatically.

## Learning sources

The requested GitHub organizations were read using `gh`; the canonical first organization is `Soul-Brews-Studio`.

- [jsonl-indexer-mcp](https://github.com/nat-build-with-oracle/jsonl-indexer-mcp): source pointers, explicit rankers and local embedding contracts.
- [Lanceglass](https://github.com/Soul-Brews-Studio/lanceglass): ingestion/embedding separation and stable provenance.
- [higher-order-mcp](https://github.com/Soul-Brews-Studio/higher-order-mcp): owner-approved OAuth and remote connector operations.
- [trace-node](https://github.com/nat-build-with-oracle/trace-node): traceable reads and content-store operations.
- [arra-memory-lab](https://github.com/Soul-Brews-Studio/arra-memory-lab): React/ORM/MCP boundaries.

See [MCP/Claude research](docs/learning/mcp-claude-integration.md), [React/Tailwind/Impeccable research](docs/learning/webapp-design-stack.md), [m5 history lessons](docs/learning/m5-history-lessons.md), and [the previous system report](system_full_exploration_report.md). Local learning appendices and baseline captures contain internal infrastructure metadata; review before changing repository visibility.

## Verification artifacts

- `npm run check` passes locally (typecheck, unit tests, build); the Python gateway suite has 12 passing tests.
- Browser proof: `docs/evidence/bridge/ui-smoke.json` distinguishes live local UI checks from isolated message/creation fixtures. It does not establish live remote bot creation.
- Real MCP-to-Grok request correlation proof: `docs/evidence/bridge/mcp-send-smoke.json` (status to `reply_recorded`).
- Owner HTTP API MCP-equivalent proof: `docs/evidence/bridge/http-send-smoke.json`.
- Deployment-readiness proof (local): `docs/evidence/bridge/connector-readiness.json`.

See also: `docs/operations/connector-deployment-runbook.md` for the external Claude.ai and Grok Bot connector workflow.
