# System exploration coverage audit

**Review date:** 2026-09-08; final review includes the authorized OMX Proxy exchange at 09:09 Bangkok and subsequent instruction/QA integration. Independent read-only review of the main report, system/service and Grok Bot appendices, evidence E1–E16, NetBird runbook, gateway helper/tests, artifact-QA record and local retrospective/lesson. No SSH, network, GUI or send actions were performed by this reviewer. Earlier core and UI-only checkpoints are preserved as history; they do not override the later verified gateway result.

## Current scope and completion boundary

**Semantic coverage passes for the requested deliverables:** system and Grok Bot documentation, runnable instructions using our NetBird DNS, one verified conversation with the user-named OMX Proxy, and ongoing local retrospective updates. The earlier unsent-UI limitation was resolved through a separately user-authorized gateway workflow without overwriting the draft. Ancillary external Oracle learning sync remains unavailable and is not claimed successful; it does not invalidate the fulfilled request to keep writing the local `/rrr` record.

| Workstream | Reviewed status | Boundary |
|---|---|---|
| Original workstation + remote system baseline | Previously completed: ten criteria below | No host/cloud, health/security or recovery certification |
| Grok Bot product/native/remote architecture documentation | Static documentation covered by E9/E10/E12 and appendices | No traced native UI-to-box session or feature-entitlement audit |
| Native chat-interface attempt | Historical unsuccessful submission route recorded in E11; draft preserved | AXPress acceptance was not delivery; no native composer text was changed |
| Conversation submission and reply | **VERIFIED** by E14–E16 on the authorized gateway route | Pinned OMX Proxy profile/store, one new prompt and same-request bot reply; not proof of native UI rendering |
| Runnable NetBird instructions | Delivered helper and step-by-step runbook match the exercised route | Internal deployed API, not a public/stable API or authorization for repeated sends |
| Ongoing local retrospective and lesson | Local artifacts record UI attempts, authorization change, exact gateway result and lessons | Continued local record, not an external sync receipt |
| Ancillary Oracle `arra_learn` sync | **UNAVAILABLE / NOT PERFORMED**, explicitly disclosed | No external receipt; not silently claimed successful and not converted into an unrequested indefinite blocker |

## Previously completed core-baseline review

**Core baseline coverage passed.** The documented local workstation and remote login environment are supported by timestamped observations across the requested system domains. Main numerical values, listener classifications, version tables, cgroup accounting and explicit operational limits agree with retained evidence. This is documentation QA, not a health, security, backup or isolation certification.

The core-baseline final-pass issues were found and resolved:

| Issue identified | Resolution verified |
|---|---|
| Initial boundary output omitted unreadable/absent child cgroup files without distinguishing the two | [E7](evidence/remote-availability-verification.txt) explicitly tests existence/readability: child `cpu.max` exists; checked child memory-control files do not. Ancestor values and unseen-ancestor caveat remain distinct. |
| Initial tool-location sections did not print unsuccessful tool names | E7 gives each named tool and its PATH-lookup exit, supporting backup/scheduler/firewall/container-CLI availability statements without claiming global absence. |
| Service appendix called unattributed high-numbered ports “privileged TCP ports” | Appendix now correctly says “Unattributed TCP ports”; owners and protocols remain unknown. |
| Local configuration provenance was initially only indirect | [E8](evidence/local-resolution-verification.txt) now identifies SSH files actually read, including `99-netbird.conf`, and the selected default/supplemental macOS DNS resolver blocks. |

No unresolved factual blocker was identified in that core-baseline review. E8 verifies local SSH file-read provenance and relevant local DNS configuration; unrelated resolver domains and full SSH configuration contents remain intentionally excluded. Configuration, observed name resolution and routes are not a packet-level trace. Local hardware model/user/workspace identify the workstation; no local hostname is claimed.

## Historical core-baseline coverage checklist — ten completed criteria

A checked item means its baseline observations are evidenced **and/or the remaining inspection limits are explicitly documented**. It never means inaccessible layers or future behavior are proven.

