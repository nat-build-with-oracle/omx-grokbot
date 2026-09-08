# Local macOS workstation findings

Initial capture **2026-09-08 01:17:44–01:18:36 UTC** (**08:17:44–08:18:36 Asia/Bangkok**); runtime/startup/backup supplement at **01:21–01:22 UTC** (**08:21–08:22 local**). All observations below refer to these snapshots, not continuous monitoring. Source: [sanitized command evidence](evidence/local-workstation.txt).

## Scope and method

Nonprivileged inventory/status checks covered OS/hardware, resource usage, APFS capacity, interfaces/routing, listening/bound sockets, effective SSH settings, existing host-key fingerprints, selected tool versions, workspace inventory, startup metadata, backup status, and built-in security controls. No software was installed, and no settings, trust entries, or services were deliberately changed. `memory_pressure -Q` was a query, not a stress test. A Time Machine latest-backup query implicitly attempted to mount a configured backup destination and failed; that limitation is recorded below. Serial numbers, UUIDs, MAC addresses, raw public/private keys, process arguments, environment variables, broad home-directory listings, backup destination details, and outbound peer lists are absent from the saved evidence.

No `AGENTS.md` was present at `/`, `/Users`, `/Users/nat`, or this workspace when checked. The workspace is not inside a Git worktree (`git rev-parse` returned exit 128).

## Platform

| Item | Observed value |
|---|---|
| Product | macOS **26.3.1 (a)** |
| Product build | **25D771280a** |
| Kernel | Darwin **25.3.0** |
| Hardware model / architecture | Mac16,12 / arm64 |
| CPU | Apple M4, 10 physical and logical CPUs |
| Physical memory | 17,179,869,184 bytes = **16 GiB** |
| Uptime | 1 day, 10 hours, 22 minutes |

The Darwin kernel version is not the macOS product version or build number. The earlier report conflated these fields; this table replaces that interpretation.

## Resource snapshot

- Initial 1/5/15-minute load averages: **9.00 / 5.50 / 3.88**; the later `top` sample reported **9.57 / 6.11 / 4.19**.
- The later aggregate CPU sample reported **25.25% user, 28.74% system, 45.99% idle**. This single sample does not establish sustained CPU saturation.
- `top` reported **792 processes**, including 3 running, 1 stuck, and 788 sleeping. No process-level diagnostics were performed; the one stuck process was not identified.
- `top` reported approximately **15G used**, **131M unused**, and **4240M compressor** memory. Low unused memory alone is not a pressure diagnosis.
- Encrypted swap allocation was **3072.00M total**, **1686.19M used**, **1385.81M free**.
- `memory_pressure -Q` reported **49% system-wide memory free percentage**; this is that tool's metric, not the same as the raw free-page or `top` unused-memory figure. The OS pressure-level sysctl returned **1**; no threshold mapping was separately audited.
- VM counters are cumulative since boot. This capture does not establish a paging rate, leak, or sustained pressure trend. The earlier report's “moderate pressure” assessment was not sufficiently supported and should not be carried forward as a diagnosis.

### Later bounded process census

At 01:21 UTC, `ps` observed **807 processes**: 161 root-owned, 512 owned by the current user, and 134 under other UIDs. The evidence retains only PID, numeric UID, CPU percentage, RSS, and executable basename for the top ten by CPU and RSS—not command lines.

- The highest sampled `ps` CPU values were `wezterm-gui` **71.5%**, `opendirectoryd` **19.4%**, and `WindowServer` **18.7%**. These per-process values are not the same metric/window as the earlier whole-system `top` sample and should not be directly subtracted from its idle percentage.
- The highest individual RSS was a Chrome renderer at **661,376 KiB (~646 MiB)**. Other high-RSS entries included browser renderers, a communication-app renderer, the terminal, and Codex.
- This is neither an exhaustive application inventory nor evidence that those programs caused a fault. RSS values are not added into an asserted total physical-memory footprint, because process accounting can include shared mappings.

## APFS storage: shared capacity matters

Both `/` (`disk3s3s1`) and `/System/Volumes/Data` (`disk3s1`) belong to **APFS container `disk3`**:

