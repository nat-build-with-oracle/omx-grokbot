# Grok Bot: interface and architecture discovery

**Capture:** 2026-09-08 01:39:22–01:43:16 UTC (08:39–08:43 Asia/Bangkok).  
**Target:** `box@grokbot1`, reported remote hostname `cursor`.  
**Evidence:** [grokbot-interface.txt](evidence/grokbot-interface.txt).  
**Scope:** read-only documentation, code structure and interface metadata. **No message was sent by this discovery task.** No conversation histories, credentials, browser profiles or application databases were opened; no RPC was invoked and no tmux keystrokes were injected.

## 1. Identity: the host is not necessarily a named conversational agent

The shipped `/home/box/reference/app-ui.md` and `debugging-the-box.md` explicitly describe the **Grok Bot app** and its computer/runtime. Together with the running Sand host and execution services, they establish the product context much more strongly than the DNS name alone.

However, these remain separate identifiers:

- **SSH/network label:** `grokbot1`.
- **Linux hostname:** `cursor`.
- **Product:** Grok Bot, with Sand host/runtime components.
- **Conversational agents:** app-managed entities with their own IDs, names, descriptions, sessions and transcripts. No existing agent was identified or its history read here.

Consequently, “connected to grokbot1” is not equivalent to “spoke with an agent named grokbot1.” A real conversation requires the supported app interface and confirmation of a new message/reply.

## 2. Supported user-facing interface

The shipped documentation describes a native application with:

- A sidebar containing agents and an agent chat header.
- An agent information pane reached from the chat header; it includes a computer preview, Routines and conditionally Channels/Members.
- Per-agent settings for name, title, description, avatar and notifications.
- Global settings: General, Computer, Usage & Billing when enabled, and Updates.
- `grokbot://app/v1/settings` deep links with documented setting anchors.
- Account sign-in/out controls described as **“Sign In with Cursor” / “Sign Out.”** This is product documentation, not a finding about the current account's authentication state.

**Preferred conversation path:** use the running native Grok Bot app's supported chat composer to send a short new message, rather than deriving an API call or injecting text into a shell. Native app accessibility/GUI verification and the conversation attempt belong to the root task; they were not performed in this read-only subtask.

### Runtime and recovery documentation

The debugging reference describes two substrates: local Docker for development and brokered anyrun pods for the shipped default, behind common Shell/Screenshot/computer-use surfaces. The current box's Docker marker and observed topology were already captured in the [system report](../system_full_exploration_report.md); the reference text does not independently prove cloud ownership or isolation.

The app documentation distinguishes:

- **App update:** updates the native application.
- **Update Grok Bot's Computer:** moves to a fresh instance; the documentation says files/logins are kept while installed packages/CLIs/images must be reinstalled.
- **Reset Grok Bot's Computer:** restores the last saved snapshot and can lose recent unsynchronized work.

These are **documented product contracts, not tested persistence or backup guarantees**. No update/reset/recovery action was requested or executed. The references describe `box-doctor`, browser launchers and diagnostic commands; they were treated as source material and not run automatically.

## 3. Internal host transport: source-verified, not invoked

The deployed `/home/box/sand-host/host-main.cjs` bundle contains an internal gateway contract:

| Surface | Static implementation evidence |
|---|---|
| `/health` | Health path; earlier bounded service audit observed HTTP 200 on local port 1340 |
| `POST /api/<method>` | Gateway command dispatch; rejects unknown methods before execution |
| `/events` | Server-sent event subscription; optional comma-separated channel filter |
| `sendPrompt` | RPC method with required `prompt` and `agentId`; optional nonce, session, attachments and provenance/timing fields |
| Agent management | Schemas include `listAgents`, `countAgents`, `searchAgents`, `openAgent`, `createAgent`, and other lifecycle methods |
| Prompt acceptance | `promptAcceptanceStatus` schema exists |
| Transcript methods | Several transcript/tail methods exist; **none was called** |

The gateway source contains Bearer authentication with timing-safe comparison when a gateway auth token is configured. A retained helper implements rejection of browser Origin headers and a loopback Host-header check in tokenless mode; the helper's invocation in every applicable handler path was not captured. A Host-header check is not proof of a loopback peer or network bind. **Current auth configuration, complete call-path enforcement and end-to-end behavior were not inspected or tested**.

This is an internal implementation contract, not evidence of a stable public API or permission to bypass the native app. A valid prompt requires the correct target agent and supported authentication/session context. No token was obtained, no arbitrary RPC call was made, and no broad event/transcript stream was opened. The native app should manage those details for the requested conversation.

Static host code also contains backend `GrokBotService` clients, authenticated server-agent proxy/room capability logic, browser/computer helpers, workflow/automation schemas and a modular host-extension system. Code existence does not prove each feature is enabled for this account or active at runtime.

Bundle fingerprints at discovery:

- `host-main.cjs`: 28,264,654 bytes; SHA-256 `1aeb24cba1297390bbb63191a5d80d927d56eed8a6b8ee53c0b07bd1440602de`.
- `/exec-daemon/index.js`: 14,390,895 bytes; SHA-256 `d4f3e46a97b617f8a6ec8f1f5f73d9d6a174c56463bf523f76b6bb8b390ebdc4`.

These identify inspected bundles, not semantic release versions.

## 4. CLI, tmux and Oracle-skill findings

Commands `grokbot`, `grok`, `grokbot1`, `sand`, `maw`, `oracle`, `claude`, `codex`, `cursor` and `agent` were **not on the remote checked PATH**. This is not proof of global absence. `/exec-daemon/tools/origin` exists as a 104,520,460-byte binary; it was not executed, and no supported Grok Bot chat CLI was established from it.

`tmux` metadata showed one attached session (`0`), one window and one active pane (`0:0.0`) running **bash**. This is a shell, not evidence of an interactive Grok Bot agent. No pane contents were captured and no input was injected.

`/home/box/.grok` contains a `skills` directory. Its 29 entries comprise 27 skill directories plus metadata files. The installed VERSION document states:

- Installer: `arra-oracle-skills-cli v26.8.23-alpha.2112`.
- Installed at: `2026-09-08T00:52:35.580Z`.
- Installer target label: **“Grok CLI.”**

That target label is not proof that a Grok CLI executable is available. The installed `/talk-to` skill describes Oracle contact/thread/maw/inbox transports; it is not itself a live transport and does not establish a Grok Bot recipient. `maw` was not found on PATH. `/workspace/ψ` contained only `memory`; the checked `contacts` and `inbox` paths were absent. No unrelated contact list, memory or conversation content was read.

**Do not fake delivery:** invoking a nonexistent CLI, writing to an unregistered inbox, or typing into the bash pane would not establish a conversation with Grok Bot.

## 5. Handoff for the conversation attempt

Discovery is complete. The root task should record the actual supported-app attempt separately: target/new-chat identity, exact outgoing message, UI-observed submission, any response or visible failure, and timestamps. Until that evidence exists, this document claims **interface discovery only**, not successful contact.
