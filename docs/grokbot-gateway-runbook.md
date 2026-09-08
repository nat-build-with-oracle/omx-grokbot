# Grok Bot gateway runbook — NetBird SSH transport

## Purpose and authorization boundary

This runbook covers the explicitly authorized workflow: use the gateway credential locally on the remote machine, identify the intended bot from profile metadata, send **one** correlated test prompt through `POST /api/sendPrompt`, and verify the resulting new transcript records using read-only SQLite queries.

This is an internal, deployed gateway interface—not a claim of a stable public API. Sending a prompt changes conversation state and may consume model usage. Discovery and transcript inspection must not expand into credential disclosure, unrelated chat history, bot creation/deletion, settings changes, or service restarts.

## 1. Use our NetBird name and preserve SSH trust

Use **`box@grokbot1`**. Its fully qualified NetBird name is **`grokbot1.oracle.netbird`**. Do not substitute a different overlay's DNS suffix or a remembered address from another network.

On this macOS workstation, these commands inspect name resolution and test authenticated SSH without sending a chat message:

```sh
dscacheutil -q host -a name grokbot1
ssh -G box@grokbot1 | grep -E '^(hostname|user|port|proxycommand|proxyjump) '
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=12 \
  box@grokbot1 'date -u +%FT%TZ; hostname; id'
```

The earlier baseline resolved the target to **100.97.63.219** and the remote reported hostname **`cursor`**. Recheck current results rather than treating an old address as permanent. The Linux hostname need not equal its NetBird DNS label.

If an existing-host-key mismatch or unknown-key refusal occurs, stop and verify the correct fingerprint with the owner through a trusted channel. **Do not remove known-host entries, disable checking, or blindly accept a replacement key.** The historical fingerprint in the system report establishes previously observed continuity, not independent identity assurance.

## 2. Connect to the gateway from inside the box

The transport should be:

```text
workstation -> SSH box@grokbot1 over NetBird
                  -> remote Python helper
                       -> HTTP gateway on remote loopback
                       -> profile / read-only transcript database
```

**`0.0.0.0` is a server bind address**, meaning all IPv4 interfaces; it is not the client destination to put in a gateway request. For a helper running inside the same box, connect to **`127.0.0.1` at the configured gateway port**. Do not infer the gateway port from the SSH port or expose the HTTP gateway directly to the workstation simply to test it. The actual configured port must be discovered, not guessed from an earlier listener snapshot.

## 3. Keep credentials on the remote host

- Read the authorized `gateway.json` location inside the remote helper. Use its credential in that process's HTTP Authorization header.
- Never print or copy the token into this document, terminal history, shell arguments, command substitution, environment dumps, screenshots, retained HTTP headers, or evidence files.
- Keep connection metadata, target IDs, test marker, watermarks, and summarized results separate from the credential. Prepared/test-state files must be token-free.
- Do not use `curl -v`, shell tracing, or a command with a literal Bearer token. Do not copy the gateway secret to the workstation.
- Catch errors without dumping request objects or header dictionaries. A failure is not permission to try alternate accounts, bypass authentication, or broaden the endpoint scope.

## 4. Discover the target before preparing a message

Identify agents from profile metadata and obtain `activeAgentId` from gateway health. A DNS label, Linux hostname, native app bundle name, and conversational agent ID are **different identifiers**. Do not assume that an agent named `grokbot1` exists merely because SSH uses that name.

The requested “omx proxy bot” was identified by its actual profile name **`OMX Proxy`**. Require one exact profile-name match and pin its ID; do not silently substitute an earlier test target or whichever bot happens to be active. Health's active ID is context, not permission to override the named target. Report only the minimum fields needed to distinguish it. Stop if the name is absent or ambiguous. Do not create, rename, delete, or switch an agent to make the test easier.

## 5. Prepare once: schema, watermark, and unique marker

Before the POST:

1. Inspect the live SQLite schema read-only; determine the actual table names, role/message encoding, ordering key, agent/session association, and any transcript references. Do not assume an example schema from a different build.
2. Record a pre-send watermark using the actual monotonic/order fields available, scoped to the chosen target where supported. Retain enough information to exclude earlier rows without displaying their contents.
3. Generate a unique correlation marker for this one attempt. Record the exact outgoing prompt and marker in token-free evidence.
4. Request a minimal reply containing that marker, with no tools or file changes. That request limits intended bot work; it is not proof that the runtime has no side effects.

Keep the prepared target, marker, outgoing prompt, and watermark together. Do not reuse the marker for a second attempt or generate a replacement after an uncertain submission.

## 6. Send exactly once, then verify rather than resend

Submit the prepared prompt to `POST /api/sendPrompt` with the discovered target agent ID and the required authentication. Only include additional request fields that the deployed schema/helper actually supports.

