# Operator webapp: stack research and proposed product brief

**Research date:** 2026-09-08.  
**Status:** implementation guidance and a **proposed** operator brief, not an approved visual world or a shipped-interface specification. No UI or package files were changed in this task.

## 1. Full objective and evidence boundary

The requested product is a **React/Tailwind operator webapp plus a Grok Bot MCP bridge, LanceDB vector search, and ORM-backed conversation history**. The owner is a private/single-owner operator. **Authenticated remote MCP usable from Claude.ai is required**; “private operator” must not be translated into “localhost-only MCP” or a mock connection panel.

Known operational truth from this repository:

- The internal connection is NetBird SSH to `box@grokbot1` (`grokbot1.oracle.netbird`), then remote-loopback gateway HTTP. Preserve strict SSH host-key checks.
- The identified agent is **OMX Proxy**. Its historical ID is evidence, not a permanent target to hardcode across environments.
- A gateway acceptance is not a bot reply. The existing helper correlates new transcript output to the sent prompt using agent, watermark, marker and request ID.
- The gateway token belongs on the remote/backend side, never in browser code or copied from native application state.
- An uncertain send must be reconciled rather than automatically repeated.
- The native application can contain an unsent draft; this webapp must use its own composer and must not mutate that native draft.

Evidence: [gateway runbook](../grokbot-gateway-runbook.md), [verified exchange](../evidence/grokbot-omx-proxy-verify.json), [native draft boundaries](../grokbot-native-findings.md).

### Explicitly unresolved

The public HTTPS hostname, hosting/reverse-proxy arrangement, MCP authorization provider/registration details, browser session policy, embedding provider/model and data-retention/export policy need implementation/owner decisions. None is invented here. A product-wide visual identity and comp-first/code-first preference have not been approved.

## 2. Current official stack guidance

### React + TypeScript + Vite

