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
and native app visibility remain unverified. The web console does not yet have
a creation button. Unit tests are fixture-based and do not prove live creation.
