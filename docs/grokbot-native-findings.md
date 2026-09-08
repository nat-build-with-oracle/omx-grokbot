# Native Grok Bot application: installed-bundle findings

**Date:** 2026-09-08; exact UTC capture markers are in [native evidence](evidence/grokbot-native.txt).  
**Scope:** static metadata and selected shipped source under `/Applications/Grok Bot.app/Contents` only. No app launch/restart, GUI interaction, API request, deep-link activation, debugging enablement, or message send was performed by this inspection. No account/session files, Application Support state, existing conversations, or runtime credentials were opened.

## Identity and packaging

| Item | Installed-bundle evidence |
|---|---|
| Display bundle / executable | `Grok Bot.app` / `Grok Bot` |
| Bundle identifier | `com.anysphere.sand` |
| Version / build | **0.44.0 / 0.44.0** |
| Minimum macOS declared | **12.0** |
| Package name / entrypoint | `sand` / `dist/electron-main/main.cjs` |
| Declared URL schemes | **`grokbot`**, **`sand`** |
| Main archive | `app.asar`, **34,485,800 bytes**, **478 indexed files** |
| Archive SHA-256 | `dbf2bbf4c8f870ccbae459eba9f84a84ba1c00aaa97ffbecbd806b3f0452ae1e` |

The package includes Electron main/preload code, a React renderer, a local-execution daemon artifact, a node-agent coordinator artifact, and dependencies named `@anysphere/grok-bot`, agent libraries, `@sand/client`, and `@sand/shared`. These are installed-package facts, not a running feature or entitlement inventory.

## Native desktop versus remote Sand host

The selected source supports this **implementation architecture**, not a validated trace of the user's current live session:

```text
Native Electron main process
  main-core -> main-app startup stages
  desktop lifecycle, trusted renderer bridge, platform integrations
       |
       +-- Electron MessageChannels -> node-agent coordinator
       |                                -> gateway/host-facing legs
       |
       +-- preload -> renderer window.desktop / window.coordinatorPort
       |              React UI, chat composer/new-chat handlers
       |
       +-- separately packaged local-exec-daemon helper

Remote Sand host / execution / desktop runtime
  documented independently in the remote exploration
```

- Evidence **N1** establishes the main-core/main-app startup order.
- **N8–N10** establish coordinator child creation, Electron MessageChannel bootstrap, a trusted renderer request check, and preload exposure of `desktop` and `coordinatorPort`.
- **N11** identifies coordinator gateway legs/settings synchronization in main-process wiring.
- **N12** identifies renderer composer-submit/new-chat handlers; it does **not** expose a stable external function that this inspection can call.

Thus the native desktop is not simply the remote Linux process named `sand-host`: it contains UI, platform-integration and communication components of its own. Source presence does not establish which helper is currently active, which account is signed in, which remote box is selected, or whether a bot can presently reply.

## Declared deep links: navigation, not a discovered chat-send API

The shipped surface declares authority **`app`** and schemes **`grokbot` / `sand`**. The retained bot-template metadata uses a 2048 length constant; the global declaration references a separate unresolved constant, so a global URL limit is not established here. The app handles macOS `open-url`, initial arguments, and second-instance arguments through a validated deep-link parser (**N2–N4**).

The complete route declaration inspected contains:

| Path | Declared purpose/parameters |
|---|---|
| `/v1/open` | Activation; no parameters |
| `/v1/agent` | Agent navigation; `id` |
| `/v1/bot-template` | Template navigation; `id` |
| `/v1/marketplace` | Marketplace; `tab`, optional `id` |
| `/v1/plugin/add` | Plugin-add flow; `id` |
| `/v1/github-connect-callback` | Integration callback; state and optional callback parameters |
| `/v1/settings` | Settings navigation; `id` |
| `/v1/sidebar` | Sidebar route; `target`, `automation` |

For example, the source-derived activation URL is `grokbot://app/v1/open`. **It was not invoked.** Route names and declarations do not make configuration/integration routes read-only, and callback flows must not be exercised with invented state. No route in this declaration accepts a chat prompt or sends a user message; `/v1/agent` is navigation, not evidence of a send API. This is a finding about the inspected declaration, not proof that all possible undocumented interfaces are absent.

