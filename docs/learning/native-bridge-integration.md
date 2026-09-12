# Native bridge integration learning — 2026-09-13

## What the history establishes

The 23-commit bridge history through `0fe5552` is not one flat proof of completion:

1. `0b9bfb9` established the MCP/local-history bridge. Subsequent frontend/readiness work added the owner console and evidence, but did not establish a public deployment.
2. `20dc012` introduced durable agent creation; `d45a369` exposed verified UI flows.
3. `3e216e7` made SSH identity explicit. `3b6e222` added read-only remote transcripts.
4. `fff144c` introduced selected reply polling and append-only correlated updates; `5969ebe` retained a live context-transfer checkpoint.
5. MIT licensing and synthetic README screenshots followed. The latest packaging commits added Home Assistant/registry behavior and the explicit guest-build fallback.

Some old docs predate those changes. The accepted-only MCP artifact is not proof of `reply_recorded`; the separate context-transfer artifact is historical evidence, not a current roster. This integration corrected the README MCP overclaim and DOCS registry/build contradiction without rewriting historical artifacts.

## Boundaries learned from code

- `server/core.ts` + `store.ts`: stable operation IDs, reserve-before-send, one unresolved send per bot, pre-send failure vs post-intent uncertainty, verified request correlation and append-only replies.
- `server/creation.ts`: separate creation operation, no automatic first message, uncertain/created-unverified/verified lifecycle.
- `server/auth.ts` + `http.ts`: owner cookie/CSRF is distinct from the static native API bearer; a native token is not the browser owner secret.
- `server/remote.ts` + Python gateway: exact SSH target/argv, strict host-key checking, credentials stay on the remote machine.
- `client/conversation.ts` and `transcript.ts`: remote history must not be confused with local bridge receipts or deduplicated by similar-looking text.
- `history.ts`: explicit reviewed import/redaction/embedding; independent keyword and vector modes, indexed source provenance.

## Native upstream and decision

The independent macOS app was studied at upstream `4688d32` in an isolated worktree. Its SwiftUI/AppKit shell and WorkspaceCore/Core Data already provide local chats, profiles, groups, providers and routines. The bridge is a separate native window/API adapter, not a replacement provider: local Retry/stream semantics would permit a second request where the bridge requires check-only recovery.

The implementation uses memory-only API credentials, private versioned pending journals and identity epochs. UUIDs must be lowercase on the wire because the bridge compares its discovered IDs as strings. Client DTO validation must preserve the server's watermark/status/creation invariants, not merely decode JSON.

## Fresh evidence vs assumptions

Strict SSH to the newly approved host, native read-only discovery/transcript access, and one actual Swift-client send/verified reply passed. The current roster did not contain the historical keeper ID, so preflight stopped before any send to that ID. See [sanitized live evidence](../evidence/native-bridge/live.json) and [native setup](../native-client.md).

Public MCP-client acceptance, a new production deployment, live bot creation on this host, live semantic embedding, and remote desktop/terminal control are not claimed.