**`accepted: true` is not proof that the bot replied.** It is only an acceptance-stage result. A timeout, dropped SSH connection, malformed response, or helper interruption after submission can mean that delivery occurred even though acknowledgement was not captured.

After any uncertain send, **do not retry the POST until transcript verification has established what happened**. Repeating a POST can create a duplicate conversation turn. Preserve the original preparation/marker so another read-only verification can resume it.

## 7. Verify only new, correlated transcript data

Use a read-only SQLite connection and read-only queries against the discovered schema. Do not run migrations, repair commands, journal-mode changes, WAL checkpoints, pruning, or updates. Treat an unavailable database, decoding error, lock, or missing expected column as an explicit verification failure—not as evidence that the message was never delivered.

Verification must distinguish:

| Evidence | Supported conclusion |
|---|---|
| SSH command returned | Transport/authentication worked, not bot delivery |
| HTTP request accepted | Gateway accepted the request, not a completed reply |
| New target user/input record after watermark with this marker | The correlated prompt entered the transcript |
| New target assistant/output record after watermark containing the expected marker | A correlated bot response was recorded, subject to the schema's verified role/session mapping |
| No matching new assistant record within the observation window | Reply not yet verified; not proof of rejection or non-delivery |

The user's own marker-bearing row is not a bot reply. An old matching row is not a response to this attempt. If assistant text lives in a referenced transcript file, restrict reading to the newly identified record/segment rather than dumping the full conversation. Retain only the exact test exchange or minimal status fields needed for proof.

Polling should be bounded and should reuse the same preparation and marker. Repeated read-only verification is different from resubmission. Report the observation window and pending/error status honestly if a reply is not obtained.

## 8. Delivered helper: commands and retained state

The standard-library Python [helper](../scripts/grokbot-gateway.py) is streamed to **remote Python stdin** through SSH. It is not copied into the remote filesystem. Run these steps from the workspace root, **one section at a time**; stop on any error. Do not rerun the setup/prepare section to recover from an uncertain send—retain and reuse the original preparation.

### A. Set up the NetBird-only wrapper and inspect the named target

```sh
host='box@grokbot1'
helper='scripts/grokbot-gateway.py'
agent_name='OMX Proxy'

grokbot_remote() {
  local remote_cmd
  remote_cmd=$(python3 -c \
    'import shlex,sys; print(shlex.join(["python3", "-", *sys.argv[1:]]))' \
    "$@") || return
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=12 \
    "$host" "$remote_cmd" < "$helper"
}

grokbot_remote discover
```

`discover` returns selected health fields and profile names/IDs, not credentials or conversation history. The wrapper shell-quotes every remote argument, including the target name's spaces. `box@grokbot1.oracle.netbird` is the explicit NetBird-FQDN alternative if needed; the credential remains on that same remote machine.

### B. Prepare a unique, token-free test record

```sh
marker=$(python3 -c \
  'from datetime import datetime,timezone; from uuid import uuid4; print("NETBIRD_OMX_"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")+"_"+uuid4().hex[:12])')
run_dir="docs/evidence/gateway-$marker"
mkdir -p "$run_dir"

grokbot_remote prepare --agent-name "$agent_name" --marker "$marker" \
  > "$run_dir/prepare.json"
python3 -m json.tool "$run_dir/prepare.json"
```

Proceed only if `prepare` succeeded, the name is exactly `OMX Proxy`, `existingMarkerRows` is **0**, and the health/schema fields are as expected. It returns `agentId`, `name`, `marker`, `afterRowid`, marker-collision count, health, and schema summary. An occupied marker requires stopping before any send—not reusing an old attempt.

The current helper uses:

- Gateway metadata: **`~/sand-data/gateway.json`**, read remotely; HTTP `127.0.0.1:<configured port>`, no environment proxies or redirects, and no unauthenticated fallback.
- Profile metadata: **`~/sand-data/agents/<agentId>/profile.json`**.
- Transcript database: **`~/sand-data/agents/<agentId>/store.db`**, opened with SQLite URI **`mode=ro`** and **`PRAGMA query_only=ON`**.
- Expected table fields: **`transcript_entries`** with **`seq`, `id`, `entry`**. The helper checks those column names; its schema label is not a full type/index/schema compatibility validator.
- Watermark: the existing **maximum SQLite `rowid`**, not an assumption that JSON IDs or timestamps are monotonic. No pre-watermark transcript content is displayed.

### C. Extract the pinned target and submit once