## Automation/API boundary

1. **No packaged CLI declaration found.** `package.json` has no `bin` field. The inspected Info.plist declares neither `NSAppleScriptEnabled` nor an `OSAScriptingDefinition`; no `.sdef` file was indexed in the archive. This does not prove that every possible undocumented CLI or generic OS accessibility interaction is unavailable.
2. **Private renderer IPC is not an external automation contract.** The preload exposes internal bridges; source shows trusted-renderer checks. No JavaScript injection, private IPC invocation, or trust bypass was attempted.
3. **Developer automation must not be confused with production support.** A `sand-dev` IPC surface has development operations, but its trust gate requires both **an unpackaged app** and **`SAND_DEV_CAPABILITY=1`**. The separate localhost developer HTTP control server is gated by **unpackaged app status**. The development preload is similarly gated (**N5–N7**). None was enabled or invoked.
4. **A local HTTP listener is not automatically a chat endpoint.** Selected source listener sites include MCP OAuth loopback handling and a temporary local updater feed (**N13–N14**), plus generic bundled WebSocket-server library code and developer control code. No stable, documented packaged-app localhost chat endpoint was established.

## Implication for the requested bot conversation

This inspection identifies the native application and its navigation/communication structure but does **not** claim that a message was sent or answered. A normal visible-UI interaction, conducted by the main workflow using an appropriate new conversation, avoids inventing a chat API or enabling developer-only controls. Any actual prompt, response, failure, or GUI-permission limitation must be recorded separately from these static findings.

No existing conversation contents were read to locate a target, and no credentials or account IDs are required by this document. The app's present UI state, selected bot identity, authorization, message persistence, billing implications, and remote transport behavior remain outside this subtask's evidence.

## Focused follow-up: New Chat and draft preservation

The main workflow reported an existing native accessibility prompt value with **16 characters**. This static follow-up did **not** read those characters or any live user state. Their length alone cannot establish whether they are user text or built-in UI text, so this document does not authorize overwriting them.

The shipped renderer directly supports these narrower conclusions ([evidence D1–D13](evidence/grokbot-native.txt); all offsets below refer to `dist/renderer/assets/index-C6zjACOA.js`):

| Source evidence | What it establishes |
|---|---|
| D1/D12/D13; handler at **2935486–2935677** | `openNewChat` checks whether New Chat is already open. Otherwise it closes the workspace, resets reply targeting, clears recipient selection, and opens the launcher. The handler does not clear the prompt; when already open it does nothing. |
| D2–D6; key selection near **3063703** | Composer draft key is **`"sand:new-chat"` when New Chat is open**, otherwise the **current agent ID**. That selected key is passed to the composer draft hook. This is per-agent versus shared-new-chat-slot evidence, not proof of separate drafts for every session within an agent. |
| D7/D8; slot hook near **2230520–2231370** | On a key change, the lifecycle callback saves the old slot's live draft, then loads the target slot's existing draft or recovery; absent one, it uses an empty prompt. |
| D9; **2228841–2229058** | Saved draft payload includes prompt, rich text, attachments, and existing reply-target/session metadata. |
| D11; **3080680–3080910** | The lifecycle callback is attached to a rendered element keyed by the composer key, connecting slot changes to that save/restore path. |
| D10 | The editor receives `initialPrompt` and `getPlaceholder` as separate props. This does not establish what a particular live AX value represents. |

**Practical implication:** normal **New Chat navigation has an explicit in-session save/restore mechanism for the prior agent draft**, but it does **not guarantee a fresh empty composer**. The shared `sand:new-chat` slot may already contain a draft. Clicking New Chat again while that slot is open is a no-op, not “discard draft and start over.” The code inspected does not prove survival across an app crash/restart or guarantee that every live transition succeeds.

A bounded UI-only approach is therefore: use the normal New Chat action without editing or submitting the existing composer, then verify that the newly displayed composer is actually empty before typing the test message. If it remains nonempty, **do not select-all, clear, submit, or assume placeholder text**. No alternate UI action that guarantees a blank additional slot while preserving an already occupied shared new-chat draft was established in this focused pass; stop and obtain an explicit user choice rather than repurposing that draft. No such navigation or test was performed by this static inspection.
