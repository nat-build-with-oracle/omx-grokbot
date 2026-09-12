# Native macOS bridge client

The independent [BotWorkspace fork](https://github.com/nazt/idea-9sep-wed2026-grok-clone/tree/incubate/omx-grokbot-bridge) adds a native SwiftUI bridge window to the existing local workspace. It is a client of this repository's owner HTTP API, not a replacement for this server and not a private Grok Bot API implementation.

## Connect

1. Run this bridge with Node.js 22.12+ and the normal private data directory:
   ```sh
   npm ci
   npm run build
   GROKBOT_SSH_HOST=box@grokbot1.commu.oracle npm start
   ```
2. Ensure the bridge host already trusts the SSH destination. The allowlist accepts `box@grokbot1`, `box@grokbot1.oracle.netbird`, and `box@grokbot1.commu.oracle`; strict host-key checking is unchanged. The native app does not run SSH.
3. Build the fork with `scripts/native-app.sh build`. Open **GrokBot Bridge** from its sidebar or File menu.
4. Enter the bridge origin (default `http://127.0.0.1:4328`) and explicitly supply the `apiToken` from your own private bridge configuration. Do not use `ownerSecret` or a gateway credential. Never commit, paste into a terminal command, or share the token.
5. For remote access use the configured HTTPS origin on the bridge's own API port, not a Home Assistant Ingress path.

The native client has a separate in-memory bearer session. Disconnect clears that client session; it does not revoke the server's static API token. Token rotation remains a bridge-owner operation.

## Scope

Remote roster, one-attempt message submission, read-only reply checks, paginated text transcripts, creation and creation reconciliation, keyword/semantic imported-history search, indexed source excerpts, and connection status are exposed natively. Local provider chats/routines retain their existing behavior and storage. History import and embedding remain explicit bridge CLI operations.

Pending IDs and drafts are written before sending in a private local journal, namespaced by canonical origin and credential fingerprint. Uncertain submissions are never automatically resent. Explicit recovery after token rotation checks saved IDs only. An operation that never reached the server can remain unresolved; deleting recovery records to bypass this is not a supported retry mechanism.

No native terminal/desktop control, attachments, remote bot deletion, public Claude.ai connection, or cloud-worker availability is implied. Synthetic screenshots and offline tests are not live delivery evidence.