- [x] **Scope and provenance:** local workstation plus remote login environment; primary UTC/Asia-Bangkok capture window and separately timestamped QA follow-up; evidence links; probe errors and redaction boundaries. Sources: main §2, E1–E8.
- [x] **Access:** exact SSH user/alias/address/port; effective settings, read/include provenance and known-hosts paths; tested noninteractive execution and `publickey` authentication; presented/stored fingerprint continuity distinguished from original identity assurance. Sources: E1, E5, E8.
- [x] **Identity and boundaries:** macOS product/build/kernel/hardware; remote OS/kernel/user/groups/PID 1; Docker-style marker/mount/cgroup evidence; KVM observation and unavailable host/cloud/namespace details. Sources: E1–E3.
- [x] **Compute:** CPU counts, memory/swap/load/activity; local memory-pressure metric caveats; remote host-visible versus visible-ancestor/child accounting; no claims of sustained health or guaranteed allocation. Sources: E1–E3, E7.
- [x] **Storage:** APFS shared capacity and inodes; remote overlay/mount/block-device inventory and relevant path metadata; durability, encryption and backup recovery explicitly unknown. Sources: E1–E3, E5.
- [x] **Networking:** local/remote addresses and routes, observed local resolution and selected resolver configuration, remote resolver configuration, listener addresses/protocols and visibility limits; no public-reachability or unaudited protocol claims. Other local resolver domains intentionally excluded. Sources: E1–E4, E8.
- [x] **Runtime:** safe name-only process inventory plus parentage; bounded script/port/flag attribution; source-derived roles qualified as static capability/intent; packages/tool versions and visible startup/scheduler metadata. Sources: E1, E3, E4, E7.
- [x] **Security posture (observational):** local built-in control states; remote identity/capabilities, SSH/key-file modes, failed `sshd -T`, Chrome flag, VNC/bridge boundaries, log modes and firewall-tool availability; unknown effective policy/isolation remains explicit. Sources: E1, E2, E4, E5, E7.
- [x] **Operations:** time configuration and unverified synchronization, log metadata, backup/scheduler visibility, limited localhost health results, safe refresh commands and owner follow-ups; backup success, restores and end-to-end health are not asserted. Sources: E1–E4, E6, E7.
- [x] **Artifact QA:** relative links resolve; captures are nonempty/readable; package count and derived numbers verified; collector syntax passes and recorded execution includes failures; sensitive-content review described below. Reviewed artifact scope excludes `.omx` runtime/session logs.

Evidence shorthand follows the main report: [E1 local](evidence/local-workstation.txt), [E2 remote baseline](evidence/remote-system.txt), [E3 boundaries](evidence/remote-boundaries.txt), [E4 services](evidence/remote-services.txt), [E5 SSH](evidence/ssh-verification.txt), [E6 collector execution](evidence/remote-refresh-test.txt), [E7 explicit availability](evidence/remote-availability-verification.txt), [E8 local DNS/SSH provenance](evidence/local-resolution-verification.txt).

## Core numerical and claim checks previously performed