**Recommendation:** a TypeScript React SPA with a separate trusted backend is a suitable operator-client starting point. This is a product-specific recommendation, not a claim that React universally recommends bare SPAs. React documents Vite's `react-ts` scaffold while noting that routing, fetching and other framework concerns remain the application's responsibility. SSR/SEO are not established requirements for this private operator surface. [React: build from scratch](https://react.dev/learn/build-a-react-app-from-scratch)

The current Vite guide requires **Node 20.19+ or 22.12+**, with a warning that particular templates can require more. Use an explicit compatible Node executable and lock resolved package versions; the workstation evidence found different Node launch contexts. Preserve existing documentation rather than blindly scaffolding over the repository root. The `react-ts` template is supported. [Vite: getting started](https://vite.dev/guide/)

Indicative scaffold command for a new, deliberately selected client directory—not executed by this research:

```sh
npm create vite@latest client -- --template react-ts
```

The root implementer owns final workspace layout, package manager, dependency versions and scripts. Keep native/backend-only dependencies out of the client graph.

### Tailwind's current Vite integration

The live Tailwind documentation identifies **v4.3**. Its Vite path installs `tailwindcss` plus `@tailwindcss/vite`, adds the plugin, and imports Tailwind from CSS. Do not substitute an old v3 `tailwindcss init -p` recipe. [Tailwind: Vite installation](https://tailwindcss.com/docs/installation/using-vite)

Illustrative integration, to merge with—not replace—the real Vite configuration:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

```css
@import "tailwindcss";
```

Use `@theme` for tokens intended to generate utilities, with ordinary CSS variables for values that do not need utility generation. `@theme inline` is relevant when an exposed token references another variable. Proposed neutral/accent values should remain proposals until the actual UI world is chosen. [Tailwind: theme variables](https://tailwindcss.com/docs/theme)

Tailwind scans source as text. Keep conditional classes in complete literal alternatives, such as an explicit status-to-class map; avoid fragments like `` `bg-${state}-500` `` that the scanner cannot reliably infer. Account for source paths explicitly if the client is in a workspace outside automatic detection. [Tailwind: source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files)

### Browser/server safety boundary

The browser should call the application backend at the same origin. **Never put gateway tokens, SSH material, MCP client secrets, ORM credentials, or embedding API keys in `VITE_*` variables**: Vite places these values in client-delivered code. A secret lacking that prefix can still leak if application code explicitly serializes it; prefix choice alone is not a security model. [Vite: environment variables](https://vite.dev/guide/env-and-mode)

For development, Vite can proxy an application API prefix to the backend. Bind development services deliberately, retain host/CORS restrictions, and do not set broad `allowedHosts: true` merely to make a tunnel work. A development-server proxy is not the production MCP deployment or authorization layer. [Vite: server options](https://vite.dev/config/server-options)

The remote MCP authorization flow is a separate interface from the internal Grok gateway credential. The official MCP authorization tutorial currently resolves to the **2026-07-28** documentation and discusses authorization/discovery for remote servers. The connections UI must represent actual deployed authorization state, not imply that copying the internal gateway token into Claude.ai is the connection procedure. The server/auth implementer owns the exact protocol and provider decisions. [MCP: authorization](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/authorization)

## 3. Proposed operator experience

**Surface mode: Operate.** The visitor is accomplishing a task, not evaluating a marketing claim. The proposed first viewport should answer: **Which bot am I addressing? Is its transport usable? What happened to my last send? Where do I type?**

### Structural proposal

- **Desktop:** a compact left navigation/history rail, a generous conversation column, and optional inline turn details. Do not spend the first screen on stat cards, a hero, product slogans or decorative charts.
- **Chat:** clear agent selector/name, concise transport status, chronological messages, per-turn delivery state, persistent composer and deliberate Send action.
- **History:** search field, exact/semantic mode indicator, agent/date/status filters, result excerpts, and a link to the matching message in its conversation. Results are real stored records; no invented “recent chats.”
- **Connections:** distinguish the **internal NetBird/Grok gateway** from the **public HTTPS MCP endpoint for Claude.ai**. Show configuration, authentication, last successful test, error details safe for display, and a truthful next step.
- **Mobile:** collapse the rail into a labeled navigation control, make the transcript the primary surface, and move turn details below their message rather than squeezing three columns. Composer must remain usable with the software keyboard; content must not disappear under fixed chrome.

This topology is proposed, not a completed concept-selection round. Responsive behavior is structural; changing only font size is insufficient.

### Proposed restrained visual defaults

One system-sans family for interface text; a compact fixed-rem type scale; monospace only for IDs, timestamps and copyable configuration; off-white/neutral content with a slightly differentiated navigation surface; one restrained accent for primary action and selected state. Borders and spacing should establish hierarchy before shadows do. No decorative gradients, glass panels, display-font controls, custom scrollbars or page-load choreography.

The distinguishing detail is **evidence-visible message delivery**, not a novel chat bubble shape: a compact per-turn line exposes accepted/verified/uncertain state and opens the exact correlation details when requested. Routine scanning stays calm; forensic detail is one action away.

These defaults come from the operator scene and the loaded Impeccable Operate guidance. They are not user-approved brand tokens, so they are not written into DESIGN.md as settled authority.

## 4. Chat state and interaction contract

Suggested state vocabulary (server contract must finalize exact names):

```text
Draft -> Preparing -> Sending -> Accepted -> Verifying -> Reply verified
                      |              |
                      +----------> Delivery uncertain -> Check reply

Pre-send validation failure -> Draft retained + specific error
Read-only verification timeout -> Waiting/unverified, not a new send
```

Required behavior:

1. Select/pin a real agent before sending. Never silently retarget to the gateway's current active agent.
2. Submit only from a deliberate user event. Do not send from render, a mount effect, route navigation, reconnect or a retrying fetch layer.
3. The UI needs a stable operation ID/correlation key before it can safely resume a send after navigation or reload. The backend should persist that operation and distinguish acceptance from verified transcript output.
4. Show a pending/accepted user turn without fabricating an assistant reply. A success-colored “Sent” badge must not mean “bot answered.”
5. On ambiguous delivery, offer **Check reply**, not **Retry send**. Reconciliation reuses the same operation and marker. A genuinely new prompt must require a deliberate new action.
6. Preserve unsent drafts per webapp conversation/agent. Do not clear because a polling response arrived, a route changed, or an error occurred. State storage and retention must be explicit; native-app drafts remain untouched.
7. Keep scrolling stable. Autoscroll only if the reader is already near the latest message; otherwise offer a “New reply” control. Do not move focus into new output.
8. Distinguish stopping observation from cancelling bot execution. Do not label a local polling-stop button “Stop bot” unless a supported cancellation operation exists and is wired.

React controlled textareas need a string `value` and a synchronous `onChange` update; keep placeholder text separate from content and give non-submit buttons explicit types. Stable component keys avoid destructive remounts. [React: textarea](https://react.dev/reference/react-dom/components/textarea)

Use effects for read-side synchronization/subscriptions with cleanup, not transactional sends. React Strict Mode performs an additional development setup/cleanup cycle, so a send-on-mount effect can cause duplicate work. Aborting a browser request or cleaning up an effect is not proof that a remote POST was cancelled. [React: useEffect](https://react.dev/reference/react/useEffect)

## 5. History and LanceDB: UI requirements, not replacement storage

The ORM-backed store should be the authoritative webapp history/operation record. LanceDB is the requested vector-search layer, not a substitute for canonical conversation IDs, lifecycle status or transcript provenance. Both must be implemented; a static search box or a keyword-only implementation labeled “semantic” would narrow the objective.

Proposed practical requirements for the backend/UI contract:

- Store message ID, conversation/agent ID, role, text, timestamps, operation/request/correlation IDs, lifecycle status and remote source references separately from vector data.
- Index only authorized persisted content. Track indexing status independently so an embedding failure does not disguise a successfully stored message or bot reply.
- A result carries a stable message ID and source excerpt. Opening it should land on that message and expose its full stored context without resending anything.
- Label **exact/text** and **semantic/vector** behavior accurately. Do not show an uncalibrated distance as “confidence 97%.” Record the embedding model/dimension/index version so incompatible embeddings are not silently mixed.
- Handle indexing pending/unavailable, empty history, no matches, malformed query, backend failure, pagination and long messages explicitly.
- Debounce search input and discard stale responses when query/filter state changes. Preserve search state in navigation so Back restores the operator's place.
- Retention/deletion/export behavior must keep the ORM and vector index consistent; do not add automatic whole-host history ingestion or destructive cleanup without the owner's scope decision.

LanceDB/ORM package/API selection is owned by the corresponding server research, not asserted here from uninspected package versions.

## 6. Connections and remote MCP surface

The page must present separate diagnostic layers rather than one misleading green dot:

| Layer | Useful displayed facts | What it must not imply |
|---|---|---|
| Internal SSH/NetBird | Host name, last check, authenticated/unreachable/key-warning | Gateway or bot reply is healthy merely because SSH connected |
| Grok gateway | Loopback target metadata, pinned agent, last health, last verified turn | HTTP acceptance is a completed response |
| App persistence | History availability and indexing status | Vector readiness equals relational durability |
| Remote MCP | Actual HTTPS endpoint, auth setup/status, implemented tool list, last remote test | A localhost URL is usable from Claude.ai |
| Claude.ai connection | Verified/untested state and setup steps for actual auth configuration | It is connected simply because a URL was copied |

Use copy controls for public endpoint/configuration snippets only. Show credential **presence/status**, not secret values. Redact error payloads server-side, including authorization headers and URLs with credentials/query tokens. A copy action gets inline confirmation without stealing focus.

Remote MCP and the webapp must share the same guarded application operations and canonical history; otherwise sending through Claude.ai can disappear from the operator history or bypass one-shot/reconciliation protections. Proposed operation groups are agent discovery, send/operation-status verification, history lookup/search and connection diagnostics. Exact HTTP routes, MCP tool names and input/output types are the server contract—not invented UI constants.

## 7. Accessibility and responsive acceptance criteria

- Semantic navigation/main regions, a logical heading structure, persistent labels for inputs, visible keyboard focus, and useful accessible names for every icon-only control.
- Keyboard-operable agent/history selection. Composer uses Enter for newline and a clearly documented Cmd/Ctrl+Enter shortcut only if desired; never submit while an IME composition is active.
- Status is communicated with words plus optional icon/color. Use a polite status announcement for meaningful delivery changes, not repeated announcements of the entire transcript during polling.
- Prefer inline errors/controls. If a modal navigation or confirmation dialog is used, implement focus containment, Escape, initial focus and focus return; a visual overlay alone is insufficient. [WAI-ARIA APG: modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- Proposed touch controls should aim for roughly 44px usable targets. WCAG 2.2's AA minimum criterion is **24×24 CSS pixels or its specified spacing/exceptions**, not a blanket 44px rule. Verify actual hit areas, not only icon dimensions. [W3C: target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- No horizontal page overflow at narrow phone width or enlarged text. Long IDs, URLs, code and Thai/English messages wrap or use contained scroll areas without pushing layout width.
- Reduced-motion preference disables nonessential transitions; ordinary state transitions should be brief. The operator sees content immediately, not after a staged entrance animation.
- Test keyboard-only flow, loading/empty/offline/uncertain/error states, rapid double-submit, switching conversations with a draft, reload while awaiting a reply, stale search response, and remotely initiated MCP turns appearing in history.

## 8. Implementation handoff and verification order

1. Finalize the typed backend contract and deployment/auth facts; preserve all named requirements, including remote Claude.ai MCP, actual vector search and ORM persistence.
2. Scaffold the React/Vite/Tailwind client without overwriting existing docs/scripts. Confirm the chosen Node context and retain a lockfile.
3. Build the app shell and real stateful chat first; add history/search and connection diagnostics using the same domain types.
4. Keep gateway, SSH, ORM, vector/embedding and authorization modules server-only. Browser bundles must not contain Node filesystem/process/native database imports or operational secrets.
5. Run unit/component tests against realistic labeled fixtures, then an end-to-end flow using a controlled test agent/prompt and correlated verification. A fixture is not live success.
6. Verify a production build and the actual authentication boundary, not just Vite dev mode. A public MCP endpoint requires its own authenticated remote client test.
7. Inspect desktop and mobile together in one bounded screenshot round, fix material findings in one batch, and confirm once. Include the user's actual viewport when known.

### Impeccable workflow state

`/Users/nat/.codex/skills/impeccable/scripts/impeccable context` ran **once** in this session/project. It reported no PRODUCT.md, DESIGN.md, surface brief or visual implementation; no automatic design detector hook is active. The loaded references were `init.md`, `new-work.md`, `operate.md` and planning-only `shape.md`. The skill was not updated, and no workflow preference was written.

This subtask stops at research/proposal. **PRODUCT.md is deferred to confirmed product context; DESIGN.md is deferred to the actual built/approved world**, consistent with the loaded playbooks. No design approval is fabricated. The root workflow owns any needed user confirmation and new-work direction selection. Immediately before actual UI edits, the implementing agent must load `craft-floor.md` (not needed for this planning-only pass). After UI completion, run the manual mechanical detector once on changed targets, then the appropriate fresh review/documentation handoffs; do not rerun context or run the detector during concept research.