```sh
agent_id=$(python3 -c \
  'import json,sys; from uuid import UUID; p=json.load(open(sys.argv[1])); assert p["name"]==sys.argv[2] and p["marker"]==sys.argv[3] and p["existingMarkerRows"]==0; print(UUID(p["agentId"]))' \
  "$run_dir/prepare.json" "$agent_name" "$marker")
after_rowid=$(python3 -c \
  'import json,sys; p=json.load(open(sys.argv[1])); n=p["afterRowid"]; assert isinstance(n,int) and n>=0; print(n)' \
  "$run_dir/prepare.json")
prompt="Connectivity test over NetBird. Do not use tools, read files, change files, or start other work. Reply with exactly this marker and nothing else: $marker"

# Run the following send command ONCE for this preparation.
grokbot_remote send --agent-id "$agent_id" --expected-name "$agent_name" \
  --marker "$marker" --after-rowid "$after_rowid" --prompt "$prompt" \
  > "$run_dir/send.jsonl"
cat "$run_dir/send.jsonl"
```

Stop if either variable-extraction command fails; do not use values left over from another attempt. `send` rechecks the pinned profile name, refuses an already-recorded marker, and makes **one POST without retries**, supplying `agentId`, `prompt`, and **`clientNonce=marker`**. This collision check is not a demonstrated atomic exactly-once guarantee; do not use it as a reason to repeat an uncertain send.

The normal send evidence contains a `before_post` event and a `post_result` event. A send exception yields **`delivery_uncertain_do_not_resend`**. Loss of SSH after `before_post` is also uncertain even if no result event arrives. Preserve the partial JSONL file and proceed to verification, not another POST.

### D. Verify and, if necessary, poll the same attempt

```sh
grokbot_remote verify --agent-id "$agent_id" --marker "$marker" \
  --after-rowid "$after_rowid" > "$run_dir/verify-1.json"
python3 -m json.tool "$run_dir/verify-1.json"
```

If pending, wait a bounded interval (for example, 10 seconds) and repeat **only `verify`**, saving `verify-2.json`, `verify-3.json`, and so on. Keep the same ID, marker, and watermark. Do not overwrite the original send evidence or create another prompt automatically. A finite observation budget, such as six checks over about a minute, should end with an honest pending result rather than a resend.

For a resumed shell, recover `agentId`, `marker`, and `afterRowid` from the original `prepare.json`; do not run `prepare` again. The wrapper can be redefined without sending anything.

The verifier accepts a window of at most **1000 new rows** from the selected agent database; it fetches up to **1001** to detect and refuse an oversized window before decoding or displaying its contents. It first finds one marker-bearing user record with **`kind="message"`, `role="user"`**, then requires a later output with the **same `requestId`**. It recognizes **`kind="send-message"` with `message.type="text"`** and the alternate **`kind="message"`, `role="assistant"`** representation. Only the correlated prompt/replies are emitted, not the intervening unrelated rows. If the recorded reply is truncated or still streaming, report that limit and verify again before claiming a complete exact response.

Possible verification statuses are `prompt_not_recorded`, `ambiguous_multiple_prompts`, `prompt_recorded_waiting_for_reply`, and `reply_recorded`; a stopped/error result is separate. **Inspect the actual reply content for the expected marker even when the status is `reply_recorded`**: same-request correlation alone does not guarantee compliance with the requested echo.

## 9. Verified test result — 2026-09-08

**The test succeeded through `box@grokbot1` over NetBird**, using remote-loopback HTTP and a credential held only in the remote Python process. The gateway's acceptance and a new, correlated bot transcript response were both observed:

| Field | Retained evidence |
|---|---|
| Target profile | **OMX Proxy** |
| Target agent ID | `cfecd8d4-bbe9-43e0-ba9c-606b3bd460d3` |
| Preparation | **02:08:41 UTC**; prior maximum `rowid` **8**; existing-marker count **0** |
| Test marker | `DOC_NETBIRD_OMX_PROXY_20260908_0208` |
| One-shot send | **02:09:05 UTC**; HTTP **200**, `accepted: true` |
| Verification | **02:09:21 UTC**; status **`reply_recorded`** |
| New records | User prompt **row 9**; bot `send-message` text **row 11** |
| Shared request ID | `137c3f05-943c-47f6-8bcf-c5b275217188` |

The bot's recorded reply was:

> Hi Codex — I'm OMX Proxy, Nat's Grok Bot for oh-my-codex (setup, proxy routing, team workers, Codex config). Marker: DOC_NETBIRD_OMX_PROXY_20260908_0208

Its self-description is quoted as a reply, not independently verified capability/configuration inventory. The response was not truncated; no separate end-to-end lifecycle or tool-activity certification is implied. The exchange occurred around **09:09 Asia/Bangkok**.

Evidence: [preparation](evidence/grokbot-omx-proxy-prepare.json), [one-shot send](evidence/grokbot-omx-proxy-send.jsonl), [correlated prompt and reply](evidence/grokbot-omx-proxy-verify.json).

No SSH host-key deletion, disabled host checking, alternate-overlay DNS, or native-UI draft mutation was used. Earlier exploratory preparation against another target did **not** send a message to that target. Future tests must discover the current exact profile, generate a **fresh marker**, and capture a **fresh watermark** rather than copying this historical ID/marker/row number into a new send.