- Recalculated APFS capacity: **460.4317207 GiB total**, **22.5166206 GiB free**, **4.8903278% free**. Main rounding is correct. Root/Data repeated capacities are not added.
- Recalculated ancestor cgroup charge: **2.6793785–2.7133751 GiB**, limit **16 GiB**. The `free` figure is not represented as exclusive container consumption. Ancestor quota `800000/100000` equals 8 CPU equivalents; child `max` does not remove ancestor constraints.
- Verified **962 distinct installed-package rows**, matching the second inventory's declared total and below its 1,600-row cap; first inventory is correctly labeled incomplete.
- Matched local process/launchd/app/receipt/package counts, CPU/memory/swap values, OS/tool versions and firewall/control statuses to E1. Historical last-exit fields and overlapping software counts are not summed into misleading totals.
- Matched every main listener row to bind/owner output and safe PID/script/port associations. In particular: VNC is loopback; 6080/6081 are IPv4 wildcard; exec `*` notation is preserved without a dual-stack guarantee; TCP 2375/26500/50052 and UDP 3128 are unclassified; TCP/UDP 53 owner and UDP 51820 association remain limited.
- Matched E8 SSH config-read paths and selected resolver blocks (`1.1.1.1` default, `100.97.255.254` supplemental for `oracle.netbird`) to the new main-document explanation; it does not claim a `HostName` IP rewrite or packet trace.
- Matched service Node versus shell Node versions, startup metadata, major helper roles, log modes, actual Chrome `--no-sandbox` correction, and router decision source. Code names/flags are not treated as tested authentication or restart guarantees.
- Verified health outcomes: 1340 `/health` returned HTTP 200/JSON; five other listed paths returned 404. Main report correctly avoids equating 404 with daemon failure or 200 with full application health.
- Verified Time Machine has two configured targets, no active backup at capture, no returned latest timestamp, and sanitized code-17 mount failure. Remote empty `/var/backups`, missing PATH tools and cookie/session helpers do not become “no backups exist” or restore-success claims.
- At the core-baseline checkpoint, checked all relative Markdown file links in the main document, both detailed appendices and this audit; all resolved. Verified the then-current [SHA256SUMS](evidence/SHA256SUMS): eight core captures and the collector matched their stored hashes. The manifest has since expanded; current recorded QA is distinguished below. Hashes support later change detection, not independent authenticity. Evidence files were nonempty. Re-ran `bash -n scripts/remote-system-snapshot.sh` successfully; E6 retains actual collector output and final SSH exit 0 with individual errors preserved.
- Inspected retained output shape and ran narrow value-pattern checks over report/evidence documents for private-key armor, JWT-shaped values, common API-token formats and credential-bearing HTTP URLs: **no matches**. Safe process/source metadata contains identifiers/flag names rather than token values. This is not proof that every conceivable sensitive string is detectable; internal IPs, paths, versions and fingerprints remain intentionally present, and human review before public sharing remains necessary.

## Delivered core collector: state and remaining limits

The collector now checks that `timeout` exists, includes safe process/service-manager inventory, prints cgroup membership/mount context and readable member/ancestor values, and attempts each available firewall CLI rather than only the first. The original missing coverage is supplemented by E1/E4/E7. The main report correctly says this collector refreshes the **remote core baseline**, not every local/service/source/package observation.

Wrapped probes have 15-second timeouts; fixed procfs/cgroup reads are not all wrapped. `run()` preserves per-probe errors and continues, so SSH/script exit 0 is not universal probe success. `sshd -T` failure and incomplete per-connection policy remain explicit. Future non-root cgroup-mount layouts need interpretation against mount context; the script is not a universal effective-limit calculator. No installer, scheduler, service restart or privilege escalation is included.

## Expanded static Grok Bot documentation coverage

These checks concern documented/installed source and bounded interface observations, not successful chat operation.

