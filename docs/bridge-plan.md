# Grok Bot bridge — implementation and completion ledger

Original objective: learn webapp / Tailwind / React / vector DB / LanceDB / ORM / Impeccable skills; create MCP to talk with Grok Bot from Claude.ai and Grok Bot; learn from our history under beta@m5. Subsequent routing: use `beta@m5.oracle.netbird`, and `gh` for Soul-Brews-Studio and nat-build-with-oracle sources.

## Architecture being implemented

- TypeScript backend with a shared service behind MCP, browser API and local CLI.
- React/Tailwind operator UI. Product/visual approval questions are open; no approved visual world is fabricated.
- Grok Bot gateway accessed through fixed NetBird SSH, with its credential staying on the bot machine. Durable message IDs, one POST, and scoped transcript verification preserve the earlier proven transport.
- Drizzle + SQLite owns message runs and source provenance. LanceDB stores separate, model-identified local embeddings. Keyword and semantic ranks remain explicit rather than presenting arbitrary fused scores as relevance truth.
- History extraction is source-manifest based, redacted, bounded and read-only on m5. Raw account histories and model data are private local artifacts, never published.
- Streamable HTTP MCP, OAuth owner approval for Claude.ai, static bearer support for headless Grok Bot use. Private NetBird reachability and public Claude.ai reachability are distinct verification gates.

## Requirements and proof still owed

- [x] Source-backed learning documents cover the named stack areas and five selected repositories; see `docs/learning/` and the source map.
- [x] Fifteen relevant m5 excerpts across five topics were actually read, source-verified, learned from and indexed into 46 chunks. This is a bounded selection, not all account history.
- [x] React/Tailwind interface operates against the real backend (build served at `/`, `/chat`, `/history`, `/connections`), with responsive/accessibility and product approval remaining.
- [x] LanceDB queries use actual local multilingual embeddings for all 46 chunks; ORM provenance and idempotent ingestion are exercised. Three live semantic queries return three hits each; no broad relevance-quality claim.
- [x] Local authenticated MCP initialize/list/call works with the independent v2 SDK client. Negative auth, consent/PKCE, CSRF and read-only grant cases are tested. This does not prove Claude.ai acceptance.
- [x] One end-to-end MCP Grok Bot prompt receives a request-correlated real reply; uncertain sends remain read-only via explicit verification and do not auto-resend.
- [ ] Claude.ai connector is deployed, authenticated, and actually tested from Claude.ai, not inferred from local tests.
- [ ] Grok Bot can use the MCP endpoint for retrieval, verified from its actual client/runtime.
- [x] Operating instructions, secret handling, deployment/recovery notes, and retrospective updates are now captured.

## Current observations

- Previous goal was completed with a real OMX Proxy reply. This new goal is separate and remains active.
- `beta@m5` uses an old LAN SSH override and times out. The user-specified `beta@m5.oracle.netbird` authenticates successfully.
- Canonical GitHub org is `Soul-Brews-Studio`; `soulbrewsstudio` was not recognized. `gh` access to both requested organizations succeeds.
- Local deployment-readiness evidence now exists at `docs/evidence/bridge/connector-readiness.json`; this confirms metadata/tooling checks from local run context.
- Public HTTPS endpoint/hosting and actual external connector testing remain open.

No external deployments/connector account connections have been completed yet.

## Commit checkpoint

The repository is now tracking a checkpointed public/private-safe implementation on `main` in `nat-build-with-oracle/omx-grokbot`. Sensitive runtime files remain excluded. The active goal remains incomplete until actual external connector/client verification is completed.
