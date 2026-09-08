# New bot / conversation through the bridge

## Implemented (live creation not yet verified)

- MCP `grokbot_create_agent({operationId, name, description?})`, requires owner write scope.
- Owner HTTP `POST /api/agents`, same JSON input, existing authentication and CSRF checks.
- MCP `grokbot_verify_creation({operationId})` or owner HTTP
  `POST /api/agent-creations/:operationId/verify` performs read-only verification.

Choose a UUID once and retain it. The bridge commits that operation to SQLite
before SSH/network work. Reusing it returns the original operation; changed
content conflicts. Neither timeout nor restart permits an automatic second POST.

The gateway call is `POST /api/createAgent`, with a box creation route, user origin,
suppressed introduction and kickstart disabled. It does not send an initial
prompt. The gateway response's `agent.id` is then read back from its remote
profile with an exact name match. Statuses distinguish `creation_uncertain`,
`created_unverified`, and `verified`. Verified is not proof of a selected native
window or of a recorded first message. Use the existing send/verify tools for
that separate action.

If the POST result is lost and no agent ID was captured, the operation remains
uncertain. Do not create a fresh operation ID to retry; reconcile against the
remote roster manually first. This conservative implementation does not yet
provide automatic nonce reconciliation.

## Contract evidence

- Previously captured host schema: `docs/evidence/grokbot-interface.txt`,
  createAgentArgs and gateway RPC method.
- Installed Grok Bot app.asar renderer `index-C6zjACOA.js`, inspected 2026-09-08:
  `Nwt` creates a drafted agent with name, empty description, clientNonce and
  isIntroductionSuppressed, then selects the returned `agent.id`.
- This implements a fresh one-to-one agent/conversation, not a reset/fork of an
  existing bot's history. No independent createThread endpoint was established.

## Remaining acceptance

Live NetBird gateway access, a real creation through the bridge, profile readback,
and native app visibility remain unverified. The web creation form is implemented;
fixture-based tests do not prove live creation.

## Web console (2026-09-08)

The owner console now exposes **New bot** at `/new`, with name/description,
profile preview, connection gating, a verified-profile result, and explicit
read-only status checks. `GET /api/agent-creations` lists the owner's saved
operations so interrupted creations can be restored on reload. Only a pending
operation UUID (not credentials or profile text) is retained in sessionStorage.
A timeout never enables an automatic second creation.

Sign-in and local history remain usable when the remote computer is offline.
The browser smoke uses real local authentication/read-only APIs for offline
states and isolated synthetic responses for creation/send UI behavior. Those
fixtures are **not** live bot-creation proof.

Browser check: build and start the app, then run `node scripts/ui-smoke.mjs` with
Playwright available. If it is installed outside this project, set
`PLAYWRIGHT_MODULE` to that installation's `index.mjs`. The script uses installed
Chrome in isolated headless contexts, captures desktop/mobile/short-window
screenshots under `.impeccable/review/`, and writes redacted JSON evidence to
`docs/evidence/bridge/ui-smoke.json`. It never sends to a real bot or creates one.