| Measure | Observed value |
|---|---|
| Container capacity | 494,384,795,648 bytes = **460.43 GiB** |
| Container free | 24,177,037,312 bytes = **22.52 GiB** |
| Free / allocated fraction | **4.89% free / 95.11% allocated** (calculated from container counters) |
| Root snapshot `df` usage | **17 GiB used**, **23 GiB available** (rounded) |
| Data volume `df` usage | **398 GiB used**, **23 GiB available**, **95% capacity** (rounded) |

These volumes share the same free capacity. Their repeated 460 GiB `df` sizes must not be added, and the small root snapshot's used size does **not** mean that the machine has a mostly empty independent system disk. `diskutil` per-volume `FreeSpace: 0` is not interpreted as no container space; its explicit `APFSContainerFree` field supplies the relevant shared capacity.

**Operational concern:** approximately 22.5 GiB remains in the main shared container. Capacity ownership, purgeable space, snapshots, backup retention, and safe cleanup candidates were not investigated. No data was removed.

Other APFS containers were reported, but their roles were not investigated; see the selected container counters in the evidence rather than assuming they are additional usable storage.

## Network and SSH access path

| Item | Observed value |
|---|---|
| Active LAN IPv4 | `en0`, **192.168.1.12/24** |
| Default route | **192.168.1.1**, interface `en0` |
| Overlay-addressed interface | `utun100`, **100.97.232.195** |
| Target resolution | `grokbot1` resolves to **grokbot1.oracle.netbird**, **100.97.63.219** |
| Route to target IP | Interface **utun100** |
| Effective short-name SSH target | User **box**, hostname **grokbot1**, TCP **22** |
| Effective FQDN SSH target | User **box**, hostname **grokbot1.oracle.netbird**, TCP **22** |
| Effective host-key policy | `StrictHostKeyChecking ask`, `CheckHostIP no` |
| Effective forwarding mechanism | No `ProxyCommand` or `ProxyJump` shown |

The effective configuration does not rewrite either hostname to the numeric IP. Current evidence supports **DNS resolution plus the overlay route**, not a claim that a `HostName` alias in an SSH configuration file performs the mapping. This local baseline did not inspect NetBird ACLs, DNS administration, remote access rules, or external reachability.

Existing short-name and fully qualified entries in the user's default known-hosts file have the same ED25519 fingerprint:

```text
SHA256:rOpANPu0hrBNtNs1K7+txaffZkm7f6qUVY07600O2wI
```

The numeric IP lookup found no entry in that default file (lookup exit 1; fingerprinting empty input subsequently failed). These are **stored trust records**, not an independent out-of-band identity attestation or proof of a current successful login. Main-document remote checks must provide fresh connection/authentication evidence. No host keys were added or changed by this baseline.

### Current-user-visible local sockets

`lsof` ran without elevated privileges, so this is a **visibility-limited inventory**, not proof that no other system-owned sockets exist. Duplicate file descriptors/address families are consolidated below. A wildcard bind is not proof of LAN, overlay, or Internet reachability.

| TCP bind scope | Port(s) | Reported executable |
|---|---|---|
| Wildcard `*` | 51869, 56398, 56399 | `rapportd` |
| Wildcard `*` | 5000, 7000 | `ControlCenter` |
| Wildcard `*` | 3283 | `ARDAgent` |
| Wildcard `*` | 47778 | `bun` |
| Loopback `127.0.0.1` | 1883, 9001 | `mosquitto` |
| Loopback `127.0.0.1` | 8900 | `bun` |
| Loopback `127.0.0.1` | 6463 | `Discord Helper (Renderer)` |

UDP evidence records local endpoints only; connected-peer suffixes were stripped. Observed wildcard ports included 3283 (`ARDAgent`), 3722 (`rapportd`), 5353 (browser helpers), a sharing-service port, and several mosh-client ports. Some sockets had no fixed port shown. Local IPv6 address text was redacted. No protocol probing, authentication check, or local firewall/overlay reachability test was performed, and the purpose of the wildcard Bun service is not established by an executable name alone.

## Built-in security configuration

| Control | Nonprivileged query result |
|---|---|
| System Integrity Protection | **Enabled** |
| FileVault | **On** |
| Gatekeeper | **Assessments enabled** |
| macOS Application Firewall | **Disabled (state 0)** |