- [x] **Distinct identities:** DNS label `grokbot1`, Linux hostname `cursor`, product Grok Bot, native bundle identity and app-managed agent IDs remain separate. The current native app's selected computer/agent has not been linked to the SSH box by live evidence.
- [x] **Installed native bundle:** version/build **0.44.0**, `com.anysphere.sand`, macOS minimum 12.0, package entrypoint, 34,485,800-byte archive and 478 indexed files match E10. Bundle hashes are artifact identities, not versions for every remote component.
- [x] **Native versus remote architecture:** N1/N8–N12 support startup stages, private renderer/preload/coordinator communication and host-facing wiring. E9 supports remote gateway/backend/extension context. Source presence is not proof of activation or an observed live conversation trace.
- [x] **User-facing navigation and feature boundaries:** shipped documentation supports settings, per-agent pane, computer preview and conditional UI features. Native declaration supports eight navigation/configuration/integration routes, not a prompt-send route. The 2048 constant is now correctly limited to retained bot-template metadata; global `xW` remains unresolved rather than assumed.
- [x] **Internal/developer API boundaries:** remote `sendPrompt` schema requires prompt and agent ID; none was invoked during static discovery. The later authorized one-request gateway test is separately verified below; no broad transcript/event stream was opened. Bearer comparison and the Origin/Host helper are static evidence; helper invocation/effective policy remains unverified. Host-header checking is not loopback-peer confinement. Developer IPC requires unpackaged status **and** capability flag; developer HTTP has a distinct unpackaged-status gate. Neither is presented as a production chat API.
- [x] **CLI/skill/tmux coverage:** remote per-command PATH results, Oracle skill installer metadata and one bash tmux pane do not become a chat CLI, registered Oracle contact or confirmed bot recipient. Native missing `bin`/AppleScript declarations do not rule out generic OS accessibility. E12 separately verifies the two checked local contacts files are absent, local `maw` exists, and `maw ls` returned zero filtered Grok matches; this is not an exhaustive search of every possible registry/alias.
- [x] **Recovery documentation:** shipped descriptions distinguish native update, computer replacement keeping files/logins but requiring software reinstall, and snapshot reset risking unsynchronized work. None was exercised; runtime/container markers do not prove provider topology, persistence or a successful restore.
- [x] **Draft behavior:** D1–D13 support per-agent versus shared `sand:new-chat` keys, normal key-change save/restore, distinct prompt/placeholder props and an already-open New Chat no-op. This is not a crash-durability test or proof that the live 16 characters are user-authored. Unknown/nonempty contents are conservatively preserved.

Sources: [remote interface appendix](grokbot-interface-findings.md), [E9](evidence/grokbot-interface.txt), [native appendix](grokbot-native-findings.md), [E10](evidence/grokbot-native.txt), [E12 local routing](evidence/grokbot-routing-verification.txt), main sections 14–15.

## Verified conversation, instructions and ongoing local retrospective

- [x] **Historical UI attempt preserved:** E11 records AppleScript invalid-index **-1719**, trusted native AX access and New chat AXPress result **0** at **01:53:33 UTC**. The composer stayed **16 characters** before/after. Neither the action nor the source-defined draft lifecycle was misrepresented as message delivery; no native draft was overwritten.
- [x] **Later authorized route and named recipient:** the user explicitly authorized remote gateway credential/profile lookup, API submission and read-only SQLite verification, required NetBird DNS and named **OMX Proxy**. Preparation selects exactly one matching profile and pins UUID `cfecd8d4-bbe9-43e0-ba9c-606b3bd460d3`. The computer DNS name remains `grokbot1`, not the agent's name.
- [x] **One correlated prompt submitted and persisted:** E14 at **02:08:41 UTC** records prior maximum rowid **8** and **zero existing marker rows**. E15 contains one before-POST event with the exact prompt, followed by HTTP **200**, `accepted: true`, for the pinned ID and marker `DOC_NETBIRD_OMX_PROXY_20260908_0208`. E16 confirms the exact same prompt persisted at new **row 9**, with that marker as `clientNonce`.
- [x] **Actual bot output recorded:** E16 at **02:09:21 UTC** records a later **row 11**, `kind="send-message"`, sharing request ID `137c3f05-943c-47f6-8bcf-c5b275217188` with row 9. Its text identifies OMX Proxy and includes the exact marker; `contentTruncated=false`. This is not an old echo, user row, unrelated request or generic tool output. The bot's role description remains self-report.
- [x] **Runnable NetBird instructions:** the runbook uses `box@grokbot1`, with `box@grokbot1.oracle.netbird` as the explicit FQDN alternative. The shell wrapper quotes arguments using `shlex.join`, streams the helper to remote Python stdin, and retains strict SSH key checking. Preparation, one-shot send, same-marker verification, bounded polling, uncertain-delivery handling and safe resume are documented without embedding a token.
- [x] **Ongoing local `/rrr` updated:** the retrospective and lesson record the authorized change of approach, pinned recipient, exact successful reply and revised next steps. The correction distinguishes a stable observed active UUID from its changed profile name; earlier read-only preparation of `test` did not send a message. Prior pending-UI entries remain chronological history, not the current outcome.

