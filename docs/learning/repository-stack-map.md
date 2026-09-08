# Source map and learned stack decisions

Checked 2026-09-08 through authenticated `gh` CLI. No remote repository was modified. Selected source checkouts are separate from the bridge implementation.

| Source | Inspected commit | Applied lesson |
|---|---|---|
| [jsonl-indexer-mcp](https://github.com/nat-build-with-oracle/jsonl-indexer-mcp/tree/24088c3be6b1fb91cbdeef83bd5383975349c06e) | `24088c3` | Persist file/line provenance; keep keyword and vector modes explicit; align embedding windows and query preprocessing with the model. |
| [Lanceglass](https://github.com/Soul-Brews-Studio/lanceglass/tree/cdfeca860b359cfd43dcfc3e77e39496f810c07a) | `cdfeca8` | Separate import from explicit embedding; incompatible embedding spaces must not share a physical store; browser and adapters share one engine. |
| [higher-order-mcp](https://github.com/Soul-Brews-Studio/higher-order-mcp/tree/8a9693f51fb010bc2586e8887b0f1df194c561b2) | `8a9693f` | Owner approval, client tokens and deployment identity are distinct; remote Claude.ai needs tested public transport/auth, not merely a local endpoint. |
| [trace-node](https://github.com/nat-build-with-oracle/trace-node/tree/b11ef3e548f930abed526aea0d231b272d655e09) | `b11ef3e` | Content provenance and read intent are useful audit concepts; an owner-only content store is not multi-tenant isolation. |
| [arra-memory-lab](https://github.com/Soul-Brews-Studio/arra-memory-lab/tree/6251a6309937bd9038a46d149fb8d1f6827afc73) | `6251a63` | React, relational persistence and MCP can share backend contracts; credentials belong server-side, not in built frontend assets. |

## Webapp, React, Tailwind and Impeccable

The [frontend learning brief](webapp-design-stack.md) records current official React/Vite/Tailwind APIs and the Impeccable setup/approval/review gates. A typed API client and pure conversation state machine are implemented; visual design and the React surface remain pending. Pure state transitions retain drafts and stable IDs even when sends become uncertain. Rendering/effects must not create a second send.

## Vector DB, LanceDB and ORM

The bridge uses **Drizzle with SQLite** for authoritative message/provenance records, and **LanceDB** for derived vectors. These are complementary stores, not one transactional database. Drizzle provides typed relational queries; source update transactions and vector readiness checks still require explicit application invariants. This follows the driver's supported integration and LanceDB's vector-query APIs. [Drizzle SQLite documentation](https://orm.drizzle.team/docs/sqlite/get-started-sqlite), [LanceDB vector search](https://docs.lancedb.com/search/vector-search).

Actual local inference uses `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, quantized CPU execution, normalized pooling, and token windows to avoid silent long-text truncation. Its 384-dimensional vectors are stored under a directory derived from the full configured model/processing identity. Model assets download from Hugging Face; corpus/query text is processed locally rather than submitted to an embedding API. A repository ID is not a cryptographically pinned model revision; strict asset fingerprinting remains future hardening. [Model card](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2), [Transformers.js](https://huggingface.co/docs/transformers.js/en/index).

The bounded real-history selection produced **15 documents / 46 chunks / 46 embedded chunks**. Three semantic smoke queries each returned three source-linked hits. This proves a real embedding-to-LanceDB retrieval path, not broad retrieval accuracy. Unit storage tests use explicitly synthetic encoders and are not substituted for that live evidence. [Local vector proof](../evidence/bridge/local-vector-smoke.json), [source-history lessons](m5-history-lessons.md).

The implementation now guards concurrent source changes with content-hash checks, preserves terminal reply states against late updates, pages past retired vector candidates, bounds import reads before allocation, and fails closed on existing server locks. [Core review](bridge-core-review.md).

## MCP and verification boundaries

The [MCP research/implementation notes](mcp-claude-integration.md) distinguish current SDK v2 from frozen OAuth routing helpers, owner consent from token grants, and local tests from actual hosted-client acceptance. The deployed-interface requirements are still open; no public connector URL or account connection has been fabricated.

The independent v2 SDK client successfully listed all six tools, discovered OMX Proxy through the real NetBird backend, and retrieved three semantic hits. **No prompt was sent by this smoke test.** [MCP read-only proof](../evidence/bridge/mcp-readonly-smoke.json).

## Dependency checkpoint

Initial installation reported vulnerable transitive `sharp` and `adm-zip` versions. Narrow overrides to `sharp@0.35.4` and `adm-zip@0.6.0` replaced them; the subsequent npm audit reported zero known vulnerabilities, and local embedding/native-database checks passed. This is a point-in-time dependency check, not a security certification. [Initial audit](../evidence/bridge/npm-audit-initial.json), [patched audit](../evidence/bridge/npm-audit-patched.json).