These status results are not a full security audit. The application firewall being disabled does not prove that a service is reachable from the Internet; other host, LAN, router, or overlay controls were not assessed. **Interpretation:** disabled application filtering alongside wildcard listeners warrants confirmation of intended inbound policy, not a conclusion that an exploit or public exposure exists. Detailed firewall rules, endpoint protection, update compliance, MDM policy, and recovery controls were outside this bounded local baseline. No security setting was modified.

## Startup and backup metadata

The current user's `launchctl list` reported **520 jobs**, **248 with running PIDs**, **495 `com.apple.*` labels**, and **25 other labels**. **169 had a nonzero last-exit-status field**; that historical field does not prove that 169 services are currently failing. Infrastructure-related sampled labels included the NetBird client, `com.openssh.ssh-agent`, and `Oracle Pulse` (the latter had no running PID). No job was started, stopped, enabled, disabled, or reconfigured.

On-disk `.plist` counts, without reading arguments or environments:

| Location | File count |
|---|---:|
| `/System/Library/LaunchDaemons` | 422 |
| `/System/Library/LaunchAgents` | 460 |
| `/Library/LaunchDaemons` | 10 |
| `/Library/LaunchAgents` | 10 |
| User `Library/LaunchAgents` | 25 |

These counts are not equivalent to loaded jobs; the system launchd domain and every startup mechanism were not enumerated.

Time Machine reported **two configured backup destinations: one Local, one Network**. Destination names, URLs, paths, and IDs were excluded. `tmutil status` reported **Running = 0** (no active backup at the sample).

**Latest backup is unverified.** `tmutil latestbackup` returned exit 0 but no timestamp/output, with stderr reporting **backupd ErrorDomain code 17, “Failed to mount backup destination.”** Consequently, command exit status alone would falsely imply success. A configured destination does not establish a recent usable backup. No mount command, backup run, restore, pruning, or destination change was requested; the status query's implicit mount attempt failed. Other backup products and restore testing were not examined.

## Tooling and workspace

| Tool | Observed version / caveat |
|---|---|
| SSH | OpenSSH **10.2p1**, LibreSSL **3.3.6** |
| Git | **2.53.0** |
| Python | **3.14.3** |
| Bun | **1.3.14** |
| NetBird CLI | **0.77.1** |
| OMX | oh-my-codex **0.21.3**, reports its Node.js **24.3.0** |
| Node in explicit login shell | **22.20.0**, selected through nvm |

The initial Python-subprocess invocation of `node --version` resolved to a Bun-provided wrapper and failed with “Missing script to execute”; a separate `zsh -lc` selected nvm's real Node 22.20.0 and successfully reported `process.version`. OMX reported Node 24.3.0. Consequently, **there is no single validated global Node version**: command context and launcher affect executable selection. A full PATH dump was intentionally not captured.

Installed metadata counts: **83 top-level `.app` bundles in `/Applications`**, **1 in the user's `Applications`**, **206 installer package receipts**, **319 Homebrew formulae**, and **13 Homebrew casks**. These populations overlap; they must not be summed into a unique software count. Nested apps, versions of all packages, unmanaged binaries, and actual usage history were not inventoried.

The workspace initially contained the earlier report and `.omx` runtime state. By the evidence inventory it also contained the concurrently created `docs/evidence/` captures and `scripts/remote-system-snapshot.sh`; size was **96 KiB at that moment**. Inventory and size are not final-deliverable counts because other agents were writing concurrently. This document is an infrastructure baseline, not a source-code audit or full application inventory.

## Boundaries and outstanding owner decisions

1. Determine storage growth and reclaimable capacity before choosing any cleanup action; preserve backups and snapshots until their ownership is understood.
2. Confirm whether the disabled macOS Application Firewall is intentional and what controls provide the intended inbound policy; this scan cannot infer that policy.
3. Choose an explicit Node runtime/launcher for reproducible automation rather than relying on context-dependent command resolution.
4. Use multi-sample telemetry if resource-pressure or capacity trends are needed. No periodic collection was installed.
5. Independently verify the SSH fingerprint with the host owner if stronger identity assurance is required; matching existing records is narrower evidence.
6. Establish the latest successful backup timestamp and restoreability when the configured destination is available; current evidence proves configuration, not backup freshness.

The earlier report's broad home-directory descriptions were not revalidated or expanded here to avoid collecting unrelated personal information. The bounded process census supersedes general impressions about active local software without inspecting arguments or content. Remote infrastructure and service findings are owned by the main exploration workflow.