Sources: [E14 preparation](evidence/grokbot-omx-proxy-prepare.json), [E15 exact prompt/send](evidence/grokbot-omx-proxy-send.jsonl), [E16 correlated transcript result](evidence/grokbot-omx-proxy-verify.json), [NetBird runbook](grokbot-gateway-runbook.md), [live retrospective](../ψ/memory/retrospectives/2026-09/08/08.45_system-and-grokbot-live.md), [lesson](../ψ/memory/learnings/2026-09-08_system-boundaries-and-bot-conversation.md).

**Ancillary external sync:** Oracle `arra_learn` remains unavailable in the recorded workflow; no successful invocation or external receipt exists. This is a disclosed capability limitation, not a fabricated sync success. Local retrospective/lesson saving fulfills the user's ongoing local-writing request; this review does not turn unavailable external synchronization into an unrelated permanent blocker.

### Gateway helper correctness and safety review

The [helper](../scripts/grokbot-gateway.py) matches the captured workflow:

1. **Credential confinement:** reads the gateway token remotely, refuses empty/tokenless fallback, fixes HTTP destination to remote `127.0.0.1` using the configured port, and disables environment proxies and redirects. Errors emit type/status only, not headers, token or response bodies. Credential values are absent from the retained proof records.
2. **Recipient control:** exact-name preparation must produce one match; UUID parsing constrains agent-path selection; send rechecks the pinned profile name. Health's active ID is context, not the recipient selector. Profile names changed during discovery, so historical names must not replace the prepared ID/name pair.
3. **One-shot submission:** `send` has one POST call and no retry path. It checks marker presence first and preserves uncertainty if acknowledgement fails. This is one POST per invocation, **not atomic exactly-once delivery**; concurrent invocations or blind retries are not made safe by the precheck.
4. **Read-only transcript access:** SQLite uses URI `mode=ro` and `PRAGMA query_only=ON`. Column-name checks are not complete schema/type validation. Verification fetches up to **1001 rows to detect overflow**, refuses more than **1000 new rows**, finds one marker-bearing user record, and emits only later supported bot-output entries with the same request ID. The row bound is not a byte bound.
5. **Interpretation limits:** helper status `reply_recorded` alone does not guarantee marker compliance, nonstreaming completion or nontruncation; inspect those fields/content as the runbook requires. The actual retained OMX Proxy reply contains the marker and is nontruncated. Recorded output does not establish native UI rendering, all model/tool activity, an independently verified bot capability set, or future API compatibility.
6. **No unnecessary state changes:** the token was not copied to the workstation; the helper was streamed rather than installed remotely; the SQLite verification does not modify transcript records; native draft contents were not replaced. The POST intentionally changes conversation state and may consume usage, as authorized.

[Ten retained synthetic tests](grokbot-gateway-tests.txt) match the [test source](../scripts/test-grokbot-gateway.py): request/row ordering, old/unrelated/tool-output rejection, missing/ambiguous prompt cases, missing request ID, truncation, marker validation, redirect rejection and read-only SQLite behavior. These local tests do not make live requests. They are useful supporting checks, not exhaustive tests of HTTP failures, all future schemas or exactly-once behavior.

### Latest retained mechanical QA and final evidence boundary

The [QA record](documentation-qa.txt) inspected at **2026-09-08T02:20:09.927291+00:00** reports **PASS**: **10 Markdown files, 133 links, 18 timestamped evidence files, 20 checksum entries**, 962 complete package rows, collector syntax/execution checks and **live OMX Proxy conversation proof=true**. These are checkpoint counts; this audit edit can change link counts, so the linked record should be refreshed after final document edits. No further live send or network probe is needed.

