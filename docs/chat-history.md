# Existing Grok Bot conversations

Selecting a bot now loads its existing user-facing text from that bot's remote transcript, rather than showing only messages sent through this bridge.

## What each history surface means

- **Conversations → Grok Bot history:** read-only text from the selected bot's remote SQLite transcript, reached over SSH/NetBird. No gateway POST is involved.
- **Messages sent through this bridge:** the local durable operation ledger, with explicit submission and reply-verification receipts. A matching remote copy is hidden only using the operation's exact correlation nonce, prompt, watermark, or verified request ID—not similar text.
- **History tab:** selected imported project memory and its source-linked search index. Reading a bot transcript does not import, embed, or persist it in this index.

## Browsing and limits

The first read examines at most 50 recent transcript rows. **Load earlier messages** uses a decreasing row cursor; **Refresh history** returns to the recent page. Entries are displayed oldest-to-newest within the loaded pages. The displayed count is loaded text messages, not a claim about the bot's entire history.

Only direct user/assistant text and text `send-message` records are displayed. Tool, system, attachment, and agent-to-agent records are excluded. Attachment files are not fetched. Messages longer than 8,000 characters are visibly marked as shortened; use the native app for their full contents. A 131,072-character page budget can shorten a page without losing its continuation cursor. Streaming flags are shown when present in the source.

Text is rendered as plain text, not executed as instructions or injected HTML. Markdown syntax is preserved rather than interpreted. Transcript contents remain in authenticated request/browser memory, not browser storage, committed evidence, or the bridge message ledger.

Switching bots aborts the old browser read, and stale responses cannot replace the selected bot's history. A failed refresh preserves loaded text and offers a read-only retry. History loading never resends a prompt, creates a bot, or upgrades a bridge submission to a verified reply.

## Owner API

```text
GET /api/agents/<agent-uuid>/transcript
GET /api/agents/<agent-uuid>/transcript?before=<positive-rowid>
```

These endpoints require the same owner authorization as the other private APIs. Agent IDs, page bounds, response agent identity, ordering, and cursor progress are checked. The SSH helper opens only the selected agent's database with SQLite `mode=ro` and `PRAGMA query_only=ON`.

Configure an explicit SSH identity using `GROKBOT_SSH_IDENTITY_FILE` if default keys are not authorized. The gateway itself uses remote-loopback HTTP; this transcript read uses SQLite through SSH, not WebSocket or a public gateway endpoint.

## Reproducible proof

With a locally running bridge, an installed Playwright module, and Chrome:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
BRIDGE_TEST_AGENT=test node scripts/chat-history-smoke.mjs
```

The live phase signs in using private local configuration, selects that exact bot, compares rendered text to the authenticated transcript response, loads one earlier page when available, and signs out. It sends no bot message and creates no bot. Separate isolated fixtures test stale bot responses and preservation after read failure. No message contents or credentials enter the committed JSON proof.

Evidence: `docs/evidence/bridge/chat-history-smoke.json`. Screenshots stay in the ignored `.impeccable/review/` directory because they can contain private conversations. This proof establishes history reads, not live bot creation, native-window selection, public deployment, or a new correlated reply.

## Automatic bridge reply checks

While the selected conversation is visible, unresolved bridge messages are verified
against the remote transcript every four seconds after each check completes. No
prompt is resent. Fresh recorded replies continue refreshing until ten minutes
after message creation, so a later final report can follow an initial acknowledgement.
Use **Refresh reply** for older operations. This is read-only polling, not WebSocket
or token streaming. Native chat history still loads on selection or manual refresh.
Bridge operations display oldest first and follow the bottom unless you scroll up.