The reviewed verifier now includes `.txt`, `.json` and `.jsonl` evidence in timestamp checks, sensitive-pattern scanning and required checksum coverage, and requires both the core collector and gateway helper in the manifest. Its live-proof checks correlate preparation, exactly one retained send/result pair, named target, ID, marker, watermark, exact prompt, client nonce, request ID and a later nontruncated, nonstreaming-marked reply containing the marker. This closes the former text-only QA coverage gap.

The semantic audit independently matched the actual proof fields rather than using a green QA result as sole evidence. No blocking inconsistency remains in the reviewed requested deliverables. Source-only architecture, host/cloud limits, untested recovery and unavailable external Oracle sync remain explicit; none is incorrectly presented as verified by the conversation. Hashes and narrow scans support artifact integrity/review, not independent authenticity or a guarantee that every conceivable secret can be detected.

## Historical initial-report audit (superseded)

The following table describes the initial 103-line report, now retained under `history/`, before the evidence-backed rewrite. These corrections are resolved by replacement, new evidence or an explicit uncertainty boundary in the final document.


| Existing claim | Required correction / evidence |
| --- | --- |
| Darwin `25.3.0` is the macOS build | Separate kernel release (`uname`) from macOS product version/build (`sw_vers`). Verify the hostname rather than using “likely.” |
| APFS root is “mostly empty” while Data is near capacity | APFS volumes can share container capacity. Report each `df` observation and shared-container free space without adding capacities or implying independent root headroom. Capacity alone does not establish an urgent storage problem. |
| Memory pressure is moderate; CPU idle is significant | Give measured values and timestamps. Physical memory “used,” free memory, compressed memory, and memory pressure are different measures. One snapshot cannot establish persistent pressure or overall health. |
| Public-key authentication / fingerprint check succeeded | Attribute these to retained SSH diagnostics, if available. Successful login alone does not prove the authentication method. Accepting a key into `known_hosts` is trust-on-first-use, not independent host-identity verification. |
| Debian `13.6` | Retain only version fields supported by `/etc/os-release` or another explicitly identified file; distinguish OS release from kernel release. |
| “Exposed” ports and DNS service ownership | Listener addresses/ports are not proof of remote or public reachability, protocol identity, ownership, authentication, or firewall policy. Show bind addresses, family, protocol and visibility limits. Correlate service names only with supporting evidence. |
| `docker` CLI is not installed | “Not found on this user's PATH” is what command failure establishes; it does not prove no Docker daemon, host containers, or installation elsewhere. |
| `systemctl` unavailable means system is not booted with systemd | Distinguish a missing executable from a present executable failing because PID 1 is not systemd. Verify PID 1. |
| Remote environment is definitively a container | Overlay filesystem and runtime processes are clues. Identify direct evidence (PID 1, namespaces, cgroup, container markers), distinguish inference, and avoid conclusions about the underlying host/cloud. |
| User home is “large” because it has many directories | Directory count/names demonstrate tooling footprint, not byte usage or activity. State observed names only, unless bounded size measurements exist. |
| No local blocking issues / functioning key-based trust path | Narrow to the successful tested SSH path at capture time; this is not a network, firewall or key-trust audit. |
| Runtime services are “persistent” | Running now or long process uptime does not establish restart behavior or durable storage. Document persistence as unverified unless configuration or an authorized test establishes it. |

## Stop lines / non-goals


The original read-only system baseline did **not** require privilege escalation, broad filesystem crawling, service disruption/restart, package installation, port scanning, authentication testing, reading secrets/private keys/browser cookies, or accessing unrelated systems. The later user-authorized gateway workflow was a separate, explicitly bounded exception for remote credential use, one prompt and scoped transcript verification; it did not authorize broader secret inspection or arbitrary RPCs. No restart/reboot test means durable state and recovery remain unverified. No host/cloud administrative view means underlying host inventory, tenant isolation, cloud firewall policy, backups, and provider guarantees remain unknown. Document these limitations rather than asserting absence or expanding into intrusive tests.
